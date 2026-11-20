import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { killTree, listeningPorts, portOpen, type Usage } from './system.ts'
import type { Level, LogLine, ServiceConfig, Status } from './types.ts'

const MAX_LINES = 5000
const READY_TIMEOUT = 120_000

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g
export const stripAnsi = (s: string) => s.replace(ANSI, '')

const STACK = /^\s+at\s|^\s+File ".+", line \d+|^\s*\^+\s*$/
const NO_ERRORS = /\b(0|no) (errors?|warnings?|problems?)\b/i
const ERROR = /\b(error|errors|err!|exception|fatal|panic|uncaught|unhandled|failed|traceback)\b|\b[A-Z]\w*(Error|Exception)\b|[✖✘⨯]/i
const WARN = /\b(warn|warning|deprecated)\b|⚠/i
const DEBUG = /\b(debug|verbose|trace)\b/i

export function levelOf(text: string): Level {
  const t = stripAnsi(text)
  if (STACK.test(t)) return 'error'
  if (NO_ERRORS.test(t)) return 'info'
  if (ERROR.test(t)) return 'error'
  if (WARN.test(t)) return 'warn'
  if (DEBUG.test(t)) return 'debug'
  return 'info'
}

const URL_PORT = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d{2,5})\b/
const WORD_PORT = /\b(?:listening|running|started|ready|serving)\b.*?\bport\s*:?\s*(\d{2,5})\b/i

export function portFrom(text: string): number | undefined {
  const plain = stripAnsi(text)
  const m = URL_PORT.exec(plain) ?? WORD_PORT.exec(plain)
  return m ? Number(m[1]) : undefined
}

type Stream = 'out' | 'err'

export class ServiceProcess extends EventEmitter {
  cfg: ServiceConfig
  root: string
  env: () => Record<string, string>
  child?: ChildProcess
  status: Status = 'idle'
  startedAt?: number
  exitCode?: number | null
  detectedPort?: number
  needsRestart = false
  conflict?: { port: number; pid?: number; command?: string }
  usage?: Usage
  crashes = 0
  overrides: string[] = []
  logs: LogLine[] = []

  private seq = 0
  private launching = false
  private stopping = false
  private restarts = 0
  private healthTimer?: NodeJS.Timeout
  private restartTimer?: NodeJS.Timeout
  private watchTimer?: NodeJS.Timeout
  private watchers: fs.FSWatcher[] = []
  private partial: Record<Stream, string> = { out: '', err: '' }
  private flushTimers: Partial<Record<Stream, NodeJS.Timeout>> = {}
  private waiters: { resolve: () => void; reject: (e: Error) => void }[] = []

  constructor(cfg: ServiceConfig, root: string, env: () => Record<string, string>) {
    super()
    this.cfg = cfg
    this.root = root
    this.env = env
  }

  get cwd() {
    return path.resolve(this.root, this.cfg.cwd || '.')
  }

  get port() {
    const h = this.cfg.health
    return this.cfg.port ?? (h?.type === 'tcp' ? h.port : undefined) ?? this.detectedPort
  }

  get running() {
    return !!this.child
  }

  snapshot() {
    return {
      id: this.cfg.id,
      status: this.status,
      pid: this.child?.pid,
      port: this.port,
      startedAt: this.child ? this.startedAt : undefined,
      exitCode: this.exitCode,
      crashes: this.crashes,
      needsRestart: this.needsRestart,
      conflict: this.conflict,
      cwd: this.cwd,
      overrides: this.overrides,
    }
  }

  async start(): Promise<void> {
    if (this.child || this.launching) return
    this.launching = true
    try {
      clearTimeout(this.restartTimer)
      this.conflict = undefined
      this.exitCode = undefined
      this.detectedPort = undefined
      this.needsRestart = false
      this.stopping = false
      this.setStatus('starting')

      const cwd = this.cwd
      if (!fs.existsSync(cwd)) return this.fail(`Directory not found: ${cwd}`)
      const port = this.cfg.port
      if (port && (await portOpen(port))) {
        const owner = (await listeningPorts()).find((p) => p.port === port)
        this.conflict = { port, pid: owner?.pid, command: owner?.command }
        return this.fail(`Port ${port} is already in use${owner ? ` by ${owner.command} (pid ${owner.pid})` : ''}`)
      }

      let env: Record<string, string>
      try {
        env = this.env()
      } catch (e) {
        return this.fail((e as Error).message)
      }
      const command = this.cfg.pre ? `${this.cfg.pre} && ${this.cfg.command}` : this.cfg.command
      this.sys(`$ ${command}`)
      const child = spawn(command, {
        cwd,
        shell: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, FORCE_COLOR: '1', ...(port ? { PORT: String(port) } : {}), ...env },
      })
      this.child = child
      this.startedAt = Date.now()
      this.pipe(child.stdout!, 'out')
      this.pipe(child.stderr!, 'err')
      child.on('error', (e) => this.sys(e.message, 'error'))
      child.on('exit', (code, signal) => this.onExit(child, code, signal))
      this.watch()
      this.emitStatus()
      this.healthLoop()
    } finally {
      this.launching = false
    }
  }

  stop(): Promise<void> {
    clearTimeout(this.restartTimer)
    const child = this.child
    if (!child?.pid) {
      if (this.status === 'starting' || this.restartTimer) this.setStatus('stopped')
      return Promise.resolve()
    }
    this.stopping = true
    this.setStatus('stopping')
    return new Promise((resolve) => {
      const force = setTimeout(() => {
        this.sys('Did not exit after 5s, sending SIGKILL', 'warn')
        killTree(child.pid!, 'SIGKILL')
      }, 5000)
      child.once('exit', () => {
        clearTimeout(force)
        resolve()
      })
      killTree(child.pid!, 'SIGTERM')
    })
  }

  async restart() {
    await this.stop()
    await this.start()
  }

  ready(): Promise<void> {
    if (this.status === 'running' || this.status === 'unhealthy') return Promise.resolve()
    if (!this.child && !this.launching) return Promise.reject(new Error(`${this.cfg.name} is not running`))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.cfg.name} was not ready after ${READY_TIMEOUT / 1000}s`)), READY_TIMEOUT)
      this.waiters.push({
        resolve: () => (clearTimeout(timer), resolve()),
        reject: (e) => (clearTimeout(timer), reject(e)),
      })
    })
  }

  markRestart() {
    if (!this.child || this.needsRestart) return
    this.needsRestart = true
    this.emitStatus()
  }

  clearLogs() {
    this.logs = []
  }

  sys(text: string, lvl: Level = 'info') {
    this.add('sys', text, lvl)
  }

  private fail(message: string) {
    this.sys(message, 'error')
    this.setStatus('crashed')
  }

  private onExit(child: ChildProcess, code: number | null, signal: NodeJS.Signals | null) {
    if (this.child !== child) return
    this.flush('out')
    this.flush('err')
    clearTimeout(this.healthTimer)
    this.unwatch()
    this.child = undefined
    this.exitCode = code
    this.usage = undefined
    // Reap anything the shell left behind so it can't keep holding the port.
    if (process.platform !== 'win32') killTree(child.pid!, 'SIGTERM')

    if (this.stopping) {
      this.sys('Stopped')
      return this.setStatus('stopped')
    }
    if (Date.now() - (this.startedAt ?? 0) > 30_000) this.restarts = 0
    if (code !== 0) this.crashes++
    this.sys(signal ? `Killed by ${signal}` : `Exited with code ${code}`, code === 0 ? 'info' : 'error')
    this.setStatus(code === 0 ? 'stopped' : 'crashed')
    if (this.cfg.autoRestart && code !== 0) {
      const delay = Math.min(30_000, 1000 * 2 ** this.restarts++)
      this.sys(`Restarting in ${delay / 1000}s`, 'warn')
      this.restartTimer = setTimeout(() => {
        this.restartTimer = undefined
        this.start()
      }, delay)
    }
  }

  private async probe(): Promise<boolean | null> {
    const h = this.cfg.health
    if (h?.type === 'none') return null
    if (h?.type === 'http' && h.url) {
      return fetch(h.url, { signal: AbortSignal.timeout(2000) }).then(
        (r) => r.status < 500,
        () => false,
      )
    }
    return this.port ? portOpen(this.port) : null
  }

  private async healthLoop() {
    const child = this.child
    if (!child) return
    const ok = await this.probe()
    if (this.child !== child || this.stopping) return
    const graceOver = Date.now() - (this.startedAt ?? 0) > 1500
    if (ok === true || (ok === null && graceOver)) {
      if (this.status !== 'running') this.setStatus('running')
    } else if (ok === false && this.status === 'running') {
      this.setStatus('unhealthy')
    }
    this.healthTimer = setTimeout(() => this.healthLoop(), this.status === 'starting' ? 700 : 4000)
  }

  private watch() {
    for (const rel of this.cfg.watch ?? []) {
      try {
        const w = fs.watch(path.resolve(this.cwd, rel), { recursive: true }, (_, file) => {
          if (file && /(^|[/\\])(node_modules|\.git|dist|\.next)([/\\]|$)/.test(String(file))) return
          clearTimeout(this.watchTimer)
          this.watchTimer = setTimeout(() => {
            this.sys(`Change detected in ${file}, restarting`)
            this.restart()
          }, 300)
        })
        this.watchers.push(w)
      } catch (e) {
        this.sys(`Cannot watch ${rel}: ${(e as Error).message}`, 'warn')
      }
    }
  }

  private unwatch() {
    clearTimeout(this.watchTimer)
    for (const w of this.watchers) w.close()
    this.watchers = []
  }

  private pipe(stream: Readable, s: Stream) {
    stream.setEncoding('utf8')
    stream.on('data', (chunk: string) => {
      const parts = (this.partial[s] + chunk).split(/\r?\n/)
      this.partial[s] = parts.pop()!
      for (const p of parts) this.line(s, p)
      clearTimeout(this.flushTimers[s])
      if (this.partial[s]) this.flushTimers[s] = setTimeout(() => this.flush(s), 200)
    })
  }

  private flush(s: Stream) {
    clearTimeout(this.flushTimers[s])
    if (!this.partial[s]) return
    this.line(s, this.partial[s])
    this.partial[s] = ''
  }

  private line(s: Stream, raw: string) {
    // Keep only the final frame of \r-redrawn progress lines and drop clear-screen codes.
    const text = (raw.includes('\r') ? (raw.split('\r').filter(Boolean).at(-1) ?? '') : raw).replace(/\x1b\[[0-9;]*[HJ]|\x1bc/g, '')
    const blank = !stripAnsi(text).trim()
    if (blank && (!this.logs.length || !stripAnsi(this.logs.at(-1)!.text).trim())) return
    this.add(s, text, levelOf(text))
    if (!this.detectedPort && !this.cfg.port) {
      const port = portFrom(text)
      if (port) {
        this.detectedPort = port
        this.emitStatus()
      }
    }
  }

  private add(s: LogLine['s'], text: string, lvl: Level) {
    const line: LogLine = { seq: ++this.seq, t: Date.now(), s, text, lvl }
    this.logs.push(line)
    if (this.logs.length > MAX_LINES) this.logs = this.logs.slice(-(MAX_LINES - 500))
    this.emit('log', line)
  }

  private setStatus(status: Status) {
    this.status = status
    if (status === 'running') {
      for (const w of this.waiters.splice(0)) w.resolve()
    } else if (status === 'stopped' || status === 'crashed') {
      for (const w of this.waiters.splice(0)) w.reject(new Error(`${this.cfg.name} ${status}`))
    }
    this.emitStatus()
  }

  emitStatus() {
    this.emit('status', this.snapshot())
  }
}
