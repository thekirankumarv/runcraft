import {
  AlertCircle,
  Check,
  ChevronDown,
  Download,
  FolderOpen,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  Layers,
  ListChecks,
  Network,
  Play,
  Plug,
  Settings,
  Square,
  Trash2,
  Upload,
  Workflow,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  fail,
  isLive,
  loadProjects,
  openProject,
  removeProject,
  saveConfig,
  saveLocal,
  startServices,
  stopServices,
  tildify,
  useStore,
  type View,
} from '../lib/store'
import { Button, cx, Dialog, Kbd, Menu, MenuItem, MenuLabel, MenuSeparator, ServiceIcon } from './ui'

function ProjectMenu() {
  const projects = useStore((s) => s.projects)
  const pid = useStore((s) => s.pid)
  const config = useStore((s) => s.config)
  const fileRef = useRef<HTMLInputElement>(null)

  const exportConfig = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'runcraft.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importConfig = async (file: File) => {
    try {
      await saveConfig(JSON.parse(await file.text()))
      toast.success('Configuration imported')
    } catch (e) {
      fail(e)
    }
  }

  return (
    <>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importConfig(e.target.files[0])} />
      <Menu
        width="w-80"
        trigger={(open) => (
          <button onClick={() => !open && loadProjects()} className="flex h-8 items-center gap-2 rounded-lg px-2 hover:bg-hover">
            <span className="max-w-48 truncate text-[13px] font-semibold">{config?.name ?? 'No project'}</span>
            <ChevronDown size={13} className="text-faint" />
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuLabel>Projects</MenuLabel>
            <div className="max-h-72 overflow-y-auto">
              {projects.map((p) => (
                <div key={p.id} className="group flex items-center rounded-lg hover:bg-hover">
                  <button onClick={() => (close(), openProject(p.id).catch(fail))} className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1.5 text-left">
                    <span className="flex size-4 items-center justify-center">
                      {p.id === pid ? <Check size={13} className="text-violet-300" /> : p.running > 0 && <span className="size-1.5 rounded-full bg-ok" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{p.name}</span>
                      <span className="block truncate font-mono text-[10.5px] text-faint">{tildify(p.root)}</span>
                    </span>
                    {p.running > 0 && <span className="text-[10.5px] text-emerald-300/80">{p.running} running</span>}
                  </button>
                  <button
                    title="Remove from list"
                    onClick={() => removeProject(p.id)}
                    className="mr-1.5 rounded p-1 text-faint opacity-0 hover:text-red-300 group-hover:opacity-100"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <MenuSeparator />
            <MenuItem icon={FolderOpen} onClick={() => (close(), useStore.setState({ dialog: 'folder' }))}>
              Open folder…
            </MenuItem>
            {pid && (
              <>
                <MenuItem icon={Download} onClick={() => (close(), exportConfig())}>
                  Export configuration
                </MenuItem>
                <MenuItem icon={Upload} onClick={() => (close(), fileRef.current?.click())}>
                  Import configuration…
                </MenuItem>
              </>
            )}
          </>
        )}
      </Menu>
    </>
  )
}

export function connectedTo(id: string) {
  const services = useStore.getState().config?.services ?? []
  const seen = new Set([id])
  const queue = [id]
  while (queue.length) {
    const cur = queue.pop()!
    for (const s of services) {
      const linked = s.dependsOn?.includes(cur) ? s.id : services.find((x) => x.id === cur)?.dependsOn?.includes(s.id) ? s.id : null
      if (linked && !seen.has(linked)) {
        seen.add(linked)
        queue.push(linked)
      }
    }
  }
  return [...seen]
}

function RunControl() {
  const services = useStore((s) => s.services)
  const config = useStore((s) => s.config)
  const selected = useStore((s) => s.selected)
  const live = Object.values(services).filter(isLive).length
  const total = config?.services.length ?? 0
  const profiles = Object.entries(config?.profiles ?? {})
  if (!total) return null

  return (
    <div className="flex items-center">
      {live ? (
        <Button variant="danger" className="rounded-r-none" onClick={() => stopServices()}>
          <Square size={11} fill="currentColor" /> Stop all
          <span className="ml-0.5 rounded bg-hover px-1 text-[10.5px] tabular-nums">
            {live}/{total}
          </span>
        </Button>
      ) : (
        <Button variant="success" className="rounded-r-none" onClick={() => startServices()}>
          <Play size={12} fill="currentColor" /> Start all
        </Button>
      )}
      <Menu
        align="right"
        trigger={() => (
          <Button variant={live ? 'danger' : 'success'} className="rounded-l-none border-l border-black/20 px-1.5" aria-label="More start options">
            <ChevronDown size={14} />
          </Button>
        )}
      >
        {(close) => (
          <>
            <MenuItem icon={Play} onClick={() => (close(), startServices())} hint={`${total}`}>
              Start everything
            </MenuItem>
            {selected && (
              <MenuItem icon={Network} onClick={() => (close(), startServices(connectedTo(selected)))}>
                Start selected + connected
              </MenuItem>
            )}
            <MenuItem icon={ListChecks} onClick={() => (close(), useStore.setState({ dialog: 'choose' }))}>
              Choose services…
            </MenuItem>
            {profiles.length > 0 && (
              <>
                <MenuSeparator />
                <MenuLabel>Profiles</MenuLabel>
                {profiles.map(([name, ids]) => (
                  <MenuItem key={name} icon={Layers} hint={ids.length} onClick={() => (close(), startServices(ids))}>
                    {name}
                  </MenuItem>
                ))}
              </>
            )}
            {live > 0 && (
              <>
                <MenuSeparator />
                <MenuItem icon={Square} danger onClick={() => (close(), stopServices())}>
                  Stop all running
                </MenuItem>
              </>
            )}
          </>
        )}
      </Menu>
    </div>
  )
}

export function ChooseDialog() {
  const open = useStore((s) => s.dialog === 'choose')
  const config = useStore((s) => s.config)
  const [picked, setPicked] = useState(new Set<string>())
  const [name, setName] = useState('')
  const close = () => useStore.setState({ dialog: undefined })
  useEffect(() => {
    if (open) setPicked(new Set())
  }, [open])
  if (!config) return null
  const profiles = config.profiles ?? {}
  const toggle = (id: string) => setPicked((p) => new Set(p.has(id) ? [...p].filter((x) => x !== id) : [...p, id]))
  const deps = new Set([...picked].flatMap((id) => config.services.find((s) => s.id === id)?.dependsOn ?? []).filter((d) => !picked.has(d)))

  const saveProfile = () => {
    if (!name.trim()) return
    saveConfig({ ...config, profiles: { ...profiles, [name.trim()]: [...picked] } })
    toast.success(`Profile “${name.trim()}” saved`)
    setName('')
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Choose what to run"
      footer={
        <>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Profile name"
            onKeyDown={(e) => e.key === 'Enter' && saveProfile()}
            className="mr-auto h-8 w-40 rounded-lg border border-line bg-panel px-2.5 text-xs outline-none focus:border-accent/50"
          />
          <Button variant="ghost" disabled={!picked.size || !name.trim()} onClick={saveProfile}>
            Save profile
          </Button>
          <Button variant="success" disabled={!picked.size} onClick={() => (startServices([...picked]), close())}>
            <Play size={12} /> Start {picked.size || ''}
          </Button>
        </>
      }
    >
      <div className="max-h-[55vh] overflow-y-auto p-3">
        {Object.keys(profiles).length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5 px-1">
            {Object.entries(profiles).map(([n, ids]) => (
              <span key={n} className="group inline-flex h-7 items-center gap-1 rounded-full border border-line pl-2.5 pr-1 text-xs text-muted hover:bg-hover">
                <button onClick={() => setPicked(new Set(ids))} className="inline-flex items-center gap-1.5">
                  <Layers size={11} /> {n}
                </button>
                <button
                  title="Delete profile"
                  onClick={() => {
                    const { [n]: _, ...rest } = profiles
                    saveConfig({ ...config, profiles: rest })
                  }}
                  className="rounded-full p-1 text-faint opacity-0 hover:text-red-300 group-hover:opacity-100"
                >
                  <Trash2 size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        {config.services.map((s) => {
          const on = picked.has(s.id)
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={cx('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors', on ? 'bg-accent-soft' : 'hover:bg-hover')}
            >
              <ServiceIcon icon={s.icon} color={s.color} size="sm" />
              <span className="flex-1 text-[13px]">{s.name}</span>
              {deps.has(s.id) && <span className="text-[11px] text-faint">starts as dependency</span>}
              <span
                className={cx(
                  'inline-flex size-[18px] items-center justify-center rounded-md border',
                  on ? 'border-accent bg-accent text-white' : 'border-line-strong',
                )}
              >
                {on && <Check size={12} strokeWidth={3} />}
              </span>
            </button>
          )
        })}
      </div>
    </Dialog>
  )
}

function EnvSwitch() {
  const envProfiles = useStore((s) => s.config?.envProfiles) ?? []
  const active = useStore((s) => s.local.envProfile)
  if (!envProfiles.length) return null
  return (
    <Menu
      align="right"
      width="w-52"
      trigger={() => (
        <button
          className={cx(
            'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors',
            active ? 'border-accent/40 bg-accent-soft text-violet-200' : 'border-line bg-panel text-muted hover:text-fg',
          )}
        >
          <KeyRound size={12} />
          {active ?? 'default'}
          <ChevronDown size={12} className="text-faint" />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Environment</MenuLabel>
          {[undefined, ...envProfiles].map((p) => (
            <MenuItem
              key={p ?? ''}
              icon={active === p ? Check : undefined}
              hint={p ? `.env.${p}` : '.env'}
              onClick={() => (close(), saveLocal({ envProfile: p ?? '' }))}
            >
              {p ?? 'default'}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem icon={Settings} onClick={() => (close(), useStore.setState({ view: 'settings' }))}>
            Manage…
          </MenuItem>
        </>
      )}
    </Menu>
  )
}

const VIEWS: { value: View; label: string; icon: typeof Workflow }[] = [
  { value: 'canvas', label: 'Canvas', icon: Workflow },
  { value: 'overview', label: 'Overview', icon: LayoutDashboard },
  { value: 'problems', label: 'Problems', icon: AlertCircle },
  { value: 'git', label: 'Changes', icon: GitBranch },
  { value: 'ports', label: 'Ports', icon: Plug },
  { value: 'settings', label: 'Settings', icon: Settings },
]

export default function TopBar({ problemCount, changeCount }: { problemCount: number; changeCount: number }) {
  const view = useStore((s) => s.view)
  const connected = useStore((s) => s.connected)
  const counts: Partial<Record<View, number>> = { problems: problemCount, git: changeCount }
  return (
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel/80 px-3 backdrop-blur">
      <div className="flex items-center gap-1.5 pr-1">
        <img src="/favicon.svg" alt="" className="size-6" />
        <span className="text-faint">/</span>
      </div>
      <ProjectMenu />
      <nav className="ml-3 flex items-center gap-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            onClick={() => useStore.setState({ view: v.value })}
            className={cx(
              'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors',
              view === v.value ? 'bg-hover text-fg' : 'text-faint hover:text-muted',
            )}
          >
            <v.icon size={14} />
            <span className="hidden lg:inline">{v.label}</span>
            {!!counts[v.value] && (
              <span className={cx('rounded-full px-1.5 text-[10px] tabular-nums', v.value === 'problems' ? 'bg-bad/15 text-red-300' : 'bg-hover text-muted')}>
                {counts[v.value]}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {!connected && <span className="text-[11px] text-amber-300">Reconnecting…</span>}
        <EnvSwitch />
        <button
          onClick={() => useStore.setState({ dialog: 'palette' })}
          className="hidden h-8 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-xs text-faint hover:text-muted md:flex"
        >
          Search commands <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </button>
        <RunControl />
      </div>
    </header>
  )
}
