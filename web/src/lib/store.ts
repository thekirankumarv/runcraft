import { toast } from 'sonner'
import { create } from 'zustand'
import { api, clientId } from './api'
import type { Level, LocalConfig, LogLine, ProjectConfig, ProjectInfo, SavedRequest, ServiceConfig, ServiceState, TrafficEntry, Usage } from './types'

const MAX_LINES = 5000
const HISTORY = 40

export type View = 'canvas' | 'overview' | 'terminal' | 'logs' | 'problems' | 'git' | 'ports' | 'settings'
export type Tab = 'logs' | 'env' | 'traffic' | 'http' | 'settings'

interface State {
  ready: boolean
  authError: boolean
  connected: boolean
  projects: ProjectInfo[]
  pid?: string
  root?: string
  configExists: boolean
  config?: ProjectConfig
  local: LocalConfig
  gitignoresLocal: boolean
  services: Record<string, ServiceState>
  logs: Record<string, LogLine[]>
  traffic: Record<string, TrafficEntry[]>
  httpDraft?: SavedRequest
  history: Record<string, number[]>
  selected?: string
  view: View
  tab: Tab
  logFilter?: Level | 'all'
  dialog?: 'add' | 'choose' | 'folder' | 'palette'
  termRequest?: TermRequest
}

export interface TermRequest {
  title?: string
  cwd?: string
  cmd?: string
  n: number
}

export const useStore = create<State>(() => ({
  ready: false,
  authError: false,
  connected: false,
  projects: [],
  configExists: false,
  local: {},
  gitignoresLocal: false,
  services: {},
  logs: {},
  traffic: {},
  history: {},
  view: 'canvas',
  tab: 'logs',
}))

const set = useStore.setState
const get = useStore.getState

let home = ''
export const setHome = (dir: string) => (home = dir)
export const tildify = (p = '') => (home && (p === home || p.startsWith(home + '/') || p.startsWith(home + '\\')) ? '~' + p.slice(home.length) : p)

export const svcName = (id: string) => get().config?.services.find((s) => s.id === id)?.name ?? id

export function fail(e: unknown) {
  toast.error((e as Error).message)
}

export async function loadProjects() {
  set({ projects: await api<ProjectInfo[]>('GET', '/api/projects') })
}

export async function openProject(pid: string) {
  const [snap, logs] = await Promise.all([api('GET', `/api/p/${pid}`), api<Record<string, LogLine[]>>('GET', `/api/p/${pid}/logs`)])
  try {
    localStorage.setItem('runcraft.project', pid)
  } catch {}
  set({
    pid,
    root: snap.root,
    configExists: snap.configExists,
    config: snap.config,
    local: snap.local,
    gitignoresLocal: snap.gitignoresLocal,
    services: Object.fromEntries(snap.services.map((s: ServiceState) => [s.id, s])),
    logs,
    history: {},
    selected: undefined,
  })
  loadProjects()
}

export async function addProject(root: string) {
  const info = await api<ProjectInfo>('POST', '/api/projects', { root })
  await openProject(info.id)
}

export async function removeProject(pid: string) {
  await api('DELETE', `/api/projects/${pid}`)
  await loadProjects()
  if (get().pid === pid) {
    const next = get().projects[0]
    if (next) await openProject(next.id)
    else set({ pid: undefined, config: undefined, services: {}, logs: {} })
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

export async function saveConfig(next: ProjectConfig, opts: { debounce?: boolean } = {}) {
  const prev = get().config
  set({ config: next })
  clearTimeout(saveTimer)
  const write = async () => {
    try {
      await api('PUT', `/api/p/${get().pid}/config`, next)
      set({ configExists: true })
      const snap = await api('GET', `/api/p/${get().pid}`)
      set((s) => ({ services: { ...Object.fromEntries(snap.services.map((x: ServiceState) => [x.id, { ...s.services[x.id], ...x }])) } }))
    } catch (e) {
      set({ config: prev })
      fail(e)
    }
  }
  if (opts.debounce) saveTimer = setTimeout(write, 500)
  else await write()
}

export function updateService(id: string, patch: Partial<ServiceConfig>, opts?: { debounce?: boolean }) {
  const cfg = get().config!
  return saveConfig({ ...cfg, services: cfg.services.map((s) => (s.id === id ? { ...s, ...patch } : s)) }, opts)
}

export async function addServices(services: ServiceConfig[]) {
  const cfg = get().config!
  await saveConfig({ ...cfg, services: [...cfg.services, ...services] })
}

export async function removeService(id: string) {
  const cfg = get().config!
  set({ selected: undefined })
  await saveConfig({
    ...cfg,
    services: cfg.services.filter((s) => s.id !== id).map((s) => ({ ...s, dependsOn: s.dependsOn?.filter((d) => d !== id) })),
    profiles: Object.fromEntries(Object.entries(cfg.profiles ?? {}).map(([k, v]) => [k, v.filter((d) => d !== id)])),
  })
}

export function uniqueId(name: string, taken = get().config?.services.map((s) => s.id) ?? []) {
  const base =
    name
      .toLowerCase()
      .replace(/[^\w-]+/g, '-')
      .replace(/^-|-$/g, '') || 'service'
  let id = base
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`
  return id
}

function askNotifications() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
}

export const startServices = (ids?: string[]) => {
  askNotifications()
  return api('POST', `/api/p/${get().pid}/start`, { ids }).catch(fail)
}
export const stopServices = (ids?: string[]) => api('POST', `/api/p/${get().pid}/stop`, { ids }).catch(fail)
export const serviceAction = (id: string, action: 'start' | 'stop' | 'restart' | 'clear') => {
  if (action === 'start') askNotifications()
  if (action === 'clear') set((s) => ({ logs: { ...s.logs, [id]: [] } }))
  return api('POST', `/api/p/${get().pid}/s/${id}/${action}`).catch(fail)
}

export async function killPortAndStart(id: string) {
  const pid = get().services[id]?.conflict?.pid
  if (pid) await api('POST', '/api/ports/kill', { pid }).catch(fail)
  setTimeout(() => serviceAction(id, 'start'), 600)
}

export const isLive = (s?: ServiceState) => !!s && ['starting', 'running', 'unhealthy', 'stopping'].includes(s.status)

function notify(id: string, title: string, text: string) {
  toast.error(title, { description: text })
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body: text })
}

export function handleMessages(msgs: any[]) {
  const { pid } = get()
  const logs: Record<string, LogLine[]> = {}
  const services: Record<string, ServiceState> = {}
  const usage: Record<string, Usage> = {}
  let config: ProjectConfig | undefined
  let local: LocalConfig | undefined
  const traffic: Record<string, TrafficEntry[]> = {}
  const resetTraffic = new Set<string>()
  for (const m of msgs) {
    if (m.project !== pid) {
      if (m.type === 'status') loadProjects()
      continue
    }
    if (m.type === 'log') (logs[m.id] ??= []).push(m.line)
    else if (m.type === 'traffic') (traffic[m.id] ??= []).push(...m.entries)
    else if (m.type === 'status') {
      const prev = services[m.service.id] ?? get().services[m.service.id]
      if (m.service.status === 'crashed' && prev?.status !== 'crashed') {
        const last = [...(get().logs[m.service.id] ?? []), ...(logs[m.service.id] ?? [])].findLast((l) => l.lvl === 'error')
        const title = m.service.exitCode === undefined ? `${svcName(m.service.id)} couldn't start` : `${svcName(m.service.id)} crashed`
        notify(m.service.id, title, last?.text.replace(/\x1b\[[0-9;]*m/g, '') ?? `Exited with code ${m.service.exitCode}`)
      }
      if (m.service.status === 'starting' && prev?.status !== 'starting') {
        resetTraffic.add(m.service.id)
        traffic[m.service.id] = []
      }
      services[m.service.id] = { usage: prev?.usage, overrides: prev?.overrides, ...m.service }
    } else if (m.type === 'stats') Object.assign(usage, m.data)
    else if (m.type === 'config' && m.from !== clientId) config = m.config
    else if (m.type === 'local') local = m.local
  }
  if (!Object.keys(logs).length && !Object.keys(services).length && !Object.keys(usage).length && !Object.keys(traffic).length && !config && !local) return
  set((s) => {
    const nextLogs = { ...s.logs }
    for (const [id, lines] of Object.entries(logs)) {
      const merged = [...(nextLogs[id] ?? []), ...lines]
      nextLogs[id] = merged.length > MAX_LINES ? merged.slice(-(MAX_LINES - 500)) : merged
    }
    const nextServices = { ...s.services, ...services }
    const history = { ...s.history }
    for (const [id, u] of Object.entries(usage)) {
      nextServices[id] = { ...nextServices[id], usage: u }
      history[id] = [...(history[id] ?? []), u.cpu].slice(-HISTORY)
    }
    const nextTraffic = { ...s.traffic }
    for (const [id, entries] of Object.entries(traffic)) {
      if (!nextTraffic[id]) continue
      const kept = resetTraffic.has(id) ? [] : nextTraffic[id]
      const last = kept.at(-1)?.seq ?? 0
      nextTraffic[id] = [...kept, ...entries.filter((e) => e.seq > last)].slice(-300)
    }
    return { logs: nextLogs, traffic: nextTraffic, services: nextServices, history, ...(config ? { config } : {}), ...(local ? { local } : {}) }
  })
}

export function openTerminal(req: Omit<TermRequest, 'n'> = {}) {
  set((s) => ({ view: 'terminal', termRequest: { ...req, n: (s.termRequest?.n ?? 0) + 1 } }))
}

let lastView: View = 'canvas'
export function toggleTerminal() {
  const { view } = get()
  if (view !== 'terminal') lastView = view
  set({ view: view === 'terminal' ? lastView : 'terminal' })
}

export function select(id: string | undefined, tab?: Tab) {
  set((s) => ({ selected: id, tab: tab ?? s.tab, view: 'canvas' }))
}

export async function saveLocal(patch: Partial<LocalConfig> & { ignore?: boolean }) {
  try {
    const res = await api('PUT', `/api/p/${get().pid}/local`, patch)
    const { ignore: _, ...rest } = patch
    set((s) => ({ local: { ...s.local, ...rest }, gitignoresLocal: res.gitignoresLocal }))
  } catch (e) {
    fail(e)
  }
}

export const editorUrl = (file: string, line?: number, col?: number) => {
  const scheme = get().local.editor || get().config?.editor || 'vscode'
  return `${scheme}://file${file.startsWith('/') ? '' : '/'}${file}${line ? `:${line}${col ? `:${col}` : ''}` : ''}`
}
