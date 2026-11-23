import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const git = (cwd: string, args: string[]) => run('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 }).then((r) => r.stdout)

// Like git(), but fails with git's own message and never waits on a credential prompt.
const gitOrFail = (cwd: string, args: string[]) =>
  run('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).then(
    (r) => r.stdout,
    (e) => {
      throw new Error(String(e.stderr || e.message).trim())
    },
  )

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
  gitFetchInBackground(root)
  const [branch, porcelain, numstat, sync] = await Promise.all([
    git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).then(
      (s) => s.trim(),
      () => '(no commits)',
    ),
    git(root, ['status', '--porcelain=v1', '-z', '-uall']),
    git(root, ['diff', 'HEAD', '--numstat']).catch(() => ''),
    git(root, ['rev-list', '--left-right', '--count', '@{u}...HEAD']).catch(() => null),
  ])
  const [behind, ahead] = sync ? sync.trim().split(/\s+/).map(Number) : []
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
  return { root, branch, files, upstream: sync !== null, ahead: ahead ?? 0, behind: behind ?? 0 }
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

export async function gitStage(dir: string, files: string[], staged: boolean) {
  const root = (await repoRoot(dir)) ?? dir
  for (const f of files) within(root, f)
  if (!files.length) return
  await gitOrFail(root, staged ? ['add', '--', ...files] : ['restore', '--staged', '--', ...files])
}

export async function gitCommit(dir: string, message: string, all: boolean) {
  const root = (await repoRoot(dir)) ?? dir
  if (!message.trim()) throw new Error('Write a commit message first')
  if (all) await gitOrFail(root, ['add', '-A'])
  await gitOrFail(root, ['commit', '-m', message])
}

export async function gitPush(dir: string, hasUpstream: boolean) {
  const root = (await repoRoot(dir)) ?? dir
  await gitOrFail(root, hasUpstream ? ['push'] : ['push', '-u', 'origin', 'HEAD'])
}

export async function gitPull(dir: string) {
  const root = (await repoRoot(dir)) ?? dir
  await gitOrFail(root, ['pull', '--ff-only'])
}

const lastFetch = new Map<string, number>()
export function gitFetchInBackground(root: string, everyMs = 60_000) {
  if (Date.now() - (lastFetch.get(root) ?? 0) < everyMs) return
  lastFetch.set(root, Date.now())
  run('git', ['fetch', '--quiet'], { cwd: root, timeout: 30_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).catch(() => {})
}

export async function gitBranches(dir: string) {
  const root = (await repoRoot(dir)) ?? dir
  const out = await git(root, ['branch', '--format=%(refname:short)', '--sort=-committerdate']).catch(() => '')
  return out.split('\n').filter(Boolean)
}

export async function gitSwitch(dir: string, branch: string) {
  const root = (await repoRoot(dir)) ?? dir
  if (!branch || branch.startsWith('-')) throw new Error('Invalid branch name')
  await gitOrFail(root, ['switch', branch])
}
