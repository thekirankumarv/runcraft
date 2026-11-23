import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { ChevronDown, Play, Plus, RotateCw, SquareTerminal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, token } from '../lib/api'
import { fail, tildify, useStore } from '../lib/store'
import { useTheme } from '../lib/theme'
import { cx, Menu, MenuItem } from './ui'

interface Tab {
  id: string
  title: string
  cwd?: string
  cmd?: string
  exited?: boolean
}

interface ScriptGroup {
  label: string
  cwd: string
  scripts: { name: string; script: string; command: string }[]
}

let handled = 0

const DARK_ANSI = [
  '#000000',
  '#cd3131',
  '#0dbc79',
  '#e5e510',
  '#2472c8',
  '#bc3fbc',
  '#11a8cd',
  '#e5e5e5',
  '#666666',
  '#f14c4c',
  '#23d18b',
  '#f5f543',
  '#3b8eea',
  '#d670d6',
  '#29b8db',
  '#ffffff',
]

function themeFromCss(theme: 'dark' | 'light') {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  const ansi = theme === 'dark' ? DARK_ANSI : Array.from({ length: 16 }, (_, i) => v(`--ansi-${i}`))
  return {
    background: v('--color-term'),
    foreground: v('--color-term-fg'),
    cursor: v('--color-accent'),
    cursorAccent: v('--color-term'),
    selectionBackground: '#8b5cf640',
    ...Object.fromEntries(
      ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'].flatMap((name, i) => [
        [name, ansi[i]],
        [`bright${name[0].toUpperCase()}${name.slice(1)}`, ansi[i + 8]],
      ]),
    ),
  }
}

function Pane({
  tab: { id, cwd, cmd },
  pid,
  active,
  onTitle,
  onExit,
}: {
  tab: Tab
  pid: string
  active: boolean
  onTitle: (t: string) => void
  onExit: () => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal>(null)
  const fit = useRef<FitAddon>(null)
  const theme = useTheme((s) => s.theme)

  useEffect(() => {
    const t = new Terminal({
      fontFamily:
        "'JetBrains Mono Variable', 'MesloLGS NF', 'MesloLGS Nerd Font Mono', 'JetBrainsMono Nerd Font', 'Hack Nerd Font', 'Symbols Nerd Font Mono', ui-monospace, monospace",
      fontSize: 12.5,
      lineHeight: 1.35,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      theme: themeFromCss(useTheme.getState().theme),
    })
    const f = new FitAddon()
    t.loadAddon(f)
    t.open(el.current!)
    f.fit()
    term.current = t
    fit.current = f

    const qs = new URLSearchParams({ t: token, p: pid, id, cwd: cwd ?? '', cmd: cmd ?? '', cols: String(t.cols), rows: String(t.rows) })
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/term?${qs}`)
    const send = (msg: object) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg))
    ws.onmessage = (e) => t.write(e.data)
    ws.onopen = () => send({ t: 'r', cols: t.cols, rows: t.rows })
    ws.onclose = (e) => {
      t.write(`\r\n\x1b[2m${e.reason || 'Disconnected from Runcraft'}\x1b[0m\r\n`)
      onExit()
    }
    t.onData((d) => send({ t: 'i', d }))
    t.onResize(({ cols, rows }) => send({ t: 'r', cols, rows }))
    t.onTitleChange((title) => {
      const clean = title.replace(/^[^@\s]+@[^:\s]+:\s*/, '')
      if (clean) onTitle(clean)
    })

    const ro = new ResizeObserver(() => requestAnimationFrame(() => el.current?.offsetWidth && f.fit()))
    ro.observe(el.current!)
    return () => {
      ro.disconnect()
      ws.onclose = null
      ws.close()
      t.dispose()
    }
  }, [id, pid])

  useEffect(() => {
    if (!active) return
    fit.current?.fit()
    term.current?.focus()
  }, [active])

  useEffect(() => {
    if (term.current) term.current.options.theme = themeFromCss(theme)
  }, [theme])

  return <div ref={el} className={cx('absolute inset-0 py-2 pl-3', !active && 'invisible')} />
}

export default function TerminalView() {
  const pid = useStore((s) => s.pid)!
  const root = useStore((s) => s.root)
  const folder = tildify(root).split('/').pop() || '~'
  const [tabs, setTabs] = useState<Tab[]>()
  const [active, setActive] = useState('')
  const [scripts, setScripts] = useState<ScriptGroup[]>([])
  const loadScripts = () => api<ScriptGroup[]>('GET', `/api/p/${pid}/scripts`).then(setScripts, () => {})
  const req = useStore((s) => s.termRequest)
  const fresh = (): Tab => ({ id: crypto.randomUUID(), title: folder })

  useEffect(() => {
    let current = true
    api<string[]>('GET', `/api/p/${pid}/terminals`)
      .catch(() => [])
      .then((ids) => {
        if (!current) return
        const pending = (useStore.getState().termRequest?.n ?? 0) > handled
        const list = ids.length || pending ? ids.map((id) => ({ id, title: folder })) : [fresh()]
        setTabs(list)
        if (list.length) setActive(list[list.length - 1].id)
      })
    loadScripts()
    return () => {
      current = false
    }
  }, [pid])

  useEffect(() => {
    if (!tabs || !req || req.n <= handled) return
    handled = req.n
    const tab = { ...fresh(), title: req.title ?? folder, cwd: req.cwd, cmd: req.cmd }
    setTabs((ts) => [...(ts ?? []), tab])
    setActive(tab.id)
  }, [req, tabs])

  const add = () => {
    const tab = fresh()
    setTabs((ts) => [...(ts ?? []), tab])
    setActive(tab.id)
  }
  const close = (id: string) => {
    api('DELETE', `/api/p/${pid}/terminals/${id}`).catch(fail)
    const list = tabs ?? []
    const i = list.findIndex((t) => t.id === id)
    const rest = list.filter((t) => t.id !== id)
    setTabs(rest)
    if (id === active && rest.length) setActive(rest[Math.min(i, rest.length - 1)].id)
  }
  const restart = (id: string) => {
    const tab = fresh()
    setTabs((ts) => ts?.map((t) => (t.id === id ? tab : t)))
    setActive(tab.id)
  }
  const patch = (id: string, p: Partial<Tab>) => setTabs((ts) => ts?.map((t) => (t.id === id ? { ...t, ...p } : t)))
  if (!tabs) return <div className="h-full bg-term" />

  return (
    <div className="flex h-full flex-col bg-term">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
        {tabs.map((t) => (
          <div
            key={t.id}
            onMouseDown={(e) => e.button === 1 && (e.preventDefault(), close(t.id))}
            onClick={() => setActive(t.id)}
            className={cx(
              'group flex h-7 min-w-0 max-w-56 flex-1 cursor-default items-center gap-2 rounded-md border pl-2.5 pr-1 text-[12px] transition-colors',
              t.id === active ? 'border-line-strong bg-raised text-fg shadow-sm' : 'border-transparent text-faint hover:bg-hover hover:text-muted',
            )}
          >
            <SquareTerminal size={13} className={cx('shrink-0', t.exited ? 'text-faint' : t.id === active && 'text-violet-300')} />
            <span className={cx('min-w-0 flex-1 truncate', t.exited && 'line-through decoration-faint/60')} title={t.title}>
              {t.title}
            </span>
            <button
              aria-label="Close terminal"
              onClick={(e) => (e.stopPropagation(), close(t.id))}
              className={cx(
                'inline-flex size-5 shrink-0 items-center justify-center rounded text-faint hover:bg-hover hover:text-fg',
                t.id === active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          aria-label="New terminal"
          onClick={add}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-fg"
        >
          <Plus size={14} />
        </button>
        {scripts.length > 0 && (
          <div className="ml-auto shrink-0">
            <Menu
              align="right"
              width="w-80"
              trigger={(open) => (
                <button
                  onClick={() => !open && loadScripts()}
                  className={cx(
                    'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors',
                    open ? 'border-line-strong bg-hover text-fg' : 'border-line text-muted hover:bg-hover hover:text-fg',
                  )}
                >
                  <Play size={11} className="fill-current text-emerald-400" /> Run script <ChevronDown size={12} className="text-faint" />
                </button>
              )}
            >
              {(close) => (
                <div className="max-h-96 overflow-y-auto">
                  {scripts.map((g) => (
                    <div key={g.cwd}>
                      {scripts.length > 1 && (
                        <div className="flex items-baseline gap-2 px-2.5 pb-1 pt-2 text-[11px] font-medium text-faint">
                          {g.label}
                          {g.cwd !== '.' && <span className="truncate font-mono font-normal">{g.cwd}</span>}
                        </div>
                      )}
                      {g.scripts.map((sc) => (
                        <MenuItem
                          key={sc.name}
                          hint={<span className="block max-w-40 truncate font-mono">{sc.script}</span>}
                          onClick={() => {
                            close()
                            const tab = { ...fresh(), title: sc.name, cwd: g.cwd, cmd: sc.command }
                            setTabs((ts) => [...(ts ?? []), tab])
                            setActive(tab.id)
                          }}
                        >
                          <span className="font-mono text-[12.5px]">{sc.name}</span>
                        </MenuItem>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </Menu>
          </div>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        {tabs.map((t) => (
          <Pane
            key={t.id}
            tab={t}
            pid={pid}
            active={t.id === active}
            onTitle={(title) => patch(t.id, { title })}
            onExit={() => patch(t.id, { exited: true })}
          />
        ))}
        {tabs.map(
          (t) =>
            t.exited &&
            t.id === active && (
              <div
                key={t.id}
                className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-line-strong bg-raised px-3 py-2 text-xs text-muted shadow-lg"
              >
                Session ended
                <button
                  onClick={() => restart(t.id)}
                  className="inline-flex h-6 items-center gap-1.5 rounded-md border border-line px-2 font-medium text-fg transition-colors hover:bg-hover"
                >
                  <RotateCw size={11} /> Restart
                </button>
              </div>
            ),
        )}
        {!tabs.length && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-xs text-faint">
            No terminals open.
            <button onClick={add} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-muted hover:bg-hover hover:text-fg">
              <Plus size={13} /> New terminal
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
