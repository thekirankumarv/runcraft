export type Health = { type: 'tcp'; port?: number } | { type: 'http'; url: string } | { type: 'none' }

export interface SavedRequest {
  id: string
  name: string
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
}

export interface ServiceConfig {
  id: string
  name: string
  cwd: string
  command: string
  pre?: string
  envFile?: string
  env?: Record<string, string>
  dependsOn?: string[]
  port?: number
  health?: Health
  autoRestart?: boolean
  watch?: string[]
  icon?: string
  color?: string
  group?: string
  position?: { x: number; y: number }
  requests?: SavedRequest[]
}

export interface ProjectConfig {
  name: string
  services: ServiceConfig[]
  profiles?: Record<string, string[]>
  envProfiles?: string[]
  editor?: string
}

// runcraft.local.json: per-machine settings that stay out of git.
export interface LocalConfig {
  envProfile?: string
  editor?: string
  services?: Record<string, Partial<ServiceConfig>>
}

export type Status = 'idle' | 'starting' | 'running' | 'unhealthy' | 'stopping' | 'stopped' | 'crashed'

export type Level = 'error' | 'warn' | 'info' | 'debug'

export interface LogLine {
  seq: number
  t: number
  s: 'out' | 'err' | 'sys'
  text: string
  lvl: Level
}
