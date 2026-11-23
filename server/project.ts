import fs from 'node:fs'
import path from 'node:path'
import { readEnvFile } from './env.ts'
import { ServiceProcess } from './proc.ts'
import { projectId } from './store.ts'
import type { LocalConfig, ProjectConfig, ServiceConfig } from './types.ts'

export const CONFIG_FILE = 'runcraft.json'
export const LOCAL_FILE = 'runcraft.local.json'

type Emit = (msg: Record<string, unknown>) => void

export class ConfigError extends Error {}

// Order services so every dependency comes before its dependents; throws on cycles.
export function topoSort(services: Pick<ServiceConfig, 'id' | 'dependsOn'>[]): string[] {
  const byId = new Map(services.map((s) => [s.id, s]))
  const order: string[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (id: string, trail: string[]) => {
    if (state.get(id) === 'done') return
    if (state.get(id) === 'visiting') throw new ConfigError(`Dependency cycle: ${[...trail, id].join(' → ')}`)
    state.set(id, 'visiting')
    for (const dep of byId.get(id)?.dependsOn ?? []) if (byId.has(dep)) visit(dep, [...trail, id])
    state.set(id, 'done')
    order.push(id)
  }
  for (const s of services) visit(s.id, [])
  return order
}

export function validate(input: unknown): ProjectConfig {
  const cfg = input as ProjectConfig
  if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.services)) throw new ConfigError('Config needs a "services" array')
  const ids = new Set<string>()
  for (const s of cfg.services) {
    if (!s || typeof s.id !== 'string' || !/^[\w-]+$/.test(s.id)) throw new ConfigError(`Invalid service id: ${JSON.stringify(s?.id)}`)
    if (ids.has(s.id)) throw new ConfigError(`Duplicate service id: ${s.id}`)
    if (typeof s.command !== 'string' || !s.command.trim()) throw new ConfigError(`Service "${s.id}" needs a command`)
    ids.add(s.id)
    s.name ||= s.id
    s.cwd ||= '.'
  }
  for (const s of cfg.services) if (s.dependsOn) s.dependsOn = s.dependsOn.filter((d) => ids.has(d) && d !== s.id)
  topoSort(cfg.services)
  return { ...cfg, name: cfg.name || 'Untitled' }
}

const runtimeKey = (s: ServiceConfig) => JSON.stringify([s.command, s.cwd, s.pre, s.env, s.envFile, s.port, s.watch])

function readJSON<T>(file: string, fallback: T): T {
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return fallback
  }
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new ConfigError(`${file}: ${(e as Error).message}`)
  }
}

export class Project {
  id: string
  root: string
  config: ProjectConfig
  local: LocalConfig
  procs = new Map<string, ServiceProcess>()
  private emit: Emit
  private watcher?: fs.FSWatcher
  private reloadTimer?: NodeJS.Timeout

  constructor(root: string, emit: Emit) {
    this.root = root
    this.id = projectId(root)
    this.emit = emit
    this.config = this.read()
    this.local = readJSON<LocalConfig>(path.join(root, LOCAL_FILE), {})
    this.sync()
    try {
      this.watcher = fs.watch(root, (_, file) => {
        if (file !== CONFIG_FILE && file !== LOCAL_FILE) return
        clearTimeout(this.reloadTimer)
        this.reloadTimer = setTimeout(() => this.reload(), 150)
      })
    } catch {}
  }

  close() {
    clearTimeout(this.reloadTimer)
    this.watcher?.close()
  }

  // Picks up edits made outside Runcraft, such as in an editor or by git pull.
  private reload() {
    let config: ProjectConfig
    let local: LocalConfig
    try {
      config = this.read()
      local = readJSON<LocalConfig>(path.join(this.root, LOCAL_FILE), {})
    } catch {
      return
    }
    const configChanged = JSON.stringify(config) !== JSON.stringify(this.config)
    const localChanged = JSON.stringify(local) !== JSON.stringify(this.local)
    if (local.envProfile !== this.local.envProfile) for (const p of this.procs.values()) if (p.cfg.envFile) p.markRestart()
    this.config = config
    this.local = local
    if (configChanged || localChanged) this.sync()
    if (configChanged) this.emit({ type: 'config', project: this.id, config })
    if (localChanged) this.emit({ type: 'local', project: this.id, local })
  }

  get configPath() {
    return path.join(this.root, CONFIG_FILE)
  }

  get configExists() {
    return fs.existsSync(this.configPath)
  }

  read(): ProjectConfig {
    const raw = readJSON<ProjectConfig | null>(this.configPath, null)
    if (!raw) return { name: path.basename(this.root), services: [] }
    try {
      return validate(raw)
    } catch (e) {
      throw new ConfigError(`${this.configPath}: ${(e as Error).message}`)
    }
  }

  // Merges top-level keys into runcraft.local.json.
  saveLocal(patch: Partial<LocalConfig>) {
    const prevProfile = this.local.envProfile
    this.local = { ...this.local, ...patch }
    for (const [k, v] of Object.entries(this.local)) if (v === undefined || v === '') delete this.local[k as keyof LocalConfig]
    fs.writeFileSync(path.join(this.root, LOCAL_FILE), JSON.stringify(this.local, null, 2) + '\n')
    if (this.local.envProfile !== prevProfile) for (const p of this.procs.values()) if (p.cfg.envFile) p.markRestart()
    this.sync()
    this.emit({ type: 'local', project: this.id, local: this.local })
  }

  get gitignoresLocal() {
    try {
      return fs
        .readFileSync(path.join(this.root, '.gitignore'), 'utf8')
        .split('\n')
        .some((l) => l.trim().replace(/^\//, '') === LOCAL_FILE)
    } catch {
      return false
    }
  }

  ignoreLocal() {
    if (this.gitignoresLocal) return
    const file = path.join(this.root, '.gitignore')
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
    fs.writeFileSync(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}${LOCAL_FILE}\n`)
  }

  save(next: unknown, from?: string) {
    const cfg = validate(next)
    fs.writeFileSync(this.configPath, JSON.stringify(cfg, null, 2) + '\n')
    this.config = cfg
    this.sync()
    this.emit({ type: 'config', project: this.id, config: cfg, from })
  }

  envFilePath(s: ServiceConfig) {
    return s.envFile ? path.resolve(this.root, s.cwd || '.', s.envFile) : undefined
  }

  // With an env profile active, `.env.<profile>` is layered over the base file and receives edits.
  envTargetPath(s: ServiceConfig) {
    const base = this.envFilePath(s)
    return base && this.local.envProfile ? `${base}.${this.local.envProfile}` : base
  }

  envFor(s: ServiceConfig): Record<string, string> {
    const base = this.envFilePath(s)
    const target = this.envTargetPath(s)
    return { ...(base ? readEnvFile(base) : {}), ...(target && target !== base ? readEnvFile(target) : {}), ...s.env }
  }

  // Flag running services that read this env file so the UI can prompt a restart.
  envChanged(file: string) {
    for (const p of this.procs.values())
      if (this.envFilePath(p.cfg) === file || this.envTargetPath(p.cfg) === file) {
        p.markRestart()
        p.emitStatus()
      }
  }

  snapshot() {
    return {
      id: this.id,
      root: this.root,
      configExists: this.configExists,
      config: this.config,
      local: this.local,
      gitignoresLocal: this.gitignoresLocal,
      services: [...this.procs.values()].map((p) => ({ ...p.snapshot(), usage: p.usage })),
    }
  }

  private sync() {
    const wanted = new Map(this.config.services.map((s) => [s.id, s]))
    for (const [id, proc] of this.procs) {
      if (wanted.has(id)) continue
      proc.stop()
      proc.removeAllListeners()
      this.procs.delete(id)
    }
    for (const base of this.config.services) {
      const overrides = this.local.services?.[base.id] ?? {}
      const s = { ...base, ...overrides }
      const proc = this.procs.get(s.id)
      if (proc) {
        const changed = runtimeKey(proc.cfg) !== runtimeKey(s)
        const keys = Object.keys(overrides)
        const overridesChanged = keys.join() !== proc.overrides.join()
        proc.cfg = s
        proc.overrides = keys
        if (changed) proc.markRestart()
        if (overridesChanged) proc.emitStatus()
        continue
      }
      const p = new ServiceProcess(s, this.root, () => this.envFor(p.cfg))
      p.overrides = Object.keys(overrides)
      p.projectId = this.id
      p.on('log', (line) => this.emit({ type: 'log', project: this.id, id: p.cfg.id, line }))
      p.on('status', (snap) => this.emit({ type: 'status', project: this.id, service: snap }))
      p.on('traffic', (entries) => this.emit({ type: 'traffic', project: this.id, id: p.cfg.id, entries }))
      this.procs.set(s.id, p)
    }
  }

  private closure(ids: string[]) {
    const out = new Set<string>()
    const add = (id: string) => {
      if (out.has(id) || !this.procs.has(id)) return
      out.add(id)
      for (const d of this.procs.get(id)!.cfg.dependsOn ?? []) add(d)
    }
    ids.forEach(add)
    return out
  }

  // Starts the requested services plus their dependencies; each waits for its deps to be healthy.
  async startMany(ids?: string[]) {
    const want = this.closure(ids ?? [...this.procs.keys()])
    const started = new Map<string, Promise<void>>()
    const go = (id: string): Promise<void> => {
      const existing = started.get(id)
      if (existing) return existing
      const proc = this.procs.get(id)!
      const p = Promise.all((proc.cfg.dependsOn ?? []).filter((d) => want.has(d)).map(go)).then(
        async () => {
          if (!proc.running) await proc.start()
          await proc.ready()
        },
        (e: Error) => {
          proc.sys(`Not started: ${e.message}`, 'warn')
          throw e
        },
      )
      started.set(id, p)
      return p
    }
    await Promise.allSettled(topoSort([...want].map((id) => this.procs.get(id)!.cfg)).map(go))
  }

  // Stops dependents before the services they rely on.
  async stopMany(ids?: string[]) {
    const set = new Set(ids ?? this.procs.keys())
    const stopped = new Map<string, Promise<void>>()
    const go = (id: string): Promise<void> => {
      const existing = stopped.get(id)
      if (existing) return existing
      const dependents = [...set].filter((d) => this.procs.get(d)?.cfg.dependsOn?.includes(id))
      const p = Promise.all(dependents.map(go)).then(() => this.procs.get(id)?.stop())
      stopped.set(id, p)
      return p
    }
    await Promise.all([...set].map(go))
  }
}
