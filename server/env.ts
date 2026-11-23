import fs from 'node:fs'
import path from 'node:path'
import { backupPath } from './store.ts'

const LINE = /^\s*(?:export\s+)?([A-Za-z_][\w.-]*)\s*=\s*(.*)$/

function unquote(raw: string): string {
  const v = raw.trim()
  const q = v[0]
  if (q === '"' || q === "'" || q === '`') {
    const end = v.lastIndexOf(q)
    if (end > 0) {
      const inner = v.slice(1, end)
      return q === '"' ? inner.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c)) : inner
    }
  }
  return v.replace(/\s+#.*$/, '')
}

function format(key: string, value: string) {
  if (/^[\w.\-/:@+,]*$/.test(value)) return `${key}=${value}`
  return `${key}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
}

// Multi-line quoted values are read only up to the first line break.
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const m = LINE.exec(line)
    if (m) out[m[1]] = unquote(m[2])
  }
  return out
}

export function readEnvFile(file: string): Record<string, string> {
  try {
    return parseEnv(fs.readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

const EXAMPLES = ['.env.example', '.env.sample', '.env.template', '.env.dist']

export function missingEnvKeys(dir: string, env: Record<string, string>): string[] {
  const example = EXAMPLES.map((f) => path.join(dir, f)).find((f) => fs.existsSync(f))
  if (!example) return []
  return Object.keys(readEnvFile(example)).filter((k) => !(k in env) && !(k in process.env))
}

// Rewrites only lines whose value changed so comments, order and blank lines survive.
export function updateEnvText(text: string, vars: Record<string, string>): string {
  const lines = text ? text.split(/\r?\n/) : []
  if (lines.at(-1) === '') lines.pop()
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const m = LINE.exec(line)
    if (!m) {
      out.push(line)
      continue
    }
    const key = m[1]
    if (!(key in vars) || seen.has(key)) continue
    seen.add(key)
    out.push(unquote(m[2]) === vars[key] ? line : format(key, vars[key]))
  }
  for (const [k, v] of Object.entries(vars)) if (!seen.has(k)) out.push(format(k, v))
  return out.join('\n') + '\n'
}

export function writeEnvFile(file: string, vars: Record<string, string>) {
  let text = ''
  try {
    text = fs.readFileSync(file, 'utf8')
    fs.writeFileSync(backupPath(file), text, { mode: 0o600 })
  } catch {}
  fs.writeFileSync(file, updateEnvText(text, vars))
}
