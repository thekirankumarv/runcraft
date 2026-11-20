import { Bookmark, Plus, Send, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { fail, updateService, useStore } from '../lib/store'
import type { SavedRequest } from '../lib/types'
import { Button, cx, IconButton, inputClass } from './ui'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

interface Response {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  size: number
  ms: number
}

const pretty = (body: string) => {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

export default function HttpClient({ id }: { id: string }) {
  const port = useStore((s) => s.services[id]?.port)
  const saved = useStore((s) => s.config?.services.find((x) => x.id === id)?.requests) ?? []
  const [req, setReq] = useState<SavedRequest>({ id: '', name: '', method: 'GET', url: `http://localhost:${port ?? 3000}/`, body: '' })
  const [headers, setHeaders] = useState<[string, string][]>([['content-type', 'application/json']])
  const [res, setRes] = useState<Response | null>(null)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'body' | 'headers'>('body')

  useEffect(() => {
    setRes(null)
    setReq((r) => ({ ...r, url: `http://localhost:${port ?? 3000}/` }))
  }, [id])

  const send = async () => {
    setLoading(true)
    try {
      setRes(await api('POST', '/api/http', { method: req.method, url: req.url, headers: Object.fromEntries(headers.filter(([k]) => k)), body: req.body }))
      setView('body')
    } catch (e) {
      fail(e)
    } finally {
      setLoading(false)
    }
  }

  const save = () => {
    const name = req.name || `${req.method} ${new URL(req.url, 'http://x').pathname}`
    const entry = { ...req, name, id: req.id || crypto.randomUUID().slice(0, 8), headers: Object.fromEntries(headers.filter(([k]) => k)) }
    setReq(entry)
    updateService(id, { requests: [...saved.filter((s) => s.id !== entry.id), entry] })
  }

  const load = (r: SavedRequest) => {
    setReq(r)
    setHeaders(Object.entries(r.headers ?? {}))
    setRes(null)
  }

  const hasBody = !['GET', 'HEAD'].includes(req.method)
  const tone = !res
    ? ''
    : res.status < 300
      ? 'text-emerald-300 bg-ok/10'
      : res.status < 400
        ? 'text-sky-300 bg-sky-500/10'
        : res.status < 500
          ? 'text-amber-300 bg-warn/10'
          : 'text-red-300 bg-bad/10'

  return (
    <div className="flex h-full min-h-0 flex-col">
      {saved.length > 0 && (
        <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2">
          {saved.map((s) => (
            <span
              key={s.id}
              className={cx(
                'group inline-flex h-6 shrink-0 items-center gap-1 rounded-md border pl-2 pr-0.5 text-[11px]',
                s.id === req.id ? 'border-accent/50 bg-accent-soft text-violet-200' : 'border-line text-muted hover:bg-hover',
              )}
            >
              <button onClick={() => load(s)} className="inline-flex items-center gap-1.5">
                <span className="font-mono text-[10px] font-semibold text-faint">{s.method}</span>
                {s.name}
              </button>
              <button
                onClick={() => updateService(id, { requests: saved.filter((x) => x.id !== s.id) })}
                className="rounded p-0.5 text-faint opacity-0 hover:text-red-300 group-hover:opacity-100"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="space-y-2 border-b border-line p-3">
        <div className="flex gap-1.5">
          <select
            value={req.method}
            onChange={(e) => setReq({ ...req, method: e.target.value })}
            className={cx(inputClass, 'max-w-24 shrink-0 font-mono text-[12px] font-semibold')}
          >
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <input
            value={req.url}
            onChange={(e) => setReq({ ...req, url: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            className={cx(inputClass, 'min-w-0 flex-1 font-mono text-[12px]')}
            spellCheck={false}
          />
          <Button variant="primary" onClick={send} disabled={loading}>
            <Send size={13} /> {loading ? 'Sending' : 'Send'}
          </Button>
          <IconButton icon={Bookmark} label="Save request" onClick={save} className="size-8" />
        </div>
        <details className="group">
          <summary className="cursor-pointer select-none text-[11px] text-faint hover:text-muted">Headers ({headers.filter(([k]) => k).length})</summary>
          <div className="mt-1.5 space-y-1">
            {headers.map(([k, v], i) => (
              <div key={i} className="flex gap-1">
                <input
                  value={k}
                  placeholder="Header"
                  onChange={(e) => setHeaders(headers.map((h, j) => (j === i ? [e.target.value, h[1]] : h)))}
                  className={cx(inputClass, 'h-7 font-mono text-[11px]')}
                />
                <input
                  value={v}
                  placeholder="Value"
                  onChange={(e) => setHeaders(headers.map((h, j) => (j === i ? [h[0], e.target.value] : h)))}
                  className={cx(inputClass, 'h-7 font-mono text-[11px]')}
                />
                <IconButton icon={Trash2} label="Remove" onClick={() => setHeaders(headers.filter((_, j) => j !== i))} />
              </div>
            ))}
            <button onClick={() => setHeaders([...headers, ['', '']])} className="inline-flex items-center gap-1 text-[11px] text-faint hover:text-fg">
              <Plus size={11} /> Add header
            </button>
          </div>
        </details>
        {hasBody && (
          <textarea
            value={req.body}
            onChange={(e) => setReq({ ...req, body: e.target.value })}
            placeholder='{"hello": "world"}'
            spellCheck={false}
            rows={5}
            className={cx(inputClass, 'h-auto resize-y py-2 font-mono text-[12px]')}
          />
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {res ? (
          <>
            <div className="flex items-center gap-3 border-b border-line px-3 py-2 text-[11px]">
              <span className={cx('rounded-md px-1.5 py-0.5 font-mono font-semibold', tone)}>
                {res.status} {res.statusText}
              </span>
              <span className="text-faint">{res.ms} ms</span>
              <span className="text-faint">{res.size > 1024 ? `${(res.size / 1024).toFixed(1)} KB` : `${res.size} B`}</span>
              <div className="ml-auto flex gap-2">
                {(['body', 'headers'] as const).map((v) => (
                  <button key={v} onClick={() => setView(v)} className={cx('capitalize', view === v ? 'text-fg' : 'text-faint hover:text-muted')}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all bg-term p-3 font-mono text-[11.5px] leading-relaxed text-term-fg">
              {view === 'body'
                ? pretty(res.body) || <span className="text-faint">Empty body</span>
                : Object.entries(res.headers).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-violet-300">{k}</span>: {v}
                    </div>
                  ))}
            </pre>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-faint">Send a request to see the response. Press Enter in the URL field.</div>
        )}
      </div>
    </div>
  )
}
