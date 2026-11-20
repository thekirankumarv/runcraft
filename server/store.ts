import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const HOME = process.env.RUNCRAFT_HOME ?? path.join(os.homedir(), '.runcraft')
fs.mkdirSync(path.join(HOME, 'backups'), { recursive: true })

const sha = (s: string) => crypto.createHash('sha1').update(s).digest('hex')

export const projectId = (root: string) => sha(root).slice(0, 10)

// Stable across runs so a bookmarked URL keeps working.
export function loadToken(): string {
  const file = path.join(HOME, 'token')
  try {
    return fs.readFileSync(file, 'utf8').trim()
  } catch {
    const token = crypto.randomBytes(24).toString('base64url')
    fs.writeFileSync(file, token, { mode: 0o600 })
    return token
  }
}

export interface ProjectEntry {
  root: string
  lastOpened: number
}

const projectsFile = path.join(HOME, 'projects.json')

export function listProjects(): ProjectEntry[] {
  try {
    return JSON.parse(fs.readFileSync(projectsFile, 'utf8'))
  } catch {
    return []
  }
}

export function saveProjects(list: ProjectEntry[]) {
  fs.writeFileSync(projectsFile, JSON.stringify(list, null, 2))
}

export const backupPath = (file: string) => path.join(HOME, 'backups', `${sha(file).slice(0, 12)}-${path.basename(file)}`)

export interface UserTemplate {
  key: string
  name: string
  command: string
  [field: string]: unknown
}

const templatesFile = path.join(HOME, 'templates.json')

export function listTemplates(): UserTemplate[] {
  try {
    return JSON.parse(fs.readFileSync(templatesFile, 'utf8'))
  } catch {
    return []
  }
}

export function saveTemplates(list: UserTemplate[]) {
  fs.writeFileSync(templatesFile, JSON.stringify(list, null, 2))
}

export const VERSION: string = JSON.parse(
  fs.readFileSync(
    [path.join(import.meta.dirname, '../package.json'), path.join(import.meta.dirname, '../../package.json')].find((f) => fs.existsSync(f))!,
    'utf8',
  ),
).version
