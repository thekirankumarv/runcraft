import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const git = (cwd: string, args: string[]) => run('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 }).then((r) => r.stdout)

const MAX_FILE = 2 * 1024 * 1024

export interface GitFile {
  path: string
  status: string
  staged: boolean
  added?: number
  removed?: number
}

export async function repoRoot(dir: string) {
  try {
    return (await git(dir, ['rev-parse', '--show-toplevel'])).trim()
  } catch {
    return null
  }
}

export function within(base: string, rel: string) {
  const abs = path.resolve(base, rel)
  if (abs !== base && !abs.startsWith(base + path.sep)) throw new Error('Path is outside the repository')
  return abs
}

export async function gitStatus(dir: string) {
  const root = await repoRoot(dir)
  if (!root) return null
  const [branch, porcelain, numstat] = await Promise.all([
    git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).then(
      (s) => s.trim(),
      () => '(no commits)',
    ),
    git(root, ['status', '--porcelain=v1', '-z', '-uall']),
    git(root, ['diff', 'HEAD', '--numstat']).catch(() => ''),
  ])
  const counts = new Map<string, [number, number]>()
  for (const line of numstat.split('\n')) {
    const [a, r, p] = line.split('\t')
    if (p && !p.includes('=>')) counts.set(p, [Number(a) || 0, Number(r) || 0])
  }
  const files: GitFile[] = []
  const parts = porcelain.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    if (!entry) continue
    const [x, y, p] = [entry[0], entry[1], entry.slice(3)]
    if (x === 'R' || x === 'C') i++ // next part is the old path
    const status = x === '?' ? 'U' : x !== ' ' ? x : y
    const [added, removed] = counts.get(p) ?? []
    files.push({ path: p, status, staged: x !== ' ' && x !== '?', added, removed })
  }
  return { root, branch, files }
}

export async function gitDiff(dir: string, file: string) {
  const root = (await repoRoot(dir)) ?? dir
  const abs = within(root, file)
  const stat = await fs.stat(abs).catch(() => null)
  if (stat && stat.size > MAX_FILE) return { path: file, tooLarge: true, original: '', modified: '' }
  const [original, modified] = await Promise.all([git(root, ['show', `HEAD:${file}`]).catch(() => ''), stat ? fs.readFile(abs, 'utf8') : ''])
  const binary = original.includes('\0') || modified.includes('\0')
  return { path: file, abs, binary, deleted: !stat, original: binary ? '' : original, modified: binary ? '' : modified }
}

export async function writeRepoFile(dir: string, file: string, content: string) {
  const root = (await repoRoot(dir)) ?? dir
  await fs.writeFile(within(root, file), content)
}
