import { ArrowUpRight, BookmarkPlus, Code2, Play, RotateCw, Square, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useEffect, useState } from 'react'
import { countErrors } from '../lib/logs'
import { editorUrl, fail, isLive, removeService, select, serviceAction, updateService, useStore, type Tab } from '../lib/store'
import type { ServiceConfig } from '../lib/types'
import EnvTable from './EnvTable'
import HttpClient from './HttpClient'
import LogView from './LogView'
import ServiceForm, { cleanService } from './ServiceForm'
import { Button, cx, IconButton, ServiceIcon, StatusPill } from './ui'

function Settings({ id }: { id: string }) {
  const config = useStore((s) => s.config)
  const root = useStore((s) => s.root)
  const cfg = config?.services.find((s) => s.id === id)
  const overrides = useStore((s) => s.services[id]?.overrides)
  const [draft, setDraft] = useState<ServiceConfig | undefined>(cfg)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    setDraft(cfg)
    setConfirm(false)
  }, [id, cfg])
  if (!draft || !cfg) return null
  const dirty = JSON.stringify(draft) !== JSON.stringify(cfg)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {!!overrides?.length && (
          <div className="mb-5 rounded-xl border border-warn/25 bg-warn/[0.06] px-3 py-2 text-xs text-amber-300">
            runcraft.local.json overrides {overrides.join(', ')} for this service on your machine. The form shows the shared values.
          </div>
        )}
        <ServiceForm value={draft} onChange={setDraft} others={config!.services.filter((s) => s.id !== id)} root={root} />
        <div className="mt-6 flex items-center justify-between rounded-xl border border-line bg-panel/60 p-3">
          <div>
            <div className="text-xs font-medium">Save as template</div>
            <div className="text-[11px] text-faint">Reuse this command and settings when adding services in any project.</div>
          </div>
          <Button
            size="sm"
            onClick={() => api('POST', '/api/templates', cleanService(draft)).then(() => toast.success(`Saved “${draft.name}” as a template`), fail)}
          >
            <BookmarkPlus size={12} /> Save template
          </Button>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl border border-bad/20 bg-bad/[0.04] p-3">
          <div>
            <div className="text-xs font-medium">Remove service</div>
            <div className="text-[11px] text-faint">Stops it and removes it from runcraft.json. Your code is untouched.</div>
          </div>
          {confirm ? (
            <Button size="sm" variant="danger" onClick={() => removeService(id)}>
              Confirm remove
            </Button>
          ) : (
            <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>
              <Trash2 size={12} /> Remove
            </Button>
          )}
        </div>
      </div>
      <div className={cx('flex items-center justify-end gap-2 border-t border-line px-4 py-2.5', dirty && 'bg-accent-soft')}>
        {dirty && <span className="mr-auto text-[11px] text-faint">Unsaved changes</span>}
        <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => setDraft(cfg)}>
          Discard
        </Button>
        <Button size="sm" variant="primary" disabled={!dirty || !draft.command.trim()} onClick={() => updateService(id, cleanService(draft))}>
          Save
        </Button>
      </div>
    </div>
  )
}

const TABS: { value: Tab; label: string }[] = [
  { value: 'logs', label: 'Logs' },
  { value: 'env', label: 'Variables' },
  { value: 'http', label: 'HTTP' },
  { value: 'settings', label: 'Settings' },
]

export default function ServicePanel({ id }: { id: string }) {
  const cfg = useStore((s) => s.config?.services.find((x) => x.id === id))
  const st = useStore((s) => s.services[id])
  const tab = useStore((s) => s.tab)
  const errors = useStore((s) => countErrors(s.logs[id]))
  const [width, setWidth] = useState(() => Number(localStorage.getItem('runcraft.panel') ?? 620))
  if (!cfg) return null
  const live = isLive(st)
  const status = st?.status ?? 'idle'

  const startResize = (e: React.PointerEvent) => {
    const x0 = e.clientX
    const w0 = width
    const move = (ev: PointerEvent) => setWidth(Math.min(Math.max(420, w0 + x0 - ev.clientX), window.innerWidth - 320))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setWidth((w) => (localStorage.setItem('runcraft.panel', String(w)), w))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <aside className="relative flex h-full shrink-0 flex-col border-l border-line bg-panel animate-slide-in" style={{ width }}>
      <div onPointerDown={startResize} className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-accent/20" />
      <header className="border-b border-line px-4 pb-0 pt-3.5">
        <div className="flex items-start gap-3">
          <ServiceIcon icon={cfg.icon} color={cfg.color} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{cfg.name}</h2>
              <StatusPill status={status} />
            </div>
            <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-faint">
              <span className="truncate" title={cfg.command}>
                {cfg.command}
              </span>
              {st?.pid && <span className="shrink-0">pid {st.pid}</span>}
              {st?.exitCode != null && !live && <span className={cx('shrink-0', st.exitCode ? 'text-red-300' : '')}>exit {st.exitCode}</span>}
            </div>
          </div>
          <IconButton icon={X} label="Close" onClick={() => select(undefined)} />
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          {live ? (
            <Button size="sm" onClick={() => serviceAction(id, 'stop')} disabled={status === 'stopping'}>
              <Square size={11} /> Stop
            </Button>
          ) : (
            <Button size="sm" variant="success" onClick={() => serviceAction(id, 'start')}>
              <Play size={12} /> Start
            </Button>
          )}
          <Button size="sm" onClick={() => serviceAction(id, 'restart')} disabled={!live}>
            <RotateCw size={11} /> Restart
          </Button>
          {st?.port && (
            <a href={`http://localhost:${st.port}`} target="_blank" rel="noreferrer">
              <Button size="sm" variant="ghost" disabled={!live}>
                localhost:{st.port} <ArrowUpRight size={12} />
              </Button>
            </a>
          )}
          {st?.cwd && (
            <a href={editorUrl(st.cwd)} className="ml-auto">
              <Button size="sm" variant="ghost">
                <Code2 size={12} /> Open folder
              </Button>
            </a>
          )}
        </div>
        <nav className="-mb-px mt-3 flex gap-4">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => useStore.setState({ tab: t.value })}
              className={cx('relative h-9 text-[12.5px] font-medium transition-colors', tab === t.value ? 'text-fg' : 'text-faint hover:text-muted')}
            >
              {t.label}
              {t.value === 'logs' && errors > 0 && <span className="ml-1.5 rounded-full bg-bad/15 px-1.5 text-[10px] tabular-nums text-red-300">{errors}</span>}
              {t.value === 'env' && st?.needsRestart && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-warn align-middle" />}
              {tab === t.value && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-accent" />}
            </button>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1">
        {tab === 'logs' && <LogView id={id} />}
        {tab === 'env' && <EnvTable id={id} />}
        {tab === 'http' && <HttpClient id={id} />}
        {tab === 'settings' && <Settings id={id} />}
      </div>
    </aside>
  )
}
