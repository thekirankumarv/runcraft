import { FolderOpen, KeyRound } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Toaster } from 'sonner'
import AddServiceDialog from './components/AddService'
import Canvas from './components/Canvas'
import FolderDialog from './components/FolderDialog'
import Palette from './components/Palette'
import PortsView from './components/PortsView'
import ProblemsView, { collectProblems } from './components/ProblemsView'
import OverviewView from './components/OverviewView'
import ServicePanel from './components/ServicePanel'
import SettingsView from './components/SettingsView'
import TopBar, { ChooseDialog } from './components/TopBar'
import { Button, Empty } from './components/ui'
import { api, ApiError, connectSocket } from './lib/api'
import { fail, handleMessages, loadProjects, openProject, setHome, useStore } from './lib/store'
import { useTheme } from './lib/theme'

const GitView = lazy(() => import('./components/GitView'))

let booted = false

async function boot() {
  try {
    const meta = await api('GET', '/api/meta')
    setHome(meta.home)
    await loadProjects()
    const { projects } = useStore.getState()
    let saved: string | null = null
    try {
      saved = localStorage.getItem('runcraft.project')
    } catch {}
    const requested = new URLSearchParams(location.search).get('project')
    const pick = projects.find((p) => p.id === requested)?.id ?? meta.startProject ?? projects.find((p) => p.id === saved)?.id ?? projects[0]?.id
    if (pick) await openProject(pick)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return useStore.setState({ authError: true, ready: true })
    fail(e)
  }
  useStore.setState({ ready: true })
}

function useChangeCount(pid?: string) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!pid) return
    const load = () =>
      api('GET', `/api/p/${pid}/git`).then(
        (s) => setCount(s.files.length),
        () => {},
      )
    load()
    const t = setInterval(load, 10_000)
    return () => clearInterval(t)
  }, [pid])
  return count
}

export default function App() {
  const ready = useStore((s) => s.ready)
  const authError = useStore((s) => s.authError)
  const pid = useStore((s) => s.pid)
  const view = useStore((s) => s.view)
  const selected = useStore((s) => s.selected)
  const logs = useStore((s) => s.logs)
  const problems = useMemo(() => collectProblems(logs), [logs])
  const changes = useChangeCount(pid)
  const theme = useTheme((s) => s.theme)

  useEffect(() => {
    if (booted) return
    booted = true
    boot().then(() => {
      if (useStore.getState().authError) return
      let first = true
      connectSocket(handleMessages, (connected) => {
        useStore.setState({ connected })
        const { pid } = useStore.getState()
        if (connected && !first && pid) openProject(pid).catch(() => {})
        first = false
      })
    })
  }, [])

  if (!ready) return <div className="h-full bg-bg" />

  if (authError)
    return (
      <Empty icon={KeyRound} title="Open Runcraft from your terminal">
        This page needs the link printed when you started <code className="font-mono text-muted">runcraft</code>. It includes a private token so other websites
        can't control your machine.
      </Empty>
    )

  return (
    <div className="flex h-full flex-col">
      <TopBar problemCount={problems.length} changeCount={changes} />
      <main className="flex min-h-0 flex-1">
        <section className="relative min-w-0 flex-1">
          {!pid ? (
            <Empty icon={FolderOpen} title="Open a project">
              <p>Pick the folder that holds your code. Runcraft scans it for dev scripts and remembers it for next time.</p>
              <Button variant="primary" className="mt-4" onClick={() => useStore.setState({ dialog: 'folder' })}>
                <FolderOpen size={14} /> Open folder
              </Button>
            </Empty>
          ) : view === 'canvas' ? (
            <Canvas />
          ) : view === 'overview' ? (
            <OverviewView problemCount={problems.length} />
          ) : view === 'settings' ? (
            <SettingsView />
          ) : view === 'problems' ? (
            <ProblemsView problems={problems} />
          ) : view === 'git' ? (
            <Suspense fallback={null}>
              <GitView />
            </Suspense>
          ) : (
            <PortsView />
          )}
        </section>
        {pid && view === 'canvas' && selected && <ServicePanel key={selected} id={selected} />}
      </main>
      <AddServiceDialog />
      <ChooseDialog />
      <FolderDialog />
      <Palette />
      <Toaster
        theme={theme}
        position="bottom-right"
        toastOptions={{ style: { background: 'var(--color-raised)', border: '1px solid var(--color-line-strong)', color: 'var(--color-fg)' } }}
      />
    </div>
  )
}
