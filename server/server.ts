import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { detect, packageManager } from './detect.ts'
import { readEnvFile, writeEnvFile } from './env.ts'
import { gitBranches, gitCommit, gitDiff, gitPull, gitPush, gitStage, gitStatus, gitSwitch, within, writeRepoFile } from './git.ts'
import { trafficSink } from './proc.ts'
import { ConfigError, Project } from './project.ts'
import { HOME, listProjects, listTemplates, loadToken, projectId, saveProjects, saveTemplates, VERSION } from './store.ts'
import { killTree, listeningPorts, openBrowser, usageSampler } from './system.ts'

const pty = await import('@lydell/node-pty').catch(() => null)

interface TermSession {
  pid: string
  term: { write(d: string): void; resize(c: number, r: number): void; kill(): void }
  buf: string
  sockets: Set<WebSocket>
  idle?: NodeJS.Timeout
}
const terminals = new Map<string, TermSession>()
const TERM_BUFFER = 100_000
const TERM_IDLE_MS = 10 * 60_000

const args = process.argv.slice(2)
const opt = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const DEV = args.includes('--dev')
const SERVER_FILE = path.join(HOME, 'server.json')
const TOKEN = loadToken()
const TRAFFIC_TOKEN = crypto.randomBytes(18).toString('base64url')
const TRAFFIC_ROUTE = /^\/api\/p\/[^/]+\/s\/[^/]+\/traffic$/
const dirArg = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '--port')
const WEB = [path.join(import.meta.dirname, '../web'), path.join(import.meta.dirname, '../dist/web')].find((d) => fs.existsSync(path.join(d, 'index.html')))

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const open = new Map<string, Project>()
const expand = (p: string) => path.resolve(p.replace(/^~(?=$|\/)/, os.homedir()))
const looksLikeProject = (dir: string) =>
  ['runcraft.json', 'package.json', '.git', 'Procfile', 'go.mod', 'Cargo.toml', 'manage.py'].some((f) => fs.existsSync(path.join(dir, f)))

function addProject(root: string) {
  const list = listProjects().filter((p) => p.root !== root)
  saveProjects([{ root, lastOpened: Date.now() }, ...list])
}

function project(id: string): Project {
  const existing = open.get(id)
  if (existing) return existing
  const entry = listProjects().find((p) => projectId(p.root) === id)
  if (!entry) throw new HttpError(404, 'Unknown project')
  if (!fs.existsSync(entry.root)) throw new HttpError(404, `Folder no longer exists: ${entry.root}`)
  const p = new Project(entry.root, broadcast)
  open.set(id, p)
  return p
}

function service(p: Project, id: string) {
  const proc = p.procs.get(id)
  if (!proc) throw new HttpError(404, `Unknown service: ${id}`)
  return proc
}

const startProject = dirArg ? expand(dirArg) : looksLikeProject(process.cwd()) ? process.cwd() : undefined
if (startProject) addProject(startProject)

const sockets = new Set<WebSocket>()
let queue: unknown[] = []

// Batches messages so chatty services don't flood the socket.
function broadcast(msg: Record<string, unknown>) {
  if (!sockets.size) return
  if (!queue.length) {
    setTimeout(() => {
      const data = JSON.stringify(queue)
      queue = []
      for (const ws of sockets) ws.send(data)
    }, 40)
  }
  queue.push(msg)
}

let sampling = false
setInterval(async () => {
  const live = [...open.values()].filter((p) => [...p.procs.values()].some((s) => s.child?.pid))
  if (!live.length || sampling) return
  sampling = true
  const usage = await usageSampler().catch(() => null)
  sampling = false
  if (!usage) return
  for (const p of live) {
    const data: Record<string, unknown> = {}
    for (const [id, s] of p.procs) if (s.child?.pid) data[id] = s.usage = usage(s.child.pid)
    broadcast({ type: 'stats', project: p.id, data })
  }
}, 2000)

type Ctx = { body: any; url: URL; params: Record<string, string>; client?: string }
const routes: { method: string; re: RegExp; keys: string[]; fn: (c: Ctx) => unknown }[] = []
function route(method: string, pattern: string, fn: (c: Ctx) => unknown) {
  const keys: string[] = []
  const re = new RegExp(
    '^' +
      pattern.replace(/:(\w+)/g, (_, k) => {
        keys.push(k)
        return '([^/]+)'
      }) +
      '$',
  )
  routes.push({ method, re, keys, fn })
}

const projectInfo = (root: string) => {
  const id = projectId(root)
  const p = open.get(id)
  let name = path.basename(root)
  try {
    name = JSON.parse(fs.readFileSync(path.join(root, 'runcraft.json'), 'utf8')).name || name
  } catch {}
  return { id, root, name, exists: fs.existsSync(root), running: p ? [...p.procs.values()].filter((s) => s.running).length : 0 }
}

route('GET', '/api/meta', () => ({
  version: VERSION,
  platform: process.platform,
  home: os.homedir(),
  startProject: startProject && projectId(startProject),
}))

route('GET', '/api/projects', () => listProjects().map((p) => projectInfo(p.root)))

route('POST', '/api/projects', ({ body }) => {
  const root = expand(String(body.root ?? ''))
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) throw new HttpError(400, `Not a folder: ${root}`)
  addProject(root)
  return projectInfo(root)
})

route('DELETE', '/api/projects/:pid', async ({ params }) => {
  const p = open.get(params.pid)
  if (p) {
    await p.stopMany()
    p.close()
  }
  open.delete(params.pid)
  saveProjects(listProjects().filter((e) => projectId(e.root) !== params.pid))
  return { ok: true }
})

route('GET', '/api/fs', ({ url }) => {
  const dir = expand(url.searchParams.get('path') || os.homedir())
  const dirs = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => ({ name: d.name, path: path.join(dir, d.name) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { path: dir, parent: path.dirname(dir), dirs, isProject: looksLikeProject(dir) }
})

route('GET', '/api/p/:pid', ({ params }) => {
  const p = project(params.pid)
  addProject(p.root)
  return p.snapshot()
})

route('GET', '/api/p/:pid/terminals', ({ params }) => [...terminals].filter(([, t]) => t.pid === params.pid).map(([id]) => id))

route('DELETE', '/api/p/:pid/terminals/:id', ({ params }) => {
  const t = terminals.get(params.id)
  if (t?.pid === params.pid) t.term.kill()
})

route('PUT', '/api/p/:pid/config', ({ params, body, client }) => {
  project(params.pid).save(body, client)
  return { ok: true }
})

route('PUT', '/api/p/:pid/local', ({ params, body }) => {
  const p = project(params.pid)
  p.saveLocal({ envProfile: body.envProfile, editor: body.editor })
  if (body.ignore) p.ignoreLocal()
  return { ok: true, gitignoresLocal: p.gitignoresLocal }
})

route('GET', '/api/templates', () => listTemplates())

route('POST', '/api/templates', ({ body }) => {
  if (!body?.name || !body?.command) throw new HttpError(400, 'Template needs a name and command')
  const { id: _id, position: _pos, dependsOn: _deps, requests: _req, env: _env, ...rest } = body
  const key = `user-${String(body.name)
    .toLowerCase()
    .replace(/[^\w]+/g, '-')}`
  saveTemplates([...listTemplates().filter((t) => t.key !== key), { ...rest, key, hint: body.hint || body.command }])
  return { ok: true, key }
})

route('DELETE', '/api/templates/:key', ({ params }) => {
  saveTemplates(listTemplates().filter((t) => t.key !== params.key))
  return { ok: true }
})

route('GET', '/api/p/:pid/detect', ({ params }) => detect(project(params.pid).root))

route('GET', '/api/p/:pid/logs', ({ params }) => Object.fromEntries([...project(params.pid).procs].map(([id, s]) => [id, s.logs])))

route('GET', '/api/p/:pid/s/:sid/traffic', ({ params }) => service(project(params.pid), params.sid).traffic)

route('POST', '/api/p/:pid/s/:sid/traffic', ({ params, body }) => {
  if (Array.isArray(body)) service(project(params.pid), params.sid).addTraffic(body.slice(0, 200))
  return { ok: true }
})

route('DELETE', '/api/p/:pid/s/:sid/traffic', ({ params }) => {
  service(project(params.pid), params.sid).traffic = []
  return { ok: true }
})

route('POST', '/api/p/:pid/start', ({ params, body }) => {
  project(params.pid).startMany(body.ids)
  return { ok: true }
})

route('POST', '/api/p/:pid/stop', async ({ params, body }) => {
  await project(params.pid).stopMany(body.ids)
  return { ok: true }
})

route('POST', '/api/p/:pid/s/:sid/:action', async ({ params }) => {
  const p = project(params.pid)
  const s = service(p, params.sid)
  if (params.action === 'start') p.startMany([s.cfg.id])
  else if (params.action === 'stop') await s.stop()
  else if (params.action === 'restart') s.restart()
  else if (params.action === 'clear') s.clearLogs()
  else throw new HttpError(404, 'Unknown action')
  return { ok: true }
})

route('GET', '/api/p/:pid/s/:sid/env', ({ params }) => {
  const p = project(params.pid)
  const s = service(p, params.sid)
  const file = p.envTargetPath(s.cfg)
  const base = p.envFilePath(s.cfg)
  return {
    file,
    exists: !!file && fs.existsSync(file),
    vars: file ? readEnvFile(file) : (s.cfg.env ?? {}),
    inherited: base && base !== file ? readEnvFile(base) : undefined,
    profile: p.local.envProfile,
  }
})

route('PUT', '/api/p/:pid/s/:sid/env', ({ params, body, client }) => {
  const p = project(params.pid)
  const s = service(p, params.sid)
  const vars = body.vars as Record<string, string>
  const file = p.envTargetPath(s.cfg)
  const profile = p.local.envProfile
  if (file && profile && p.config.lockedEnvs?.includes(profile))
    throw new HttpError(403, `The ${profile} profile is locked. Unlock it in Settings to edit its values.`)
  if (file) {
    writeEnvFile(file, vars)
    p.envChanged(file)
  } else {
    p.save({ ...p.config, services: p.config.services.map((c) => (c.id === s.cfg.id ? { ...c, env: vars } : c)) }, client)
  }
  return { ok: true }
})

route('GET', '/api/p/:pid/git', async ({ params }) => (await gitStatus(project(params.pid).root)) ?? { root: null, files: [] })

route('POST', '/api/p/:pid/git/stage', ({ params, body }) => gitStage(project(params.pid).root, body.files ?? [], body.staged !== false))
route('POST', '/api/p/:pid/git/commit', ({ params, body }) => gitCommit(project(params.pid).root, String(body.message ?? ''), !!body.all))
route('POST', '/api/p/:pid/git/push', ({ params, body }) => gitPush(project(params.pid).root, !!body.upstream))
route('POST', '/api/p/:pid/git/pull', ({ params }) => gitPull(project(params.pid).root))
route('GET', '/api/p/:pid/git/branches', ({ params }) => gitBranches(project(params.pid).root))
route('POST', '/api/p/:pid/git/switch', ({ params, body }) => gitSwitch(project(params.pid).root, String(body.branch ?? '')))

route('GET', '/api/p/:pid/scripts', ({ params }) => {
  const p = project(params.pid)
  const dirs = new Map<string, string[]>([['.', ['Project']]])
  for (const s of p.config.services) {
    const rel = path.normalize(s.cwd || '.')
    if (rel !== '.') dirs.set(rel, [...(dirs.get(rel) ?? []), s.name])
  }
  return [...dirs].flatMap(([cwd, names]) => {
    let scripts: Record<string, string> = {}
    try {
      scripts = JSON.parse(fs.readFileSync(path.join(p.root, cwd, 'package.json'), 'utf8')).scripts ?? {}
    } catch {}
    const runner = packageManager(p.root, path.join(p.root, cwd))
    const list = Object.entries(scripts).map(([name, script]) => ({ name, script, command: `${runner} ${name}` }))
    return list.length ? [{ label: names.join(', '), cwd, scripts: list }] : []
  })
})

route('GET', '/api/p/:pid/git/diff', ({ params, url }) => gitDiff(project(params.pid).root, url.searchParams.get('path') ?? ''))

route('PUT', '/api/p/:pid/git/file', async ({ params, body }) => {
  await writeRepoFile(project(params.pid).root, body.path, body.content)
  return { ok: true }
})

route('GET', '/api/ports', async () => {
  const ports = await listeningPorts()
  const owners = new Map<number, { project: string; service: string }>()
  const byPort = new Map<number, { project: string; service: string }>()
  for (const p of open.values())
    for (const [id, s] of p.procs) {
      if (!s.child?.pid) continue
      owners.set(s.child.pid, { project: p.id, service: id })
      if (s.port) byPort.set(s.port, { project: p.id, service: id })
    }
  return ports.map((port) => ({ ...port, owner: owners.get(port.pid) ?? byPort.get(port.port) }))
})

route('POST', '/api/ports/kill', ({ body }) => {
  const pid = Number(body.pid)
  if (!pid || pid === process.pid) throw new HttpError(400, 'Invalid pid')
  try {
    process.kill(pid, 'SIGTERM')
    setTimeout(() => killTree(pid, 'SIGKILL'), 3000)
  } catch (e) {
    throw new HttpError(400, (e as Error).message)
  }
  return { ok: true }
})

route('POST', '/api/http', async ({ body }) => {
  const started = performance.now()
  const method = String(body.method || 'GET').toUpperCase()
  const res = await fetch(body.url, {
    method,
    headers: body.headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body.body,
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  })
  const text = await res.text()
  return {
    status: res.status,
    statusText: res.statusText,
    headers: Object.fromEntries(res.headers),
    body: text.slice(0, 2_000_000),
    size: text.length,
    ms: Math.round(performance.now() - started),
  }
})

let port = Number(opt('--port') ?? 4949)
const origins = () => new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...(DEV ? ['http://localhost:4951', 'http://127.0.0.1:4951'] : [])])

// Blocks DNS rebinding and cross-site requests: only our own host/origin with the token gets through.
function trusted(req: http.IncomingMessage, url: URL) {
  const host = req.headers.host ?? ''
  if (!origins().has(`http://${host}`)) return false
  if (req.headers.origin && !origins().has(req.headers.origin)) return false
  const given = String(req.headers['x-runcraft-token'] ?? url.searchParams.get('t') ?? '')
  return given.length === TOKEN.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(TOKEN))
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  if (!WEB) {
    res.writeHead(404).end('UI not built. Run `pnpm build` or use `pnpm dev`.')
    return
  }
  let file = path.join(WEB, path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ''))
  if (!file.startsWith(WEB + path.sep) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) file = path.join(WEB, 'index.html')
  const isIndex = file.endsWith('index.html')
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    'cache-control': isIndex ? 'no-cache' : 'public, max-age=31536000, immutable',
    'x-frame-options': 'DENY',
  })
  fs.createReadStream(file).pipe(res)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  if (!url.pathname.startsWith('/api/')) {
    if (!origins().has(`http://${req.headers.host}`)) return res.writeHead(403).end()
    return serveStatic(req, res, url)
  }
  const fromHook = req.method === 'POST' && TRAFFIC_ROUTE.test(url.pathname) && req.headers['x-runcraft-token'] === TRAFFIC_TOKEN
  if (!fromHook && !trusted(req, url)) return res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"Unauthorized"}')
  return dispatch(req, res, url)
})

async function dispatch(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const match = routes.find((r) => r.method === req.method && r.re.test(url.pathname))
  const send = (status: number, data: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data ?? null))
  if (!match) return send(404, { error: 'Not found' })
  try {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const values = match.re.exec(url.pathname)!.slice(1)
    const params = Object.fromEntries(match.keys.map((k, i) => [k, decodeURIComponent(values[i])]))
    send(200, await match.fn({ body: raw ? JSON.parse(raw) : {}, url, params, client: req.headers['x-runcraft-client'] as string | undefined }))
  } catch (e) {
    const status = e instanceof HttpError ? e.status : e instanceof ConfigError ? 400 : 500
    send(status, { error: (e as Error).message })
  }
}

// Phone view: an opt-in second listener on the LAN with its own token and a small allowlist (no terminals, git, env or proxy).
const PHONE_ROUTES = [/^GET \/api\/projects$/, /^GET \/api\/p\/[^/]+$/, /^GET \/api\/p\/[^/]+\/logs$/, /^POST \/api\/p\/[^/]+\/s\/[^/]+\/(start|stop|restart)$/]
const PHONE_PAGE = path.join(import.meta.dirname, 'phone.html')
let phone: { server: http.Server; token: string; url: string; sockets: Set<WebSocket> } | undefined

function lanAddress() {
  const all = Object.entries(os.networkInterfaces()).flatMap(([name, list]) => (list ?? []).map((a) => ({ ...a, name })))
  const v4 = all.filter((a) => a.family === 'IPv4' && !a.internal)
  return (v4.find((a) => /^(en|wl|eth)/.test(a.name)) ?? v4[0])?.address
}

function phoneTrusted(req: http.IncomingMessage, url: URL) {
  if (!phone) return false
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return false
  const given = String(url.searchParams.get('t') ?? req.headers['x-runcraft-token'] ?? '')
  return given.length === phone.token.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(phone.token))
}

function startPhone(): Promise<typeof phone> {
  const ip = lanAddress()
  if (!ip) throw new HttpError(400, 'No Wi-Fi or network connection found')
  const token = crypto.randomBytes(18).toString('base64url')
  const s = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (!url.pathname.startsWith('/api/')) {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-frame-options': 'DENY',
        'referrer-policy': 'no-referrer',
      })
      return fs.createReadStream(PHONE_PAGE).pipe(res)
    }
    if (!phoneTrusted(req, url)) return res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"Unauthorized"}')
    if (!PHONE_ROUTES.some((r) => r.test(`${req.method} ${url.pathname}`)))
      return res.writeHead(403, { 'content-type': 'application/json' }).end('{"error":"Not available on phone"}')
    dispatch(req, res, url)
  })
  s.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (url.pathname !== '/ws' || !phoneTrusted(req, url)) return socket.destroy()
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.add(ws)
      phone?.sockets.add(ws)
      ws.on('close', () => sockets.delete(ws))
    })
  })
  return new Promise((resolve, reject) => {
    s.once('error', reject)
    s.listen(0, '0.0.0.0', () => {
      const { port } = s.address() as { port: number }
      phone = { server: s, token, url: `http://${ip}:${port}/?t=${token}`, sockets: new Set() }
      resolve(phone)
    })
  })
}

route('GET', '/api/phone', () => ({ on: !!phone, url: phone?.url }))

route('POST', '/api/phone', async ({ body }) => {
  if (body.on && !phone) await startPhone()
  if (!body.on && phone) {
    for (const ws of phone.sockets) ws.terminate()
    phone.server.closeAllConnections()
    phone.server.close()
    phone = undefined
  }
  return { on: !!phone, url: phone?.url }
})

function spawnTerminal(id: string, pid: string, url: URL) {
  const root = project(pid).root
  if (!pty) throw new Error('Terminal is not supported on this platform')
  const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/sh')
  const term = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: Number(url.searchParams.get('cols')) || 80,
    rows: Number(url.searchParams.get('rows')) || 24,
    cwd: within(root, url.searchParams.get('cwd') || '.'),
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>,
  })
  const cmd = url.searchParams.get('cmd')
  if (cmd) term.write(cmd + '\r')
  const session: TermSession = { pid, term, buf: '', sockets: new Set() }
  terminals.set(id, session)
  term.onData((d) => {
    session.buf = (session.buf + d).slice(-TERM_BUFFER)
    for (const ws of session.sockets) ws.send(d)
  })
  term.onExit(() => {
    terminals.delete(id)
    clearTimeout(session.idle)
    for (const ws of session.sockets) ws.close(4000, 'Process exited')
  })
  return session
}

function openTerminal(ws: WebSocket, url: URL) {
  const id = url.searchParams.get('id') ?? ''
  const pid = url.searchParams.get('p') ?? ''
  let session = terminals.get(id)
  if (!id || (session && session.pid !== pid)) return ws.close(4004, 'Unknown terminal')
  if (!session) {
    try {
      session = spawnTerminal(id, pid, url)
    } catch (e) {
      return ws.close(4004, (e as Error).message.slice(0, 100))
    }
  } else if (session.buf) ws.send(session.buf)
  const s = session
  clearTimeout(s.idle)
  s.sockets.add(ws)
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw))
      if (msg.t === 'i' && typeof msg.d === 'string') s.term.write(msg.d)
      else if (msg.t === 'r' && Number.isInteger(msg.cols) && Number.isInteger(msg.rows)) s.term.resize(Math.max(1, msg.cols), Math.max(1, msg.rows))
      else if (msg.t === 'kill') s.term.kill()
    } catch {}
  })
  ws.on('close', () => {
    s.sockets.delete(ws)
    if (!s.sockets.size && terminals.has(id)) s.idle = setTimeout(() => s.term.kill(), TERM_IDLE_MS)
  })
}

const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x')
  if (!trusted(req, url)) return socket.destroy()
  if (url.pathname === '/ws/term') return wss.handleUpgrade(req, socket, head, (ws) => openTerminal(ws, url))
  if (url.pathname !== '/ws') return socket.destroy()
  wss.handleUpgrade(req, socket, head, (ws) => {
    sockets.add(ws)
    ws.on('close', () => sockets.delete(ws))
  })
})

server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE' && !opt('--port') && port < 4960) return server.listen(++port, '127.0.0.1')
  console.error(e.message)
  process.exit(1)
})

server.listen(port, '127.0.0.1', () => {
  const url = `http://${DEV ? 'localhost:4951' : `127.0.0.1:${port}`}/?t=${TOKEN}`
  fs.writeFileSync(SERVER_FILE, JSON.stringify({ port, pid: process.pid }))
  Object.assign(trafficSink, { url: `http://127.0.0.1:${port}`, token: TRAFFIC_TOKEN })
  console.log(`\n  Runcraft is running at ${url}\n`)
  if (!args.includes('--no-open')) openBrowser(url)
})

let closing = false
async function shutdown() {
  if (closing) process.exit(1)
  closing = true
  const running = [...open.values()].some((p) => [...p.procs.values()].some((s) => s.running))
  if (running) console.log('\n  Stopping services…')
  await Promise.race([Promise.all([...open.values()].map((p) => p.stopMany())), new Promise((r) => setTimeout(r, 8000))])
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
process.on('SIGHUP', shutdown)
process.on('exit', () => {
  try {
    if (JSON.parse(fs.readFileSync(SERVER_FILE, 'utf8')).pid === process.pid) fs.rmSync(SERVER_FILE)
  } catch {}
  for (const p of open.values()) for (const s of p.procs.values()) if (s.child?.pid) killTree(s.child.pid, 'SIGKILL')
  for (const t of terminals.values()) t.term.kill()
})
