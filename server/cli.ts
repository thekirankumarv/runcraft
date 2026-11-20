import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'
import { stripAnsi } from './proc.ts'
import { HOME, loadToken } from './store.ts'
import { openBrowser } from './system.ts'
import type { LogLine, Status } from './types.ts'

export const COMMANDS = new Set(['status', 'start', 'stop', 'restart', 'logs'])

const COLORS: Record<Status, string> = {
  running: '\x1b[32m',
  unhealthy: '\x1b[33m',
  starting: '\x1b[33m',
  stopping: '\x1b[33m',
  crashed: '\x1b[31m',
  stopped: '\x1b[90m',
  idle: '\x1b[90m',
}
const tty = process.stdout.isTTY

function projectRoot() {
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'runcraft.json'))) return dir
    if (dir === path.dirname(dir)) return process.cwd()
  }
}

const expand = (p: string) => path.resolve(p.replace(/^~(?=$|[/\\])/, os.homedir()))

async function connect() {
  let port: number
  try {
    port = JSON.parse(fs.readFileSync(path.join(HOME, 'server.json'), 'utf8')).port
  } catch {
    return null
  }
  const token = loadToken()
  const base = `http://127.0.0.1:${port}`
  const api = async (method: string, url: string, body?: unknown) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', 'x-runcraft-token': token },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    return data
  }
  try {
    await api('GET', '/api/meta')
  } catch {
    return null
  }
  return { port, token, base, api }
}

export async function openInRunning(dir: string | undefined, noOpen: boolean) {
  const server = await connect()
  if (!server) return false
  let query = ''
  if (dir || fs.existsSync(path.join(process.cwd(), 'runcraft.json'))) {
    const { id } = await server.api('POST', '/api/projects', { root: expand(dir ?? '.') })
    query = `&project=${id}`
  }
  const url = `${server.base}/?t=${server.token}${query}`
  console.log(`\n  Runcraft is already running at ${url}\n`)
  if (!noOpen) openBrowser(url)
  return true
}

export async function run(cmd: string, args: string[]): Promise<number> {
  const server = await connect()
  if (!server) {
    console.error('Runcraft is not running. Start it with `runcraft` first.')
    return 1
  }
  const { port, token, api } = server

  try {
    const { id: pid } = await api('POST', '/api/projects', { root: projectRoot() })
    const state = await api('GET', `/api/p/${pid}`)
    const known = new Set<string>(state.config.services.map((s: { id: string }) => s.id))
    const unknown = args.filter((a) => !a.startsWith('-') && !known.has(a))
    if (unknown.length) throw new Error(`Unknown service: ${unknown.join(', ')}. Known: ${[...known].join(', ')}`)
    const ids = args.filter((a) => !a.startsWith('-'))

    if (cmd === 'status') {
      if (!state.services.length) console.log('No services configured. Open the dashboard to add some.')
      for (const s of state.services) {
        const name = state.config.services.find((c: { id: string }) => c.id === s.id)?.name ?? s.id
        const status = tty ? `${COLORS[s.status as Status]}${s.status}\x1b[0m` : s.status
        console.log(`${name.padEnd(20)} ${status.padEnd(tty ? 20 : 11)} ${s.port ? `:${s.port}` : ''}`)
      }
    } else if (cmd === 'start') {
      await api('POST', `/api/p/${pid}/start`, { ids: ids.length ? ids : undefined })
      console.log(`Starting ${ids.join(', ') || 'all services'}`)
    } else if (cmd === 'stop') {
      await api('POST', `/api/p/${pid}/stop`, { ids: ids.length ? ids : undefined })
      console.log(`Stopped ${ids.join(', ') || 'all services'}`)
    } else if (cmd === 'restart') {
      if (ids.length !== 1) throw new Error('Usage: runcraft restart <service>')
      await api('POST', `/api/p/${pid}/s/${ids[0]}/restart`)
      console.log(`Restarting ${ids[0]}`)
    } else if (cmd === 'logs') {
      if (ids.length !== 1) throw new Error('Usage: runcraft logs <service> [-f]')
      const print = (l: LogLine) => console.log(tty ? l.text : stripAnsi(l.text))
      const logs = await api('GET', `/api/p/${pid}/logs`)
      for (const l of (logs[ids[0]] as LogLine[]).slice(-200)) print(l)
      if (args.includes('-f') || args.includes('--follow')) {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?t=${encodeURIComponent(token)}`)
        ws.on('message', (data) => {
          for (const m of JSON.parse(String(data))) if (m.type === 'log' && m.project === pid && m.id === ids[0]) print(m.line)
        })
        await new Promise((resolve) => ws.on('close', resolve))
      }
    }
    return 0
  } catch (e) {
    console.error((e as Error).message)
    return 1
  }
}
