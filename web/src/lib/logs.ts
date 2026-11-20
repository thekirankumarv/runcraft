import { stripAnsi } from './ansi'
import type { LogLine } from './types'

export interface Block {
  key: number
  head: LogLine
  frames: LogLine[]
}

const FRAME = /^\s+at\s|^\s+File ".+", line \d+|^\s*\^+\s*$|^\s{4,}\S/

export const isFrame = (l: LogLine) => FRAME.test(stripAnsi(l.text))

// One per error, not per stack-frame line.
export const countErrors = (lines: LogLine[] = []) => lines.reduce((n, l) => n + (l.lvl === 'error' && l.s !== 'sys' && !isFrame(l) ? 1 : 0), 0)

// Folds stack-trace lines into the error line above them.
export function toBlocks(lines: LogLine[]): Block[] {
  const blocks: Block[] = []
  for (const line of lines) {
    const prev = blocks.at(-1)
    if (prev && prev.head.lvl === 'error' && line.s === prev.head.s && FRAME.test(stripAnsi(line.text))) prev.frames.push(line)
    else blocks.push({ key: line.seq, head: line, frames: [] })
  }
  return blocks
}

export const FILE_REF =
  /((?:file:\/\/)?(?:[A-Za-z]:\\|\/|\.{1,2}\/)?(?:[\w@.+-]+[/\\])*[\w@.+-]+\.(?:[cm]?[jt]sx?|py|go|rs|rb|vue|svelte|astro|java|kt|php|css|scss|json|ex|exs|prisma)):(\d+)(?::(\d+))?/g

export function resolvePath(file: string, cwd: string) {
  const clean = file.replace(/^file:\/\//, '')
  if (clean.startsWith('/') || /^[A-Za-z]:[\\/]/.test(clean)) return clean
  const out: string[] = []
  for (const p of `${cwd}/${clean}`.split(/[\\/]/)) {
    if (p === '..') out.pop()
    else if (p && p !== '.') out.push(p)
  }
  return /^[A-Za-z]:$/.test(out[0] ?? '') ? out.join('/') : '/' + out.join('/')
}

export const formatTime = (t: number) => {
  const d = new Date(t)
  return `${d.toLocaleTimeString([], { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

export const plainText = (lines: LogLine[], withTime: boolean) => lines.map((l) => (withTime ? `[${formatTime(l.t)}] ` : '') + stripAnsi(l.text)).join('\n')
