import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ArrowUpRight, Play, RotateCw, Square, TriangleAlert } from 'lucide-react'
import { memo, type ReactNode } from 'react'
import { countErrors } from '../lib/logs'
import { isLive, killPortAndStart, serviceAction, useStore } from '../lib/store'
import { cx, formatBytes, IconButton, ServiceIcon, Sparkline, STATUS, StatusPill } from './ui'

export const NODE_W = 272
export const NODE_H = 124

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-panel px-1.5 py-0.5 text-[10.5px] text-fg opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">
        {label}
      </span>
    </span>
  )
}

function ServiceNode({ id, selected }: NodeProps) {
  const cfg = useStore((s) => s.config?.services.find((x) => x.id === id))
  const st = useStore((s) => s.services[id])
  const hist = useStore((s) => s.history[id])
  const errors = useStore((s) => countErrors(s.logs[id]))
  if (!cfg) return null
  const status = st?.status ?? 'idle'
  const live = isLive(st)
  const glow = STATUS[status].glow
  const dim = status === 'idle' || status === 'stopped'

  return (
    <div
      className={cx(
        'group relative rounded-2xl border bg-raised/95 transition-[border-color,box-shadow,opacity] duration-300',
        selected ? 'border-accent/70' : 'border-line-strong hover:border-faint/50',
        dim && !selected && 'opacity-80',
      )}
      style={{
        width: NODE_W,
        boxShadow: [selected && '0 0 0 3px #8b5cf626', glow && `0 0 0 1px ${glow}30, 0 10px 40px -12px ${glow}70`, '0 8px 24px -12px #000']
          .filter(Boolean)
          .join(', '),
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-start gap-3 px-3.5 pb-3 pt-3.5">
        <ServiceIcon icon={cfg.icon} color={cfg.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13.5px] font-semibold tracking-[-0.01em]">{cfg.name}</span>
            <StatusPill status={status} />
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-faint" title={cfg.command}>
            {cfg.command}
          </div>
        </div>
      </div>

      {(st?.conflict || st?.needsRestart) && (
        <div className="nodrag px-3.5 pb-2.5">
          {st.conflict ? (
            <button
              onClick={() => killPortAndStart(id)}
              className="flex w-full items-center gap-1.5 rounded-lg border border-bad/25 bg-bad/10 px-2 py-1 text-left text-[11px] text-red-300 hover:bg-bad/15"
            >
              <TriangleAlert size={12} />
              <span className="flex-1 truncate">
                Port {st.conflict.port} busy{st.conflict.command ? ` (${st.conflict.command})` : ''}
              </span>
              <span className="font-medium">Kill & start</span>
            </button>
          ) : (
            <button
              onClick={() => serviceAction(id, 'restart')}
              className="flex w-full items-center gap-1.5 rounded-lg border border-warn/25 bg-warn/10 px-2 py-1 text-left text-[11px] text-amber-300 hover:bg-warn/15"
            >
              <RotateCw size={12} />
              <span className="flex-1">Changes pending</span>
              <span className="font-medium">Restart to apply</span>
            </button>
          )}
        </div>
      )}

      <div className="flex h-10 items-center gap-2 border-t border-line px-3.5 text-[11px] text-faint">
        {st?.port ? (
          <a
            href={`http://localhost:${st.port}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cx(
              'nodrag inline-flex items-center gap-0.5 font-mono transition-colors',
              live ? 'text-muted hover:text-violet-300' : 'pointer-events-none',
            )}
          >
            :{st.port}
            {live && <ArrowUpRight size={11} />}
          </a>
        ) : (
          <span className="min-w-0 truncate font-mono">{cfg.cwd === '.' ? './' : cfg.cwd}</span>
        )}
        {live && st?.usage && (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono">
            <Sparkline values={hist ?? []} className="w-9 text-violet-400/70" />
            {st.usage.cpu.toFixed(0)}% · {formatBytes(st.usage.mem)}
          </span>
        )}
        {errors > 0 && !live && <span className="text-red-400/80">{errors} errors</span>}
        <div className="nodrag ml-auto flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
          {live ? (
            <Tip label="Stop">
              <IconButton
                icon={Square}
                size={12}
                label="Stop"
                onClick={(e) => (e.stopPropagation(), serviceAction(id, 'stop'))}
                disabled={status === 'stopping'}
              />
            </Tip>
          ) : (
            <Tip label="Start (with dependencies)">
              <IconButton
                icon={Play}
                size={13}
                label="Start (with dependencies)"
                onClick={(e) => (e.stopPropagation(), serviceAction(id, 'start'))}
                className="hover:text-emerald-300"
              />
            </Tip>
          )}
          <Tip label={live ? 'Restart' : 'Restart (not running)'}>
            <IconButton icon={RotateCw} size={12} label="Restart" disabled={!live} onClick={(e) => (e.stopPropagation(), serviceAction(id, 'restart'))} />
          </Tip>
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export default memo(ServiceNode)
