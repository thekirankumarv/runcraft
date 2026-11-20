export interface Segment {
  text: string
  fg?: string
  bg?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
}

// Theme-aware palette defined in index.css, tuned per background rather than raw xterm colors.
const BASE = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `var(--ansi-${i})`)
const BRIGHT = [8, 9, 10, 11, 12, 13, 14, 15].map((i) => `var(--ansi-${i})`)

function color256(n: number) {
  if (n < 8) return BASE[n]
  if (n < 16) return BRIGHT[n - 8]
  if (n >= 232) {
    const v = 8 + (n - 232) * 10
    return `rgb(${v},${v},${v})`
  }
  const i = n - 16
  const c = (x: number) => (x ? 55 + x * 40 : 0)
  return `rgb(${c(Math.floor(i / 36))},${c(Math.floor(i / 6) % 6)},${c(i % 6)})`
}

const SGR = /\x1b\[([0-9;]*)m/g
const OTHER = /\x1b\[[0-9;?]*[ -/]*[@-ln-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Z0-9]/g

export const stripAnsi = (s: string) => s.replace(SGR, '').replace(OTHER, '')

export function parseAnsi(input: string): Segment[] {
  const text = input.replace(OTHER, '')
  const out: Segment[] = []
  let style: Omit<Segment, 'text'> = {}
  let last = 0
  for (const m of text.matchAll(SGR)) {
    if (m.index > last) out.push({ ...style, text: text.slice(last, m.index) })
    last = m.index + m[0].length
    const codes = (m[1] || '0').split(';').map(Number)
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i]
      if (c === 0) style = {}
      else if (c === 1) style.bold = true
      else if (c === 2) style.dim = true
      else if (c === 3) style.italic = true
      else if (c === 4) style.underline = true
      else if (c === 22) style.bold = style.dim = false
      else if (c === 23) style.italic = false
      else if (c === 24) style.underline = false
      else if (c >= 30 && c <= 37) style.fg = BASE[c - 30]
      else if (c >= 90 && c <= 97) style.fg = BRIGHT[c - 90]
      else if (c === 39) style.fg = undefined
      else if (c >= 40 && c <= 47) style.bg = BASE[c - 40]
      else if (c >= 100 && c <= 107) style.bg = BRIGHT[c - 100]
      else if (c === 49) style.bg = undefined
      else if ((c === 38 || c === 48) && codes[i + 1] === 5) {
        style[c === 38 ? 'fg' : 'bg'] = color256(codes[i + 2])
        i += 2
      } else if ((c === 38 || c === 48) && codes[i + 1] === 2) {
        style[c === 38 ? 'fg' : 'bg'] = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`
        i += 4
      }
    }
  }
  if (last < text.length) out.push({ ...style, text: text.slice(last) })
  return out
}
