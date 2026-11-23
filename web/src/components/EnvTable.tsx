import { Eye, EyeOff, FileText, Lock, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { fail, isLive, serviceAction, useStore } from '../lib/store'
import { Button, cx, IconButton, Segmented } from './ui'

interface Row {
  key: string
  value: string
}

const SECRET = /secret|token|key|password|passwd|pass\b|private|credential|auth|dsn|api_?key/i

function toText(rows: Row[]) {
  return rows.map((r) => `${r.key}=${/[\s#"']/.test(r.value) ? JSON.stringify(r.value) : r.value}`).join('\n')
}

function fromText(text: string): Row[] {
  const rows: Row[] = []
  for (const line of text.split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][\w.-]*)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    let v = m[2].trim()
    if (/^".*"$/.test(v)) {
      try {
        v = JSON.parse(v)
      } catch {}
    } else if (/^'.*'$/.test(v)) v = v.slice(1, -1)
    else v = v.replace(/\s+#.*$/, '')
    rows.push({ key: m[1], value: v })
  }
  return rows
}

export default function EnvTable({ id }: { id: string }) {
  const pid = useStore((s) => s.pid)
  const st = useStore((s) => s.services[id])
  const envFile = useStore((s) => s.config?.services.find((x) => x.id === id)?.envFile)
  const [file, setFile] = useState<{ file?: string; exists: boolean; profile?: string; inherited?: Record<string, string> }>()
  const envProfile = useStore((s) => s.local.envProfile)
  const locked = useStore((s) => !!envProfile && !!s.config?.lockedEnvs?.includes(envProfile))
  const root = useStore((s) => s.root)
  const [saved, setSaved] = useState<Row[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [mode, setMode] = useState<'table' | 'raw'>('table')
  const [raw, setRaw] = useState('')
  const [reveal, setReveal] = useState(new Set<number>())
  const [revealAll, setRevealAll] = useState(false)

  const load = () =>
    api('GET', `/api/p/${pid}/s/${id}/env`).then((r) => {
      const list = Object.entries(r.vars as Record<string, string>).map(([key, value]) => ({ key, value }))
      setFile({ file: r.file, exists: r.exists, profile: r.profile, inherited: r.inherited })
      setSaved(list)
      setRows(list)
      setRaw(toText(list))
    }, fail)

  useEffect(() => {
    load()
    setReveal(new Set())
  }, [pid, id, envFile, envProfile])

  const current = mode === 'raw' ? fromText(raw) : rows
  const dirty = useMemo(() => JSON.stringify(current) !== JSON.stringify(saved), [current, saved])
  const dupes = new Set(current.map((r) => r.key).filter((k, i, a) => k && a.indexOf(k) !== i))

  const switchMode = (m: 'table' | 'raw') => {
    if (m === 'raw') setRaw(toText(rows))
    else setRows(fromText(raw))
    setMode(m)
  }

  const save = async () => {
    const vars: Record<string, string> = {}
    for (const r of current) if (r.key.trim()) vars[r.key.trim()] = r.value
    try {
      await api('PUT', `/api/p/${pid}/s/${id}/env`, { vars })
      await load()
      if (isLive(st))
        toast('Variables saved', { description: 'Restart to apply them.', action: { label: 'Restart', onClick: () => serviceAction(id, 'restart') } })
      else toast.success('Variables saved')
    } catch (e) {
      fail(e)
    }
  }

  const missing = (st?.missingEnv ?? []).filter((k) => !rows.some((r) => r.key === k))
  const edit = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <FileText size={13} className="shrink-0 text-faint" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted" title={file?.file}>
          {file?.file ? (
            <>
              {root && file.file.startsWith(root) ? file.file.slice(root.length + 1) : file.file}
              {!file.exists && <span className="ml-2 font-sans text-faint">(will be created)</span>}
              {file.profile && (
                <span className="ml-2 rounded-full bg-accent-soft px-1.5 py-0.5 font-sans text-[10px] text-violet-200">
                  {file.profile} profile · inherited values dimmed
                </span>
              )}
            </>
          ) : (
            <span className="font-sans">Stored in runcraft.json. Set an env file in Settings to use a .env file.</span>
          )}
        </span>
        <IconButton icon={revealAll ? EyeOff : Eye} label={revealAll ? 'Hide secrets' : 'Reveal all'} onClick={() => setRevealAll(!revealAll)} />
        <Segmented
          value={mode}
          onChange={switchMode}
          options={[
            { value: 'table', label: 'Table' },
            { value: 'raw', label: 'Raw' },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === 'raw' ? (
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            readOnly={locked}
            spellCheck={false}
            placeholder={'KEY=value\nOTHER_KEY="with spaces"'}
            className="h-full min-h-64 w-full resize-none bg-transparent p-4 font-mono text-[12px] leading-relaxed text-fg outline-none placeholder:text-faint"
          />
        ) : (
          <fieldset disabled={locked} className="p-2">
            {locked && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-[12px] text-red-300">
                <Lock size={13} className="shrink-0" />
                The {envProfile} profile is locked. Values are read-only. Unlock it in Settings to edit.
              </div>
            )}
            {!locked && missing.length > 0 && (
              <div className="mb-2 flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-[12px] text-amber-300">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  In .env.example but not set: <span className="font-mono">{missing.join(', ')}</span>
                </span>
                <button
                  onClick={() => setRows((rs) => [...rs, ...missing.map((key) => ({ key, value: '' }))])}
                  className="shrink-0 font-medium hover:underline"
                >
                  Add {missing.length === 1 ? 'it' : 'them'}
                </button>
              </div>
            )}
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-x-1 px-2 pb-1.5 pt-1 text-[11px] font-medium text-faint">
              <span>Key</span>
              <span>Value</span>
              <span className="w-14" />
            </div>
            {rows.map((r, i) => {
              const masked = SECRET.test(r.key) && !!r.value && !revealAll && !reveal.has(i)
              return (
                <div key={i} className="group grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-x-1 rounded-lg px-1 hover:bg-hover/60">
                  <input
                    value={r.key}
                    onChange={(e) => edit(i, { key: e.target.value.replace(/\s/g, '_') })}
                    spellCheck={false}
                    className={cx(
                      'h-8 rounded-md bg-transparent px-1.5 font-mono text-[12px] font-medium outline-none focus:bg-panel',
                      dupes.has(r.key) ? 'text-red-300' : 'text-violet-200',
                    )}
                  />
                  <input
                    value={masked ? '•'.repeat(Math.min(24, r.value.length || 8)) : r.value}
                    readOnly={masked}
                    onFocus={() => masked && setReveal((s) => new Set(s).add(i))}
                    onChange={(e) => edit(i, { value: e.target.value })}
                    spellCheck={false}
                    className={cx(
                      'h-8 rounded-md bg-transparent px-1.5 font-mono text-[12px] outline-none focus:bg-panel',
                      masked ? 'text-faint tracking-wider' : 'text-fg',
                    )}
                  />
                  <div className="flex w-14 justify-end opacity-0 transition-opacity group-hover:opacity-100">
                    {SECRET.test(r.key) && !!r.value && !revealAll && (
                      <IconButton
                        icon={reveal.has(i) ? EyeOff : Eye}
                        label={reveal.has(i) ? 'Hide value' : 'Show value'}
                        onClick={() =>
                          setReveal((s) => {
                            const n = new Set(s)
                            if (n.has(i)) n.delete(i)
                            else n.add(i)
                            return n
                          })
                        }
                      />
                    )}
                    <IconButton icon={Trash2} label="Delete" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="hover:text-red-300" />
                  </div>
                </div>
              )
            })}
            {file?.inherited &&
              Object.entries(file.inherited)
                .filter(([k]) => !rows.some((r) => r.key === k))
                .map(([k, v]) => (
                  <div
                    key={`inherited-${k}`}
                    className="group grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-x-1 rounded-lg px-1 opacity-60 hover:opacity-100"
                    title="Inherited from the base env file"
                  >
                    <span className="truncate px-1.5 font-mono text-[12px] text-muted">{k}</span>
                    <span className="truncate px-1.5 font-mono text-[12px] text-faint">{SECRET.test(k) && v && !revealAll ? '••••••••' : v}</span>
                    <button
                      onClick={() => setRows((rs) => [...rs, { key: k, value: v }])}
                      className="w-14 text-right text-[11px] text-faint opacity-0 hover:text-violet-300 group-hover:opacity-100"
                    >
                      Override
                    </button>
                  </div>
                ))}
            <button
              hidden={locked}
              onClick={() => setRows((rs) => [...rs, { key: '', value: '' }])}
              className="mt-1 flex h-8 w-full items-center gap-1.5 rounded-lg px-2.5 text-xs text-faint hover:bg-hover hover:text-fg"
            >
              <Plus size={13} /> Add variable
            </button>
            {!rows.length && !locked && <p className="px-2.5 pt-2 text-[11px] text-faint">No variables yet. Paste a whole .env in Raw mode to import it.</p>}
          </fieldset>
        )}
      </div>

      <div className={cx('flex items-center gap-2 border-t border-line px-4 py-2.5 transition-colors', dirty && 'bg-accent-soft')}>
        <span className="flex-1 text-[11px] text-faint">
          {dupes.size ? (
            <span className="text-red-300">Duplicate keys: {[...dupes].join(', ')}</span>
          ) : dirty ? (
            'Unsaved changes'
          ) : (
            `${current.length} variables`
          )}
          {!dirty && st?.needsRestart && <span className="ml-2 text-amber-300">Restart needed to apply</span>}
        </span>
        <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => (setRows(saved), setRaw(toText(saved)))}>
          Discard
        </Button>
        <Button size="sm" variant="primary" disabled={!dirty || dupes.size > 0} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  )
}
