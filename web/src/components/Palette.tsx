import { Command } from 'cmdk'
import {
  AlertCircle,
  FolderOpen,
  GitBranch,
  LayoutDashboard,
  LayoutGrid,
  Layers,
  Moon,
  Play,
  Plug,
  Plus,
  RotateCw,
  ScrollText,
  Settings,
  Square,
  SquareTerminal,
  Sun,
  Workflow,
} from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { isLive, openProject, openTerminal, saveLocal, select, serviceAction, startServices, stopServices, useStore, type View } from '../lib/store'
import { setTheme, useTheme } from '../lib/theme'
import { arrange } from './Canvas'
import { ServiceIcon } from './ui'

function Item({ onSelect, children, icon, keywords }: { onSelect: () => void; children: ReactNode; icon?: ReactNode; keywords?: string[] }) {
  return (
    <Command.Item
      keywords={keywords}
      onSelect={() => {
        useStore.setState({ dialog: undefined })
        onSelect()
      }}
      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-fg"
    >
      <span className="flex w-5 justify-center text-muted">{icon}</span>
      {children}
    </Command.Item>
  )
}

export default function Palette() {
  const open = useStore((s) => s.dialog === 'palette')
  const config = useStore((s) => s.config)
  const envProfile = useStore((s) => s.local.envProfile)
  const services = useStore((s) => s.services)
  const projects = useStore((s) => s.projects)
  const pid = useStore((s) => s.pid)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        useStore.setState((s) => ({ dialog: s.dialog === 'palette' ? undefined : 'palette' }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!open) return null
  const go = (view: View) => useStore.setState({ view })
  const theme = useTheme.getState().theme

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[14vh] backdrop-blur-[2px] animate-fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && useStore.setState({ dialog: undefined })}
    >
      <Command
        loop
        onKeyDown={(e) => e.key === 'Escape' && useStore.setState({ dialog: undefined })}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line-strong bg-raised shadow-2xl shadow-black/60 animate-pop"
      >
        <Command.Input
          autoFocus
          placeholder="Type a command or service name…"
          className="h-12 w-full border-b border-line bg-transparent px-4 text-[14px] outline-none placeholder:text-faint"
        />
        <Command.List className="max-h-[50vh] overflow-y-auto p-1.5">
          <Command.Empty className="py-8 text-center text-xs text-faint">Nothing found.</Command.Empty>
          <Command.Group heading="Run">
            <Item icon={<Play size={14} />} onSelect={() => startServices()}>
              Start all services
            </Item>
            <Item icon={<Square size={13} />} onSelect={() => stopServices()}>
              Stop all services
            </Item>
            {Object.entries(config?.profiles ?? {}).map(([name, ids]) => (
              <Item key={name} icon={<Layers size={14} />} keywords={['profile']} onSelect={() => startServices(ids)}>
                Start profile: {name}
              </Item>
            ))}
          </Command.Group>
          {config?.services.length ? (
            <Command.Group heading="Services">
              {config.services.map((s) => {
                const live = isLive(services[s.id])
                return [
                  <Item
                    key={`${s.id}-t`}
                    icon={<ServiceIcon icon={s.icon} color={s.color} size="sm" />}
                    keywords={[s.id]}
                    onSelect={() => serviceAction(s.id, live ? 'stop' : 'start')}
                  >
                    {live ? 'Stop' : 'Start'} {s.name}
                  </Item>,
                  live && (
                    <Item key={`${s.id}-r`} icon={<RotateCw size={13} />} keywords={[s.id]} onSelect={() => serviceAction(s.id, 'restart')}>
                      Restart {s.name}
                    </Item>
                  ),
                  <Item
                    key={`${s.id}-term`}
                    icon={<SquareTerminal size={14} />}
                    keywords={[s.id, 'shell']}
                    onSelect={() => openTerminal({ title: s.name, cwd: s.cwd })}
                  >
                    Open terminal: {s.name}
                  </Item>,
                  <Item key={`${s.id}-l`} icon={<ScrollText size={14} />} keywords={[s.id, 'logs']} onSelect={() => select(s.id, 'logs')}>
                    Open logs: {s.name}
                  </Item>,
                ]
              })}
            </Command.Group>
          ) : null}
          <Command.Group heading="Go to">
            <Item icon={<Workflow size={14} />} onSelect={() => go('canvas')}>
              Canvas
            </Item>
            <Item icon={<LayoutDashboard size={14} />} onSelect={() => go('overview')}>
              Overview
            </Item>
            <Item icon={<SquareTerminal size={14} />} onSelect={() => go('terminal')}>
              Terminal
            </Item>
            <Item icon={<ScrollText size={14} />} keywords={['all logs', 'stream']} onSelect={() => go('logs')}>
              Logs
            </Item>
            <Item icon={<AlertCircle size={14} />} onSelect={() => go('problems')}>
              Problems
            </Item>
            <Item icon={<GitBranch size={14} />} onSelect={() => go('git')}>
              Changes
            </Item>
            <Item icon={<Plug size={14} />} onSelect={() => go('ports')}>
              Ports
            </Item>
            <Item icon={<Settings size={14} />} onSelect={() => go('settings')}>
              Settings
            </Item>
          </Command.Group>
          <Command.Group heading="Actions">
            <Item icon={<Plus size={14} />} onSelect={() => useStore.setState({ dialog: 'add', view: 'canvas' })}>
              Add service
            </Item>
            <Item icon={<SquareTerminal size={14} />} keywords={['shell', 'console']} onSelect={() => openTerminal()}>
              New terminal
            </Item>
            <Item icon={<LayoutGrid size={14} />} onSelect={arrange}>
              Auto-arrange canvas
            </Item>
            <Item icon={<FolderOpen size={14} />} onSelect={() => setTimeout(() => useStore.setState({ dialog: 'folder' }))}>
              Open folder…
            </Item>
            <Item
              icon={theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              keywords={['theme']}
              onSelect={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              Switch to {theme === 'dark' ? 'light' : 'dark'} theme
            </Item>
          </Command.Group>
          {(config?.envProfiles ?? []).length > 0 && (
            <Command.Group heading="Environment">
              {[undefined, ...config!.envProfiles!]
                .filter((p) => (p ?? '') !== (envProfile ?? ''))
                .map((p) => (
                  <Item
                    key={`env-${p}`}
                    icon={<Layers size={14} />}
                    keywords={['env', 'environment', 'profile']}
                    onSelect={() => saveLocal({ envProfile: p ?? '' })}
                  >
                    Switch to {p ?? 'default'} environment
                  </Item>
                ))}
            </Command.Group>
          )}
          {projects.length > 1 && (
            <Command.Group heading="Switch project">
              {projects
                .filter((p) => p.id !== pid)
                .map((p) => (
                  <Item key={p.id} icon={<FolderOpen size={14} />} keywords={[p.root]} onSelect={() => openProject(p.id)}>
                    {p.name}
                  </Item>
                ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  )
}
