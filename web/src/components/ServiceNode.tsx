import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ArrowUpRight, Play, RotateCw, Square, TriangleAlert } from 'lucide-react'
import { memo, type ReactNode } from 'react'
import { countErrors } from '../lib/logs'
import { isLive, killPortAndStart, select, serviceAction, useStore } from '../lib/store'
import { cx, formatBytes, ServiceIcon, Sparkline, STATUS, StatusPill } from './ui'

export const NODE_W = 272
export const NODE_H = 124

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-panel px-1.5 py-0.5 text-[10.5px] text-fg opacity-0 shadow-lg transition-opacity delay-150 group-hover/tip:opacity-100">
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

      {!st?.conflict && !st?.needsRestart && !!st?.missingEnv?.length && (
        <div className="nodrag px-3.5 pb-2.5">
          <button
            onClick={() => select(id, 'env')}
            title={st.missingEnv.join(', ')}
            className="flex w-full items-center gap-1.5 rounded-lg border border-warn/25 bg-warn/10 px-2 py-1 text-left text-[11px] text-amber-300 hover:bg-warn/15"
          >
            <TriangleAlert size={12} />
            <span className="flex-1 truncate">
              {st.missingEnv.length} env var{st.missingEnv.length === 1 ? '' : 's'} missing
            </span>
            <span className="font-medium">Set up</span>
          </button>
        </div>
      )}
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
          <span className="inline-flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap font-mono">
            <Sparkline values={hist ?? []} className="w-9 text-violet-400/70" />
            {st.usage.cpu.toFixed(0)}% · {formatBytes(st.usage.mem)}
          </span>
        )}
        {errors > 0 && !live && <span className="text-red-400/80">{errors} errors</span>}
        <div className="nodrag ml-auto flex shrink-0 items-center gap-1.5">
          {live && (
            <Tip label="Restart">
              <button
                aria-label="Restart"
                onClick={(e) => (e.stopPropagation(), serviceAction(id, 'restart'))}
                className="inline-flex size-6 items-center justify-center rounded-md border border-line text-muted transition-colors hover:border-warn/40 hover:bg-warn/10 hover:text-amber-300"
              >
                <RotateCw size={11} strokeWidth={2} />
              </button>
            </Tip>
          )}
          {live ? (
            <button
              onClick={(e) => (e.stopPropagation(), serviceAction(id, 'stop'))}
              disabled={status === 'stopping'}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-line px-2 font-medium text-muted transition-colors hover:border-bad/40 hover:bg-bad/10 hover:text-red-300 disabled:opacity-40"
            >
              <Square size={9} strokeWidth={2.5} />
              Stop
            </button>
          ) : (
            <button
              onClick={(e) => (e.stopPropagation(), serviceAction(id, 'start'))}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 font-medium text-emerald-300 transition-colors hover:border-emerald-400/50 hover:bg-emerald-500/20"
            >
              <Play size={10} strokeWidth={2.5} className="fill-current" />
              Start
            </button>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export default memo(ServiceNode)
