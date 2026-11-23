import { ArrowUpRight, Copy, Radio, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { fail, useStore } from '../lib/store'
import type { TrafficEntry } from '../lib/types'
import { cx, IconButton, Segmented } from './ui'

const ASSET = /\.(m?js|jsx|tsx?|css|map|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf)(\?|$)|^\/(@|node_modules\/|__vite)/

const pretty = (body: string) => {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour12: false })
const header = (h: Record<string, unknown>, k: string) => (h[k] == null ? '' : String(h[k]))

const statusTone = (s: number) => (!s ? 'text-faint' : s < 300 ? 'text-emerald-300' : s < 400 ? 'text-sky-300' : s < 500 ? 'text-amber-300' : 'text-red-300')

const methodTone: Record<string, string> = {
  GET: 'text-sky-300',
  POST: 'text-emerald-300',
  PUT: 'text-amber-300',
  PATCH: 'text-violet-300',
  DELETE: 'text-red-300',
}

const SKIP_HEADERS = new Set(['host', 'connection', 'content-length', 'accept-encoding'])

function curl(e: TrafficEntry, port?: number) {
  const parts = [`curl -X ${e.method} 'http://${e.host ?? `localhost:${port}`}${e.url}'`]
  for (const [k, v] of Object.entries(e.reqHeaders)) if (!SKIP_HEADERS.has(k)) parts.push(`-H '${k}: ${String(v).replace(/'/g, "'\\''")}'`)
  if (e.req.body) parts.push(`--data '${e.req.body.replace(/'/g, "'\\''")}'`)
  return parts.join(' \\\n  ')
}

function Headers({ headers }: { headers: Record<string, unknown> }) {
  const rows = Object.entries(headers)
  if (!rows.length) return <p className="text-[11px] text-faint">No headers</p>
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,5fr)] gap-x-3 gap-y-1 font-mono text-[11.5px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <span className="truncate text-muted">{k}</span>
          <span className="break-all text-fg">{Array.isArray(v) ? v.join(', ') : String(v)}</span>
        </div>
      ))}
    </div>
  )
}

function Body({ part, type }: { part: TrafficEntry['req']; type: string }) {
  if (!part.size) return <p className="text-[11px] text-faint">No body</p>
  if (part.body == null) return <p className="text-[11px] text-faint">{bytes(part.size)} of binary or compressed data, not shown</p>
  return (
    <>
      <pre className="whitespace-pre-wrap break-all font-mono text-[11.5px] leading-relaxed text-fg">{/json/.test(type) ? pretty(part.body) : part.body}</pre>
      {part.truncated && <p className="mt-2 text-[11px] text-faint">Showing the first 32 KB of {bytes(part.size)}</p>}
    </>
  )
}

function Detail({ e, port, onClose }: { e: TrafficEntry; port?: number; onClose: () => void }) {
  const [side, setSide] = useState<'response' | 'request'>('response')
  const headers = side === 'request' ? e.reqHeaders : e.resHeaders
  const part = side === 'request' ? e.req : e.res

  const openInHttp = () => {
    const keep = Object.entries(e.reqHeaders).filter(([k]) => !SKIP_HEADERS.has(k))
    useStore.setState({
      tab: 'http',
      httpDraft: {
        id: '',
        name: '',
        method: e.method,
        url: `http://localhost:${port ?? e.host?.split(':')[1] ?? 3000}${e.url}`,
        headers: Object.fromEntries(keep.map(([k, v]) => [k, String(v)])),
        body: e.req.body ?? '',
      },
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-line-strong bg-panel">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className={cx('font-mono text-[12px] font-semibold', methodTone[e.method] ?? 'text-muted')}>{e.method}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg" title={e.url}>
          {e.url}
        </span>
        <span className={cx('font-mono text-[12px] font-medium', statusTone(e.status))}>{e.status || 'aborted'}</span>
        <span className="font-mono text-[11px] text-faint">{e.ms} ms</span>
        <IconButton icon={X} label="Close" onClick={onClose} />
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <Segmented
          value={side}
          onChange={setSide}
          options={[
            { value: 'response', label: 'Response' },
            { value: 'request', label: 'Request' },
          ]}
        />
        <button
          onClick={openInHttp}
          className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] text-muted transition-colors hover:bg-hover hover:text-fg"
        >
          <ArrowUpRight size={12} /> Replay in HTTP
        </button>
        <button
          onClick={() => navigator.clipboard.writeText(curl(e, port)).then(() => toast.success('Copied as cURL'), fail)}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] text-muted transition-colors hover:bg-hover hover:text-fg"
        >
          <Copy size={12} /> cURL
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        <section>
          <h4 className="mb-1.5 text-[11px] font-medium text-faint">Headers</h4>
          <Headers headers={headers} />
        </section>
        <section>
          <h4 className="mb-1.5 text-[11px] font-medium text-faint">Body {part.size > 0 && <span className="font-normal">· {bytes(part.size)}</span>}</h4>
          <Body part={part} type={header(headers, 'content-type')} />
        </section>
      </div>
    </div>
  )
}

export default function TrafficView({ id }: { id: string }) {
  const pid = useStore((s) => s.pid)
  const port = useStore((s) => s.services[id]?.port)
  const entries = useStore((s) => s.traffic[id])
  const [query, setQuery] = useState('')
  const [hideAssets, setHideAssets] = useState(true)
  const [selected, setSelected] = useState<number>()

  useEffect(() => {
    setSelected(undefined)
    api<TrafficEntry[]>('GET', `/api/p/${pid}/s/${id}/traffic`).then((list) => useStore.setState((s) => ({ traffic: { ...s.traffic, [id]: list } })), fail)
  }, [pid, id])

  const shown = useMemo(() => {
    const q = query.toLowerCase()
    return (entries ?? [])
      .filter((e) => !hideAssets || !ASSET.test(e.url))
      .filter((e) => !q || `${e.method} ${e.url} ${e.status}`.toLowerCase().includes(q))
      .reverse()
  }, [entries, query, hideAssets])
  const current = entries?.find((e) => e.seq === selected)
  const hidden = (entries?.length ?? 0) - shown.length

  const clear = () => {
    api('DELETE', `/api/p/${pid}/s/${id}/traffic`).catch(fail)
    useStore.setState((s) => ({ traffic: { ...s.traffic, [id]: [] } }))
    setSelected(undefined)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="relative min-w-0 flex-1">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by path, method or status"
            className="h-7 w-full rounded-md border border-line bg-bg pl-7 pr-2 text-[12px] outline-none placeholder:text-faint focus:border-line-strong"
          />
        </div>
        <button
          onClick={() => setHideAssets(!hideAssets)}
          className={cx(
            'h-7 shrink-0 rounded-md border px-2.5 text-[12px] transition-colors',
            hideAssets ? 'border-accent/40 bg-accent-soft text-violet-200' : 'border-line text-muted hover:bg-hover hover:text-fg',
          )}
          title="Hide scripts, styles, images and fonts"
        >
          Hide assets
        </button>
        <IconButton icon={Trash2} label="Clear" onClick={clear} disabled={!entries?.length} />
      </div>

      <div className={cx('min-h-0 overflow-y-auto', current ? 'h-2/5 shrink-0' : 'flex-1')}>
        {shown.map((e) => (
          <button
            key={e.seq}
            onClick={() => setSelected(e.seq === selected ? undefined : e.seq)}
            className={cx(
              'grid w-full grid-cols-[58px_52px_minmax(0,1fr)_40px_56px] items-center gap-2 border-b border-line/50 px-3 py-1.5 text-left font-mono text-[11.5px] transition-colors',
              e.seq === selected ? 'bg-accent-soft' : 'hover:bg-hover/60',
            )}
          >
            <span className="text-faint">{clock(e.t)}</span>
            <span className={cx('font-semibold', methodTone[e.method] ?? 'text-muted')}>{e.method}</span>
            <span className="truncate text-fg" title={e.url}>
              {e.url}
            </span>
            <span className={cx('text-right font-medium', statusTone(e.status))}>{e.status || '—'}</span>
            <span className={cx('text-right', e.ms > 1000 ? 'text-amber-300' : 'text-faint')}>{e.ms} ms</span>
          </button>
        ))}
        {entries && !shown.length && (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Radio size={18} className="text-faint" />
            <p className="text-[12.5px] text-muted">{entries.length ? 'No requests match' : 'No requests yet'}</p>
            {!entries.length && (
              <p className="max-w-sm text-[11.5px] leading-relaxed text-faint">
                Requests to this service show up here as they happen. Capture works for Node.js servers started by Runcraft. If the dev script sets
                <span className="font-mono"> NODE_OPTIONS</span> itself, restart without it to capture.
              </p>
            )}
            {hidden > 0 && (
              <button onClick={() => setHideAssets(false)} className="text-[11.5px] text-violet-300 hover:underline">
                Show {hidden} hidden asset requests
              </button>
            )}
          </div>
        )}
      </div>

      {current && <Detail e={current} port={port} onClose={() => setSelected(undefined)} />}
    </div>
  )
}
