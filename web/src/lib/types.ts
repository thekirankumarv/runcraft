export type { Health, Level, LocalConfig, LogLine, ProjectConfig, SavedRequest, ServiceConfig, Status, TrafficEntry } from '../../../server/types.ts'
import type { Status } from '../../../server/types.ts'

export interface Usage {
  cpu: number
  mem: number
}

export interface ServiceState {
  id: string
  status: Status
  pid?: number
  port?: number
  startedAt?: number
  exitCode?: number | null
  crashes: number
  overrides?: string[]
  needsRestart: boolean
  conflict?: { port: number; pid?: number; command?: string }
  missingEnv?: string[]
  cwd: string
  usage?: Usage
}

export interface ProjectInfo {
  id: string
  root: string
  name: string
  exists: boolean
  running: number
}

export interface Suggestion {
  id: string
  name: string
  cwd: string
  command: string
  envFile?: string
  port?: number
  icon: string
  source: string
}

export interface PortInfo {
  port: number
  pid: number
  command: string
  address: string
  owner?: { project: string; service: string }
}

export interface GitFile {
  path: string
  status: string
  staged: boolean
  added?: number
  removed?: number
}

export interface UserTemplate {
  key: string
  name: string
  command: string
  icon?: string
  hint?: string
  [field: string]: unknown
}
