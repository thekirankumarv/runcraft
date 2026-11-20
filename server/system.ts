import { execFile, spawn } from 'node:child_process'
import net from 'node:net'
import { promisify } from 'node:util'

const run = promisify(execFile)
const isWindows = process.platform === 'win32'

export function killTree(pid: number, signal: NodeJS.Signals) {
  try {
    if (isWindows) spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }).on('error', () => {})
    else process.kill(-pid, signal)
  } catch {}
}

async function capture(cmd: string, args: string[]) {
  try {
    return (await run(cmd, args, { maxBuffer: 32 * 1024 * 1024, windowsHide: true })).stdout
  } catch (e) {
    const err = e as { code?: unknown; stdout?: string }
    if (err.code === 'ENOENT') throw e
    return err.stdout ?? ''
  }
}

export function openBrowser(url: string) {
  const [cmd, ...rest] = process.platform === 'darwin' ? ['open'] : isWindows ? ['rundll32', 'url.dll,FileProtocolHandler'] : ['xdg-open']
  spawn(cmd, [...rest, url], { stdio: 'ignore', detached: true })
    .on('error', () => {})
    .unref()
}

export interface Usage {
  cpu: number
  mem: number
}

interface Sample {
  pid: number
  ppid: number
  cpu: number
  mem: number
}

export function parsePs(stdout: string): Sample[] {
  const out: Sample[] = []
  for (const line of stdout.split('\n')) {
    const [pid, ppid, cpu, rss] = line.trim().split(/\s+/).map(Number)
    if (pid) out.push({ pid, ppid, cpu, mem: rss * 1024 })
  }
  return out
}

const WIN_PROCS =
  'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.WorkingSetSize) $($_.KernelModeTime + $_.UserModeTime)" }'
let lastWin: { at: number; ticks: Map<number, number> } | undefined

async function windowsSamples(): Promise<Sample[]> {
  const stdout = await capture('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WIN_PROCS])
  const at = Date.now()
  const ticks = new Map<number, number>()
  const out: Sample[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const [pid, ppid, mem, cpuTicks] = line.trim().split(/\s+/).map(Number)
    if (!pid) continue
    ticks.set(pid, cpuTicks)
    const prev = lastWin?.ticks.get(pid)
    const cpu = lastWin && prev !== undefined ? ((cpuTicks - prev) / 1e4 / (at - lastWin.at)) * 100 : 0
    out.push({ pid, ppid, cpu: Math.max(0, cpu), mem })
  }
  lastWin = { at, ticks }
  return out
}

export async function usageSampler(): Promise<(pid: number) => Usage> {
  const samples = isWindows ? await windowsSamples() : parsePs(await capture('ps', ['-A', '-o', 'pid=,ppid=,pcpu=,rss=']))
  const table = new Map(samples.map((s) => [s.pid, s]))
  const children = new Map<number, number[]>()
  for (const s of samples) if (s.ppid !== s.pid) children.set(s.ppid, [...(children.get(s.ppid) ?? []), s.pid])
  return (root) => {
    const total = { cpu: 0, mem: 0 }
    const seen = new Set<number>()
    const queue = [root]
    while (queue.length) {
      const pid = queue.pop()!
      if (seen.has(pid)) continue
      seen.add(pid)
      const p = table.get(pid)
      if (p) {
        total.cpu += p.cpu
        total.mem += p.mem
      }
      queue.push(...(children.get(pid) ?? []))
    }
    return total
  }
}

export interface PortInfo {
  port: number
  pid: number
  command: string
  address: string
}

function splitHostPort(value: string) {
  const i = value.lastIndexOf(':')
  return { address: value.slice(0, i), port: Number(value.slice(i + 1)) }
}

export function parseLsof(stdout: string): PortInfo[] {
  const out: PortInfo[] = []
  let pid = 0
  let command = ''
  for (const line of stdout.split('\n')) {
    const val = line.slice(1)
    if (line[0] === 'p') pid = Number(val)
    else if (line[0] === 'c') command = val
    else if (line[0] === 'n') out.push({ ...splitHostPort(val), pid, command })
  }
  return out
}

export function parseSs(stdout: string): PortInfo[] {
  const out: PortInfo[] = []
  for (const line of stdout.split('\n')) {
    const cols = line.trim().split(/\s+/)
    if (cols.length < 4) continue
    const local = cols[0] === 'LISTEN' ? cols[3] : cols[2]
    const user = /\("([^"]+)",pid=(\d+)/.exec(line)
    out.push({ ...splitHostPort(local), pid: user ? Number(user[2]) : 0, command: user?.[1] ?? '' })
  }
  return out.filter((p) => p.port)
}

export function parseNetstat(stdout: string, tasklist: string): PortInfo[] {
  const names = new Map<number, string>()
  for (const line of tasklist.split(/\r?\n/)) {
    const m = /^"([^"]*)","(\d+)"/.exec(line)
    if (m) names.set(Number(m[2]), m[1])
  }
  const out: PortInfo[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/)
    if (cols[0] !== 'TCP' || cols.length < 5 || !/^(0\.0\.0\.0|\[::\]):0$/.test(cols[2])) continue
    const pid = Number(cols.at(-1))
    out.push({ ...splitHostPort(cols[1]), pid, command: names.get(pid) ?? '' })
  }
  return out
}

async function unixPorts() {
  try {
    return parseLsof(await capture('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn']))
  } catch {
    return parseSs(await capture('ss', ['-ltnpH']).catch(() => ''))
  }
}

async function windowsPorts() {
  const [netstat, tasks] = await Promise.all([capture('netstat', ['-ano']), capture('tasklist', ['/fo', 'csv', '/nh']).catch(() => '')])
  return parseNetstat(netstat, tasks)
}

export async function listeningPorts(): Promise<PortInfo[]> {
  const all = await (isWindows ? windowsPorts() : unixPorts()).catch(() => [])
  const out: PortInfo[] = []
  for (const p of all) if (!out.some((o) => o.port === p.port && o.pid === p.pid)) out.push(p)
  return out.sort((a, b) => a.port - b.port)
}

export function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: 'localhost' })
    const done = (ok: boolean) => {
      socket.destroy()
      resolve(ok)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.setTimeout(1000, () => done(false))
  })
}
