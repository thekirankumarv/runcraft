import fs from 'node:fs'
import path from 'node:path'

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

const DEV_SCRIPT = /^(dev|start|serve|watch|develop)(:|$)|:(dev|start|serve|watch)$/
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'target', 'vendor', 'coverage', 'venv', '.venv', '__pycache__'])

const readJSON = (file: string) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}
const readText = (file: string) => {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

export function packageManager(root: string, dir: string) {
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'pnpm-lock.yaml'))) return 'pnpm'
    if (fs.existsSync(path.join(d, 'bun.lockb')) || fs.existsSync(path.join(d, 'bun.lock'))) return 'bun run'
    if (fs.existsSync(path.join(d, 'yarn.lock'))) return 'yarn'
    if (d === root || d === path.dirname(d)) return 'npm run'
  }
}

function guessPort(script: string): number | undefined {
  const m = /(?:--port[= ]|-p\s+|PORT=)(\d{2,5})/.exec(script)
  if (m) return Number(m[1])
  if (/\bnext\b|\bnuxt\b|\bremix\b|react-scripts/.test(script)) return 3000
  if (/\bvite\b/.test(script)) return 5173
  if (/\bastro\b/.test(script)) return 4321
  if (/\bng serve\b/.test(script)) return 4200
}

function guessIcon(name: string, command: string) {
  const s = `${name} ${command}`.toLowerCase()
  if (/postgres|mysql|mongo|redis|db\b|database|prisma/.test(s)) return 'database'
  if (/socket|ws\b|realtime/.test(s)) return 'radio'
  if (/cron|schedul|job/.test(s)) return 'clock'
  if (/worker|queue|celery|sidekiq/.test(s)) return 'cog'
  if (/api|server|backend|nest|express|django|rails|fastapi|go run|cargo/.test(s)) return 'server'
  if (/web|client|app|frontend|next|vite|ui|chat/.test(s)) return 'globe'
  if (/docker|compose/.test(s)) return 'box'
  return 'terminal'
}

// Directories two levels deep that look like they hold something runnable.
function candidateDirs(root: string): string[] {
  const out = ['.']
  const walk = (rel: string, depth: number) => {
    if (depth > 2) return
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true })
    } catch {}
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
      const child = rel === '.' ? e.name : `${rel}/${e.name}`
      out.push(child)
      walk(child, depth + 1)
    }
  }
  walk('.', 1)
  return out
}

export function detect(root: string): Suggestion[] {
  const found: Suggestion[] = []
  const add = (s: Omit<Suggestion, 'id' | 'icon'>) => {
    const base =
      s.name
        .toLowerCase()
        .replace(/[^\w-]+/g, '-')
        .replace(/^-|-$/g, '') || 'service'
    let id = base
    for (let i = 2; found.some((f) => f.id === id); i++) id = `${base}-${i}`
    found.push({ ...s, id, icon: guessIcon(s.name, s.command) })
  }

  for (const rel of candidateDirs(root)) {
    const dir = path.join(root, rel)
    const envFile = ['.env', '.env.local', '.env.development'].find((f) => fs.existsSync(path.join(dir, f)))
    const label = rel === '.' ? '' : path.basename(rel)

    const pkg = readJSON(path.join(dir, 'package.json'))
    if (pkg?.scripts) {
      const pm = packageManager(root, dir)
      const scripts = Object.entries(pkg.scripts as Record<string, string>).filter(([k]) => DEV_SCRIPT.test(k))
      const hasDev = scripts.some(([k]) => k === 'dev')
      for (const [key, script] of scripts) {
        if (key === 'start' && hasDev) continue
        const suffix = key.replace(/^(dev|start|serve|watch|develop):?/, '').replace(/:(dev|start|serve|watch)$/, '')
        const name = [label, suffix].filter(Boolean).join(' ') || key
        add({ name, cwd: rel, command: `${pm} ${key}`, envFile, port: guessPort(script), source: `${rel}/package.json` })
      }
    }

    const procfile = readText(path.join(dir, 'Procfile.dev')) || readText(path.join(dir, 'Procfile'))
    for (const m of procfile.matchAll(/^([\w-]+):\s*(.+)$/gm)) add({ name: m[1], cwd: rel, command: m[2].trim(), envFile, source: `${rel}/Procfile` })

    const compose = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'].find((f) => fs.existsSync(path.join(dir, f)))
    if (compose) {
      const section = /^services:\s*\n([\s\S]*?)(?=^\S|$(?![\s\S]))/m.exec(readText(path.join(dir, compose)))?.[1] ?? ''
      for (const m of section.matchAll(/^ {2}([\w.-]+):\s*$/gm)) {
        add({ name: m[1], cwd: rel, command: `docker compose -f ${compose} up ${m[1]}`, source: `${rel}/${compose}` })
      }
    }

    const make = readText(path.join(dir, 'Makefile'))
    for (const m of make.matchAll(/^(dev|run|serve|start):/gm))
      add({ name: [label, m[1]].filter(Boolean).join(' '), cwd: rel, command: `make ${m[1]}`, envFile, source: `${rel}/Makefile` })

    if (fs.existsSync(path.join(dir, 'manage.py')))
      add({ name: label || 'django', cwd: rel, command: 'python manage.py runserver', envFile, port: 8000, source: `${rel}/manage.py` })
    if (fs.existsSync(path.join(dir, 'bin/rails')))
      add({ name: label || 'rails', cwd: rel, command: 'bin/rails server', envFile, port: 3000, source: `${rel}/bin/rails` })
    if (fs.existsSync(path.join(dir, 'go.mod')) && fs.existsSync(path.join(dir, 'main.go')))
      add({ name: label || 'go', cwd: rel, command: 'go run .', envFile, source: `${rel}/go.mod` })
    if (fs.existsSync(path.join(dir, 'Cargo.toml')) && fs.existsSync(path.join(dir, 'src/main.rs')))
      add({ name: label || 'rust', cwd: rel, command: 'cargo run', envFile, source: `${rel}/Cargo.toml` })
  }
  return found
}
