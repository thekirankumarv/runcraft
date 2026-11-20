import { Activity, AlertTriangle, ArrowUpRight, Cpu, HardDrive, Play, RotateCw, Server, Square } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { stripAnsi } from '../lib/ansi'
import { countErrors, isFrame } from '../lib/logs'
import { isLive, select, serviceAction, useStore } from '../lib/store'
import { Button, cx, formatBytes, IconButton, ServiceIcon, STATUS, StatusPill } from './ui'

function uptime(since?: number, now = Date.now()) {
  if (!since) return '—'
  const s = Math.floor((now - since) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Cpu; label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-raised p-4">
      <div className="flex items-center gap-2 text-xs text-faint">
        <Icon size={13} />
        {label}
      </div>
      <div className={cx('mt-2 text-[22px] font-semibold tabular-nums tracking-[-0.02em]', tone)}>{value}</div>
    </div>
  )
}

function Chart({ values }: { values: number[] }) {
  const w = 220
  const h = 40
  if (values.length < 2)
    return (
      <div style={{ height: h }} className="flex items-center text-[11px] text-faint">
        No samples yet
      </div>
    )
  const max = Math.max(10, ...values)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - (v / max) * (h - 2) - 1])
  const line = pts.map(([x, y]) => `${x},${y}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-10 w-full text-violet-400" aria-hidden>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill="currentColor" opacity="0.12" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default function OverviewView({ problemCount }: { problemCount: number }) {
  const config = useStore((s) => s.config)
  const services = useStore((s) => s.services)
  const history = useStore((s) => s.history)
  const logs = useStore((s) => s.logs)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (!config) return null

  const list = config.services.map((c) => ({ cfg: c, st: services[c.id] }))
  const running = list.filter((s) => s.st?.status === 'running').length
  const crashed = list.filter((s) => s.st?.status === 'crashed').length
  const cpu = list.reduce((n, s) => n + (isLive(s.st) ? (s.st?.usage?.cpu ?? 0) : 0), 0)
  const mem = list.reduce((n, s) => n + (isLive(s.st) ? (s.st?.usage?.mem ?? 0) : 0), 0)
  const health = crashed ? 'text-red-300' : running === list.length && list.length ? 'text-emerald-300' : ''

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat icon={Activity} label="Online" value={`${running}/${list.length}`} tone={health} />
          <Stat icon={AlertTriangle} label="Crashed" value={crashed} tone={crashed ? 'text-red-300' : undefined} />
          <Stat icon={Server} label="Problems" value={problemCount} tone={problemCount ? 'text-amber-300' : undefined} />
          <Stat icon={Cpu} label="Total CPU" value={`${cpu.toFixed(0)}%`} />
          <Stat icon={HardDrive} label="Total memory" value={formatBytes(mem)} />
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map(({ cfg, st }) => {
            const status = st?.status ?? 'idle'
            const live = isLive(st)
            const lastError = logs[cfg.id]?.findLast((l) => l.lvl === 'error' && l.s !== 'sys' && !isFrame(l))
            const glow = STATUS[status].glow
            return (
              <div
                key={cfg.id}
                className="group rounded-2xl border border-line bg-raised p-4 transition-shadow"
                style={{ boxShadow: glow && live ? `0 0 0 1px ${glow}26, 0 10px 30px -18px ${glow}` : undefined }}
              >
                <div className="flex items-start gap-3">
                  <ServiceIcon icon={cfg.icon} color={cfg.color} />
                  <button onClick={() => select(cfg.id, 'logs')} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-[13.5px] font-semibold hover:text-violet-300">{cfg.name}</div>
                    <div className="truncate font-mono text-[11px] text-faint">{cfg.command}</div>
                  </button>
                  <StatusPill status={status} />
                </div>

                <div className="mt-4">
                  <Chart values={live ? (history[cfg.id] ?? []) : []} />
                </div>

                <dl className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
                  {[
                    ['Uptime', live ? uptime(st?.startedAt, now) : '—'],
                    ['CPU', live && st?.usage ? `${st.usage.cpu.toFixed(0)}%` : '—'],
                    ['Memory', live && st?.usage ? formatBytes(st.usage.mem) : '—'],
                    ['Crashes', st?.crashes ?? 0],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <dt className="text-faint">{k}</dt>
                      <dd className={cx('mt-0.5 font-mono tabular-nums', k === 'Crashes' && Number(v) > 0 && 'text-red-300')}>{v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-3 flex min-h-6 items-center gap-2 border-t border-line pt-3">
                  {lastError ? (
                    <button
                      onClick={() => {
                        useStore.setState({ logFilter: 'error' })
                        select(cfg.id, 'logs')
                      }}
                      className="min-w-0 flex-1 truncate text-left font-mono text-[11px] text-red-300/90 hover:underline"
                      title={stripAnsi(lastError.text)}
                    >
                      {countErrors(logs[cfg.id])}× {stripAnsi(lastError.text).trim()}
                    </button>
                  ) : (
                    <span className="flex-1 text-[11px] text-faint">No errors</span>
                  )}
                  {st?.port && live && (
                    <a
                      href={`http://localhost:${st.port}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center font-mono text-[11px] text-muted hover:text-violet-300"
                    >
                      :{st.port}
                      <ArrowUpRight size={11} />
                    </a>
                  )}
                  {live ? (
                    <>
                      <IconButton icon={RotateCw} size={12} label="Restart" onClick={() => serviceAction(cfg.id, 'restart')} />
                      <IconButton icon={Square} size={11} label="Stop" onClick={() => serviceAction(cfg.id, 'stop')} />
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => serviceAction(cfg.id, 'start')}>
                      <Play size={11} /> Start
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
