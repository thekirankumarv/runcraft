import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ChevronRight, Clock, Copy, Search, Trash2, WrapText, X } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { parseAnsi, stripAnsi } from '../lib/ansi'
import { FILE_REF, formatTime, isFrame, plainText, resolvePath, toBlocks, type Block } from '../lib/logs'
import { editorUrl, serviceAction, useStore } from '../lib/store'
import type { Level, LogLine } from '../lib/types'
import { cx, IconButton } from './ui'

type Filter = Level | 'all'

const LEVELS: { value: Filter; label: string; dot?: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'error', label: 'Errors', dot: 'bg-bad' },
  { value: 'warn', label: 'Warnings', dot: 'bg-warn' },
  { value: 'info', label: 'Info', dot: 'bg-sky-400' },
  { value: 'debug', label: 'Debug', dot: 'bg-zinc-500' },
]

function highlight(text: string, query: string, key: string): ReactNode {
  if (!query) return text
  const lower = text.toLowerCase()
  const out: ReactNode[] = []
  let i = 0
  for (let at = lower.indexOf(query); at >= 0; at = lower.indexOf(query, i)) {
    out.push(
      text.slice(i, at),
      <mark key={`${key}-${at}`} className="rounded-sm bg-amber-400/30 text-amber-100">
        {text.slice(at, at + query.length)}
      </mark>,
    )
    i = at + query.length
  }
  out.push(text.slice(i))
  return out
}

// Renders ANSI colors plus clickable file:line references that open in the editor.
const LineText = memo(function LineText({ text, query, cwd }: { text: string; query: string; cwd: string }) {
  const segments = useMemo(() => parseAnsi(text), [text])
  return (
    <>
      {segments.map((seg, i) => {
        const parts: ReactNode[] = []
        let last = 0
        for (const m of seg.text.matchAll(FILE_REF)) {
          parts.push(highlight(seg.text.slice(last, m.index), query, `${i}-${last}`))
          const abs = resolvePath(m[1], cwd)
          const vendor = abs.includes('/node_modules/') || abs.startsWith('node:')
          parts.push(
            <a
              key={`${i}-${m.index}`}
              href={editorUrl(abs, Number(m[2]), m[3] ? Number(m[3]) : undefined)}
              className={cx('underline decoration-dotted underline-offset-2 hover:text-violet-300', vendor ? 'opacity-60' : 'text-sky-300')}
              title={`Open ${abs}`}
            >
              {highlight(m[0], query, `${i}-${m.index}-l`)}
            </a>,
          )
          last = m.index + m[0].length
        }
        parts.push(highlight(seg.text.slice(last), query, `${i}-${last}-e`))
        return (
          <span
            key={i}
            style={{ color: seg.fg, background: seg.bg }}
            className={cx(seg.bold && 'font-semibold', seg.dim && 'opacity-60', seg.italic && 'italic', seg.underline && 'underline')}
          >
            {parts}
          </span>
        )
      })}
    </>
  )
})

function Row({
  line,
  svc,
  query,
  cwd,
  showTime,
  wrap,
  frames,
  expanded,
  onToggle,
}: {
  line: LogLine
  svc?: { name: string; color?: string }
  query: string
  cwd: string
  showTime: boolean
  wrap: boolean
  frames?: number
  expanded?: boolean
  onToggle?: () => void
}) {
  const tone = line.lvl === 'error' ? 'border-bad/70 bg-bad/[0.06]' : line.lvl === 'warn' ? 'border-warn/60 bg-warn/[0.04]' : 'border-transparent'
  return (
    <div className={cx('flex gap-3 border-l-2 px-3 py-[1.5px] hover:bg-hover/50', tone)}>
      {showTime && <span className="shrink-0 select-none text-faint/70 tabular-nums">{formatTime(line.t)}</span>}
      {svc && (
        <span className="w-24 shrink-0 select-none truncate font-sans text-[11px] font-medium" style={{ color: svc.color ?? 'var(--color-violet-300)' }}>
          {svc.name}
        </span>
      )}
      <span className={cx('min-w-0 flex-1', wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre', line.s === 'sys' && 'italic text-violet-300/80')}>
        {line.s === 'sys' && <span className="mr-1.5 not-italic text-violet-400/60">›</span>}
        <LineText text={line.text} query={query} cwd={cwd} />
        {!!frames && (
          <button
            onClick={onToggle}
            className="ml-2 inline-flex items-center gap-0.5 rounded bg-hover px-1.5 text-[10.5px] not-italic text-muted hover:bg-line hover:text-fg"
          >
            <ChevronRight size={11} className={cx('transition-transform', expanded && 'rotate-90')} />
            {frames} frames
          </button>
        )}
      </span>
    </div>
  )
}

type Tagged = Block & { svc?: string }

// Without an id, shows every service's logs merged by time.
export default function LogView({ id }: { id?: string }) {
  const own = useStore((s) => (id ? s.logs[id] : undefined))
  const all = useStore((s) => (id ? undefined : s.logs))
  const states = useStore((s) => s.services)
  const config = useStore((s) => s.config)
  const lines = useMemo(() => (id ? (own ?? []) : Object.values(all ?? {}).flat()), [id, own, all])
  const cwdOf = (svc?: string) => states[svc ?? id ?? '']?.cwd ?? ''
  const svcInfo = (svc?: string) => {
    const c = svc ? config?.services.find((x) => x.id === svc) : undefined
    return svc ? { name: c?.name ?? svc, color: c?.color } : undefined
  }
  const initialFilter = useStore((s) => s.logFilter)
  const [filter, setFilter] = useState<Filter>(initialFilter ?? 'all')
  const [query, setQuery] = useState('')
  const [showTime, setShowTime] = useState(true)
  const [wrap, setWrap] = useState(true)
  const [follow, setFollow] = useState(true)
  const [expanded, setExpanded] = useState(new Set<number>())
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setFilter(initialFilter ?? 'all')
    useStore.setState({ logFilter: undefined })
  }, [id, initialFilter])

  const counts = useMemo(() => {
    const c: Record<string, number> = { error: 0, warn: 0, info: 0, debug: 0 }
    for (const l of lines) if ((l.s !== 'sys' || l.lvl === 'error') && !isFrame(l)) c[l.lvl]++
    return c
  }, [lines])

  const q = query.trim().toLowerCase()
  const blocks = useMemo(() => {
    const tagged: Tagged[] = id
      ? toBlocks(lines)
      : Object.entries(all ?? {})
          .flatMap(([svc, ls], i) => toBlocks(ls).map((b) => ({ ...b, key: i * 1_000_000_000 + b.key, svc })))
          .sort((a, b) => a.head.t - b.head.t)
    return tagged.filter((b) => {
      if (filter !== 'all' && b.head.lvl !== filter) return false
      if (q && ![b.head, ...b.frames].some((l) => stripAnsi(l.text).toLowerCase().includes(q))) return false
      return true
    })
  }, [id, lines, all, filter, q])

  type Item = { line: LogLine; block?: Block; frameOf?: number; svc?: string }
  const items = useMemo(() => {
    const out: Item[] = []
    for (const b of blocks) {
      out.push({ line: b.head, block: b, svc: b.svc })
      if (expanded.has(b.key) || (q && b.frames.some((f) => stripAnsi(f.text).toLowerCase().includes(q))))
        for (const f of b.frames) out.push({ line: f, frameOf: b.key, svc: b.svc })
    }
    return out
  }, [blocks, expanded, q])

  const virtual = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 20,
    overscan: 30,
    getItemKey: (i) => `${items[i].svc ?? ''}:${items[i].line.seq}`,
  })

  useEffect(() => {
    if (follow && items.length) virtual.scrollToIndex(items.length - 1, { align: 'end' })
  }, [items.length, follow, virtual])

  const onScroll = () => {
    const el = scrollRef.current!
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (atBottom !== follow) setFollow(atBottom)
  }

  const copy = () => {
    navigator.clipboard.writeText(
      plainText(
        items.map((i) => i.line),
        showTime,
      ),
    )
    toast.success(`Copied ${items.length} lines`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <div className="relative min-w-40 flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search logs"
            className="h-7 w-full rounded-lg border border-line bg-panel pl-8 pr-7 text-xs outline-none placeholder:text-faint focus:border-accent/50"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-fg">
              <X size={12} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton icon={Clock} label="Timestamps" active={showTime} onClick={() => setShowTime(!showTime)} />
          <IconButton icon={WrapText} label="Wrap lines" active={wrap} onClick={() => setWrap(!wrap)} />
          <IconButton icon={Copy} label="Copy visible logs" onClick={copy} />
          <IconButton icon={Trash2} label="Clear logs" onClick={() => (id ? [id] : Object.keys(all ?? {})).forEach((sid) => serviceAction(sid, 'clear'))} />
        </div>
      </div>
      <div className="flex items-center gap-1 border-b border-line px-3 py-1.5">
        {LEVELS.map((l) => (
          <button
            key={l.value}
            onClick={() => setFilter(l.value)}
            className={cx(
              'inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors',
              filter === l.value ? 'bg-hover text-fg' : 'text-faint hover:text-muted',
            )}
          >
            {l.dot && <span className={cx('size-1.5 rounded-full', l.dot)} />}
            {l.label}
            {l.value !== 'all' && counts[l.value] > 0 && (
              <span className={cx('tabular-nums', l.value === 'error' ? 'text-red-300' : 'text-faint')}>{counts[l.value]}</span>
            )}
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="absolute inset-0 overflow-auto bg-term py-2 font-mono text-[11.5px] leading-[1.6] text-term-fg">
          {!items.length && (
            <div className="p-6 text-center font-sans text-xs text-faint">
              {lines.length
                ? 'No lines match your filters.'
                : id
                  ? 'No output yet. Start the service to see its logs here.'
                  : 'No output yet. Start a service to see its logs here.'}
            </div>
          )}
          <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
            {virtual.getVirtualItems().map((v) => {
              const item = items[v.index]
              return (
                <div
                  key={v.key}
                  data-index={v.index}
                  ref={virtual.measureElement}
                  className="absolute left-0 w-full"
                  style={{ transform: `translateY(${v.start}px)` }}
                >
                  <div className={item.frameOf ? 'pl-6 text-zinc-500' : ''}>
                    <Row
                      line={item.line}
                      query={q}
                      cwd={cwdOf(item.svc)}
                      svc={svcInfo(item.svc)}
                      showTime={showTime && !item.frameOf}
                      wrap={wrap}
                      frames={item.block?.frames.length}
                      expanded={item.block && expanded.has(item.block.key)}
                      onToggle={() =>
                        setExpanded((s) => {
                          const n = new Set(s)
                          const k = item.block!.key
                          if (n.has(k)) n.delete(k)
                          else n.add(k)
                          return n
                        })
                      }
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        {!follow && (
          <button
            onClick={() => setFollow(true)}
            className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line-strong bg-raised px-3 py-1 text-xs text-muted shadow-xl hover:text-fg animate-pop"
          >
            <ArrowDown size={12} /> Jump to latest
          </button>
        )}
      </div>
    </div>
  )
}
