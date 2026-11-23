import { Check, FileSearch, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { addServices, fail, uniqueId, useStore } from '../lib/store'
import { TEMPLATES, type Template } from '../lib/templates'
import type { ServiceConfig, Suggestion, UserTemplate } from '../lib/types'
import ServiceForm, { cleanService } from './ServiceForm'
import { Button, cx, Dialog, Segmented, ServiceIcon } from './ui'

export function useSuggestions() {
  const pid = useStore((s) => s.pid)
  const existing = useStore((s) => s.config?.services) ?? []
  const [list, setList] = useState<Suggestion[] | null>(null)
  useEffect(() => {
    setList(null)
    api<Suggestion[]>('GET', `/api/p/${pid}/detect`).then(setList, fail)
  }, [pid])
  return list?.filter((s) => !existing.some((e) => e.command === s.command && e.cwd === s.cwd)) ?? null
}

const fromSuggestion = (s: Suggestion, taken: string[]): ServiceConfig => ({
  id: uniqueId(s.name, taken),
  name: s.name.replace(/(^|\s)\S/g, (c) => c.toUpperCase()),
  cwd: s.cwd,
  command: s.command,
  envFile: s.envFile,
  port: s.port,
  icon: s.icon,
})

export function DetectedList({ suggestions, picked, onToggle }: { suggestions: Suggestion[]; picked: Set<string>; onToggle: (id: string) => void }) {
  return (
    <div className="space-y-1">
      {suggestions.map((s) => {
        const on = picked.has(s.id)
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggle(s.id)}
            className={cx(
              'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
              on ? 'border-accent/40 bg-accent-soft' : 'border-line bg-panel/50 hover:bg-hover',
            )}
          >
            <ServiceIcon icon={s.icon} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[13px] font-medium">
                <span className="truncate capitalize">{s.name}</span>
                {s.port && <span className="font-mono text-[11px] font-normal text-faint">:{s.port}</span>}
              </div>
              <div className="truncate font-mono text-[11px] text-faint">
                {s.cwd !== '.' && <span className="text-muted">{s.cwd} · </span>}
                {s.command}
              </div>
            </div>
            <span
              className={cx(
                'inline-flex size-[18px] shrink-0 items-center justify-center rounded-md border transition-colors',
                on ? 'border-accent bg-accent text-white' : 'border-line-strong',
              )}
            >
              {on && <Check size={12} strokeWidth={3} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export async function addDetected(suggestions: Suggestion[], picked: Set<string>) {
  const taken = useStore.getState().config!.services.map((s) => s.id)
  const services: ServiceConfig[] = []
  for (const s of suggestions.filter((x) => picked.has(x.id))) {
    const svc = fromSuggestion(s, taken)
    taken.push(svc.id)
    services.push(svc)
  }
  await addServices(services)
}

const blank = (t?: Template | UserTemplate): ServiceConfig => {
  if (!t || t.key === 'custom') return { id: '', name: '', cwd: '.', command: t?.command ?? '', icon: t?.icon ?? 'terminal' }
  const { key: _k, hint: _h, ...rest } = t
  return { cwd: '.', icon: 'terminal', ...(rest as Partial<ServiceConfig>), id: '', name: t.name, command: t.command }
}

function TemplateCard({ t, onPick, mine }: { t: Template | UserTemplate; onPick: () => void; mine?: boolean }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex items-start gap-2.5 rounded-xl border border-line bg-panel/50 p-3 text-left transition-colors hover:border-line-strong hover:bg-hover"
    >
      <ServiceIcon icon={t.icon} size="sm" />
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{t.name}</div>
        <div className={cx('mt-0.5 text-[11px] leading-snug text-faint', mine && 'truncate font-mono')}>{t.hint ?? t.command}</div>
      </div>
    </button>
  )
}

type Mode = 'detected' | 'templates' | 'custom'

export default function AddServiceDialog() {
  const open = useStore((s) => s.dialog === 'add')
  const config = useStore((s) => s.config)
  const root = useStore((s) => s.root)
  const close = () => useStore.setState({ dialog: undefined })
  const suggestions = useSuggestions()
  const [mode, setMode] = useState<Mode>('detected')
  const [picked, setPicked] = useState(new Set<string>())
  const [draft, setDraft] = useState<ServiceConfig>(blank())
  const [mine, setMine] = useState<UserTemplate[]>([])

  useEffect(() => {
    if (!open) return
    api<UserTemplate[]>('GET', '/api/templates').then(setMine, () => {})
    setPicked(new Set())
    setDraft(blank())
    setMode(suggestions?.length ? 'detected' : 'templates')
  }, [open])

  const submit = async () => {
    if (mode === 'detected') await addDetected(suggestions ?? [], picked)
    else {
      const svc = cleanService(draft)
      if (!svc.command) return fail(new Error('Command is required'))
      await addServices([{ ...svc, id: uniqueId(svc.name || 'service') }])
    }
    close()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      width="max-w-2xl"
      title={
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'detected', label: `Detected${suggestions?.length ? ` · ${suggestions.length}` : ''}` },
            { value: 'templates', label: 'Templates' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
      }
      footer={
        mode !== 'templates' && (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={mode === 'detected' ? !picked.size : !draft.command.trim()}>
              {mode === 'detected' ? `Add ${picked.size || ''} service${picked.size === 1 ? '' : 's'}` : 'Add service'}
            </Button>
          </>
        )
      }
    >
      <div className="max-h-[60vh] overflow-y-auto p-5">
        {mode === 'detected' &&
          (suggestions === null ? (
            <div className="py-10 text-center text-xs text-faint">Scanning project…</div>
          ) : suggestions.length ? (
            <DetectedList
              suggestions={suggestions}
              picked={picked}
              onToggle={(id) => setPicked((p) => new Set(p.has(id) ? [...p].filter((x) => x !== id) : [...p, id]))}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-xs text-faint">
              <FileSearch size={20} />
              Nothing new found in package.json scripts, Procfile, docker compose, Makefile or framework files.
            </div>
          ))}
        {mode === 'templates' && (
          <div className="space-y-4">
            {mine.length > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-medium text-faint">Your templates</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {mine.map((t) => (
                    <TemplateCard key={t.key} t={t} mine onPick={() => (setDraft(blank(t)), setMode('custom'))} />
                  ))}
                </div>
              </div>
            )}
            <div>
              {mine.length > 0 && <div className="mb-2 text-[11px] font-medium text-faint">Built in</div>}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TEMPLATES.map((t) => (
                  <TemplateCard key={t.key} t={t} onPick={() => (setDraft(blank(t)), setMode('custom'))} />
                ))}
              </div>
            </div>
          </div>
        )}
        {mode === 'custom' && <ServiceForm value={draft} onChange={setDraft} others={config?.services ?? []} root={root} />}
      </div>
    </Dialog>
  )
}

export function OnboardingHint() {
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-faint">
      <Sparkles size={12} className="text-violet-400" />
      Saved to runcraft.json. Commit it and your team gets the same setup.
    </p>
  )
}
