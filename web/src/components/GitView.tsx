import { DiffEditor, loader, type MonacoDiffEditor } from '@monaco-editor/react'
import { Code2, FileDiff, GitBranch, RefreshCw, Save } from 'lucide-react'
import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/basic-languages/monaco.contribution'
import 'monaco-editor/features/codicon/register'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { editorUrl, fail, useStore } from '../lib/store'
import { useTheme } from '../lib/theme'
import type { GitFile } from '../lib/types'
import { Button, cx, Empty, IconButton, Segmented, Toggle } from './ui'

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }
loader.config({ monaco })
monaco.editor.defineTheme('runcraft', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#0a0a0d',
    'editorGutter.background': '#0a0a0d',
    'editor.lineHighlightBackground': '#ffffff06',
    'editorLineNumber.foreground': '#3f3f4a',
    'diffEditor.insertedTextBackground': '#22c55e22',
    'diffEditor.removedTextBackground': '#f0444426',
    'diffEditor.insertedLineBackground': '#22c55e10',
    'diffEditor.removedLineBackground': '#f0444412',
  },
})
monaco.editor.defineTheme('runcraft-light', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#fbfbfc',
    'editorGutter.background': '#fbfbfc',
    'editorLineNumber.foreground': '#b4b4bf',
    'diffEditor.insertedTextBackground': '#22c55e2e',
    'diffEditor.removedTextBackground': '#f0444428',
  },
})

const LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  vue: 'html',
  svelte: 'html',
  md: 'markdown',
  mdx: 'markdown',
  py: 'python',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  java: 'java',
  kt: 'kotlin',
  php: 'php',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  sql: 'sql',
  graphql: 'graphql',
  dockerfile: 'dockerfile',
  xml: 'xml',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cs: 'csharp',
  toml: 'ini',
  env: 'ini',
}
const langOf = (p: string) => LANG[p.split('/').pop()!.toLowerCase().split('.').pop()!] ?? (/dockerfile/i.test(p) ? 'dockerfile' : 'plaintext')

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  M: { label: 'Modified', cls: 'text-amber-300' },
  A: { label: 'Added', cls: 'text-emerald-300' },
  U: { label: 'Untracked', cls: 'text-emerald-300' },
  D: { label: 'Deleted', cls: 'text-red-300' },
  R: { label: 'Renamed', cls: 'text-sky-300' },
  C: { label: 'Copied', cls: 'text-sky-300' },
}

interface Diff {
  path: string
  abs?: string
  original: string
  modified: string
  binary?: boolean
  deleted?: boolean
  tooLarge?: boolean
}

interface Status {
  root: string | null
  branch?: string
  files: GitFile[]
}

export default function GitView() {
  const pid = useStore((s) => s.pid)
  const theme = useTheme((s) => s.theme)
  const [status, setStatus] = useState<Status>()
  const [selected, setSelected] = useState<string>()
  const [diff, setDiff] = useState<Diff>()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [inline, setInline] = useState(() => localStorage.getItem('runcraft.inline') === '1')
  const [autosave, setAutosave] = useState(() => localStorage.getItem('runcraft.autosave') === '1')
  const editorRef = useRef<MonacoDiffEditor>(null)
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts
  // Latest on-disk content, so reloads from disk aren't mistaken for user edits.
  const diskRef = useRef('')

  const refresh = useCallback(() => api<Status>('GET', `/api/p/${pid}/git`).then(setStatus, fail), [pid])

  const loadDiff = useCallback(
    async (path: string) => {
      const d = await api<Diff>('GET', `/api/p/${pid}/git/diff?path=${encodeURIComponent(path)}`).catch(fail)
      if (d) diskRef.current = d.modified
      if (d) setDiff((prev) => (prev?.path === d.path && prev.modified === d.modified && prev.original === d.original ? prev : d))
    },
    [pid],
  )

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 4000)
    return () => clearInterval(t)
  }, [refresh])

  useEffect(() => {
    if (!selected && status?.files.length) setSelected(status.files[0].path)
  }, [status, selected])

  // Re-read the open file on each poll so edits made elsewhere show up, unless there is an unsaved draft.
  useEffect(() => {
    if (selected && draftsRef.current[selected] === undefined) loadDiff(selected)
  }, [selected, status, loadDiff])

  const save = useCallback(
    async (path: string) => {
      const content = draftsRef.current[path]
      if (content === undefined) return
      try {
        await api('PUT', `/api/p/${pid}/git/file`, { path, content })
        diskRef.current = content
        setDrafts(({ [path]: _, ...rest }) => rest)
        setDiff((d) => (d && d.path === path ? { ...d, modified: content } : d))
        refresh()
      } catch (e) {
        fail(e)
      }
    },
    [pid, refresh],
  )

  useEffect(() => {
    if (!autosave || !selected || drafts[selected] === undefined) return
    const t = setTimeout(() => save(selected), 800)
    return () => clearTimeout(t)
  }, [drafts, autosave, selected, save])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && selected) {
        e.preventDefault()
        save(selected).then(() => toast.success('Saved'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, save])

  if (status && !status.root)
    return (
      <Empty icon={GitBranch} title="Not a git repository">
        Run git init in this project to review changes here.
      </Empty>
    )

  const files = status?.files ?? []
  const dirty = selected ? drafts[selected] !== undefined : false
  const content = diff && selected === diff.path ? (drafts[diff.path] ?? diff.modified) : ''

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <GitBranch size={14} className="text-faint" />
          <span className="truncate font-mono text-xs">{status?.branch}</span>
          <span className="ml-auto text-[11px] text-faint">{files.length} changed</span>
          <IconButton icon={RefreshCw} label="Refresh" onClick={refresh} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {!files.length && status && <div className="p-6 text-center text-xs text-faint">Working tree clean.</div>}
          {files.map((f) => {
            const name = f.path.split('/').pop()
            const dir = f.path.slice(0, -name!.length - 1)
            const s = STATUS_STYLE[f.status] ?? { label: f.status, cls: 'text-muted' }
            return (
              <button
                key={f.path}
                onClick={() => setSelected(f.path)}
                title={`${s.label}: ${f.path}`}
                className={cx(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors',
                  selected === f.path ? 'bg-hover' : 'hover:bg-hover/60',
                )}
              >
                <span className="min-w-0 flex-1 truncate text-[12.5px]">
                  {name}
                  {dir && <span className="ml-1.5 text-[11px] text-faint">{dir}</span>}
                </span>
                {drafts[f.path] !== undefined && <span className="size-1.5 rounded-full bg-violet-400" title="Unsaved" />}
                {f.added != null && (
                  <span className="font-mono text-[10.5px] tabular-nums">
                    <span className="text-emerald-400/80">+{f.added}</span> <span className="text-red-400/80">−{f.removed}</span>
                  </span>
                )}
                <span className={cx('w-3 text-center font-mono text-[11px] font-bold', s.cls)}>{f.status}</span>
              </button>
            )
          })}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {selected && diff ? (
          <>
            <div className="flex items-center gap-3 border-b border-line px-4 py-2">
              <span className="min-w-0 truncate font-mono text-xs">
                {selected}
                {dirty && <span className="ml-2 font-sans text-[11px] text-violet-300">● unsaved</span>}
              </span>
              <div className="ml-auto flex items-center gap-3">
                <Toggle
                  checked={autosave}
                  onChange={(v) => {
                    setAutosave(v)
                    localStorage.setItem('runcraft.autosave', v ? '1' : '0')
                  }}
                  label="Autosave"
                />
                <Segmented
                  value={inline ? 'inline' : 'split'}
                  onChange={(v) => {
                    setInline(v === 'inline')
                    localStorage.setItem('runcraft.inline', v === 'inline' ? '1' : '0')
                  }}
                  options={[
                    { value: 'split', label: 'Side by side' },
                    { value: 'inline', label: 'Inline' },
                  ]}
                />
                {diff.abs && (
                  <a href={editorUrl(diff.abs)}>
                    <Button size="sm" variant="ghost">
                      <Code2 size={12} /> Open in editor
                    </Button>
                  </a>
                )}
                <Button size="sm" variant="primary" disabled={!dirty} onClick={() => save(selected)}>
                  <Save size={12} /> Save
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              {diff.binary || diff.tooLarge ? (
                <Empty icon={FileDiff} title={diff.binary ? 'Binary file' : 'File too large to show'} />
              ) : (
                <DiffEditor
                  key={selected}
                  theme={theme === 'light' ? 'runcraft-light' : 'runcraft'}
                  language={langOf(selected)}
                  original={diff.original}
                  modified={content}
                  onMount={(editor) => {
                    editorRef.current = editor
                    const modified = editor.getModifiedEditor()
                    modified.onDidChangeModelContent(() => {
                      const value = modified.getValue()
                      setDrafts((d) => {
                        if (value === diskRef.current) {
                          const { [selected]: _, ...rest } = d
                          return rest
                        }
                        return { ...d, [selected]: value }
                      })
                    })
                  }}
                  options={{
                    renderSideBySide: !inline,
                    originalEditable: false,
                    readOnly: diff.deleted,
                    minimap: { enabled: false },
                    fontSize: 12,
                    fontFamily: 'JetBrains Mono Variable, monospace',
                    lineHeight: 19,
                    scrollBeyondLastLine: false,
                    renderOverviewRuler: false,
                    automaticLayout: true,
                    hideUnchangedRegions: { enabled: true },
                    padding: { top: 8 },
                  }}
                />
              )}
            </div>
          </>
        ) : (
          <Empty icon={FileDiff} title={files.length ? 'Pick a file' : 'Nothing to review'}>
            {files.length ? 'Select a changed file to see its diff and edit it.' : 'Uncommitted changes in this repository will appear here.'}
          </Empty>
        )}
      </section>
    </div>
  )
}
