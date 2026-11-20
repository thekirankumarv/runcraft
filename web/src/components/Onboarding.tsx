import { LayoutTemplate, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { tildify, useStore } from '../lib/store'
import { addDetected, DetectedList, OnboardingHint, useSuggestions } from './AddService'
import { Button } from './ui'

export default function Onboarding() {
  const config = useStore((s) => s.config)
  const root = useStore((s) => s.root)
  const suggestions = useSuggestions()
  const [picked, setPicked] = useState(new Set<string>())

  useEffect(() => {
    if (suggestions) setPicked(new Set(suggestions.filter((s) => s.cwd !== '.' || suggestions.length < 4).map((s) => s.id)))
  }, [suggestions?.length])

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_top,#8b5cf614,transparent_60%)] p-6 pt-[8vh]">
      <div className="w-full max-w-xl animate-pop">
        <div className="mb-6 text-center">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Set up {config?.name}</h1>
          <p className="mt-1.5 font-mono text-xs text-faint">{tildify(root)}</p>
        </div>
        <div className="rounded-2xl border border-line-strong bg-raised/80 p-4 shadow-2xl shadow-black/40">
          {suggestions === null ? (
            <div className="py-10 text-center text-xs text-faint">Scanning for dev servers…</div>
          ) : suggestions.length ? (
            <>
              <div className="mb-3 px-1 text-xs text-muted">Found {suggestions.length} things you can run. Pick the ones you want on your canvas.</div>
              <div className="max-h-[46vh] overflow-y-auto pr-1">
                <DetectedList
                  suggestions={suggestions}
                  picked={picked}
                  onToggle={(id) => setPicked((p) => new Set(p.has(id) ? [...p].filter((x) => x !== id) : [...p, id]))}
                />
              </div>
              <Button variant="primary" className="mt-4 w-full" disabled={!picked.size} onClick={() => addDetected(suggestions, picked)}>
                Add {picked.size} service{picked.size === 1 ? '' : 's'}
              </Button>
            </>
          ) : (
            <div className="py-8 text-center text-xs text-faint">No scripts detected here. Add a service by hand or start from a template.</div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button onClick={() => useStore.setState({ dialog: 'add' })}>
              <LayoutTemplate size={14} /> Templates
            </Button>
            <Button onClick={() => useStore.setState({ dialog: 'add' })}>
              <Plus size={14} /> Custom command
            </Button>
          </div>
        </div>
        <div className="mt-4 flex justify-center">
          <OnboardingHint />
        </div>
      </div>
    </div>
  )
}
