import { CheckCircle2, ChevronRight, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { stripAnsi } from '../lib/ansi'
import { formatTime, toBlocks } from '../lib/logs'
import { select, serviceAction, useStore } from '../lib/store'
import type { LogLine } from '../lib/types'
import { Button, Empty, ServiceIcon } from './ui'

export interface Problem {
  service: string
  text: string
  count: number
  last: number
  frames: LogLine[]
}

const TIMESTAMP = /^\[?(\d{4}-\d\d-\d\d[T ])?\d\d:\d\d:\d\d([.,]\d+)?Z?\]?\s+/

export function collectProblems(logs: Record<string, LogLine[]>): Problem[] {
  const out: Problem[] = []
  for (const [service, lines] of Object.entries(logs)) {
    const seen = new Map<string, Problem>()
    for (const b of toBlocks(lines)) {
      if (b.head.lvl !== 'error') continue
      const text = stripAnsi(b.head.text).trim().replace(TIMESTAMP, '')
      if (!text || /^(Exited with code|Killed by)/.test(text)) continue
      const key = text.replace(/\d+/g, '#')
      const p = seen.get(key)
      if (p) {
        p.count++
        p.last = b.head.t
        p.text = text
      } else {
        const np = { service, text, count: 1, last: b.head.t, frames: b.frames }
        seen.set(key, np)
        out.push(np)
      }
    }
  }
  return out.sort((a, b) => b.last - a.last)
}

export default function ProblemsView({ problems }: { problems: Problem[] }) {
  const config = useStore((s) => s.config)
  const byService = useMemo(() => {
    const m = new Map<string, Problem[]>()
    for (const p of problems) m.set(p.service, [...(m.get(p.service) ?? []), p])
    return [...m]
  }, [problems])

  if (!problems.length)
    return (
      <Empty icon={CheckCircle2} title="No problems">
        Errors, exceptions and stack traces from every service collect here as they happen.
      </Empty>
    )

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        {byService.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-faint">
              {problems.length} problems across {byService.length} services
            </span>
            <Button size="sm" className="ml-auto" onClick={() => byService.forEach(([id]) => serviceAction(id, 'clear'))}>
              <Trash2 size={12} /> Clear all
            </Button>
          </div>
        )}
        {byService.map(([id, list]) => {
          const cfg = config?.services.find((s) => s.id === id)
          return (
            <section key={id}>
              <div className="mb-2 flex items-center gap-2.5">
                <ServiceIcon icon={cfg?.icon} color={cfg?.color} size="sm" />
                <h3 className="text-[13px] font-semibold">{cfg?.name ?? id}</h3>
                <span className="text-xs text-faint">{list.length} distinct</span>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => serviceAction(id, 'clear')}>
                  <Trash2 size={12} /> Clear
                </Button>
              </div>
              <div className="overflow-hidden rounded-xl border border-line bg-raised/60">
                {list.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      useStore.setState({ logFilter: 'error' })
                      select(id, 'logs')
                    }}
                    className="group flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-hover/60"
                  >
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-bad" />
                    <div className="min-w-0 flex-1">
                      <div className="break-words font-mono text-[12px] leading-relaxed text-red-200/90">{p.text}</div>
                      {p.frames.length > 0 && <div className="mt-1 truncate font-mono text-[11px] text-faint">{stripAnsi(p.frames[0].text).trim()}</div>}
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-faint">
                      <div className="tabular-nums">{formatTime(p.last).slice(0, 8)}</div>
                      {p.count > 1 && <div className="mt-0.5 rounded-full bg-bad/10 px-1.5 text-red-300">×{p.count}</div>}
                    </div>
                    <ChevronRight size={14} className="mt-0.5 shrink-0 text-faint opacity-0 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
