import { Download, FileCode2, Lock, LockOpen, Plus, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { editorUrl, fail, saveConfig, saveLocal, tildify, useStore } from '../lib/store'
import { setTheme, useTheme, type ThemePref } from '../lib/theme'
import type { UserTemplate } from '../lib/types'
import { Button, cx, Input, inputClass, Segmented, ServiceIcon } from './ui'

const EDITORS = [
  { value: 'vscode', label: 'VS Code' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'windsurf', label: 'Windsurf' },
  { value: 'vscode-insiders', label: 'VS Code Insiders' },
  { value: 'zed', label: 'Zed' },
]

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-line py-7 last:border-0 md:grid-cols-[240px_1fr]">
      <div>
        <h3 className="text-[13.5px] font-semibold">{title}</h3>
        {description && <p className="mt-1 text-xs leading-relaxed text-faint">{description}</p>}
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  )
}

function exportConfig() {
  const config = useStore.getState().config
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'runcraft.json'
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function SettingsView() {
  const config = useStore((s) => s.config)
  const local = useStore((s) => s.local)
  const root = useStore((s) => s.root)
  const ignored = useStore((s) => s.gitignoresLocal)
  const services = useStore((s) => s.services)
  const pref = useTheme((s) => s.pref)
  const [name, setName] = useState(config?.name ?? '')
  const [newEnv, setNewEnv] = useState('')
  const [newProfile, setNewProfile] = useState('')
  const [templates, setTemplates] = useState<UserTemplate[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => setName(config?.name ?? ''), [config?.name])
  useEffect(() => {
    api<UserTemplate[]>('GET', '/api/templates').then(setTemplates, fail)
  }, [])
  if (!config) return null

  const profiles = config.profiles ?? {}
  const envProfiles = config.envProfiles ?? []
  const lockedEnvs = config.lockedEnvs ?? []
  const overridden = Object.values(services).filter((s) => s.overrides?.length)

  const addEnvProfile = () => {
    const n = newEnv
      .trim()
      .replace(/^\.?env\.?/, '')
      .replace(/[^\w-]/g, '')
    if (!n || envProfiles.includes(n)) return
    saveConfig({ ...config, envProfiles: [...envProfiles, n] })
    setNewEnv('')
  }

  const toggleMember = (profile: string, id: string) => {
    const ids = profiles[profile]
    saveConfig({ ...config, profiles: { ...profiles, [profile]: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] } })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 pb-16 pt-4">
        <Section title="Project" description={<span className="break-all font-mono">{tildify(root)}</span>}>
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
            <Button disabled={!name.trim() || name === config.name} onClick={() => saveConfig({ ...config, name: name.trim() })}>
              Rename
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={editorUrl(`${root}/runcraft.json`)}>
              <Button variant="ghost">
                <FileCode2 size={14} /> Open runcraft.json
              </Button>
            </a>
            <Button variant="ghost" onClick={exportConfig}>
              <Download size={14} /> Export
            </Button>
            <Button variant="ghost" onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> Import
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                try {
                  await saveConfig(JSON.parse(await file.text()))
                  toast.success('Configuration imported')
                } catch (err) {
                  fail(err)
                }
              }}
            />
          </div>
        </Section>

        <Section title="Appearance" description="Saved in this browser.">
          <Segmented<ThemePref>
            value={pref}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
        </Section>

        <Section title="Editor" description="Where file links in logs and diffs open. Saved to your personal runcraft.local.json.">
          <select
            value={local.editor ?? config.editor ?? 'vscode'}
            onChange={(e) => saveLocal({ editor: e.target.value })}
            className={cx(inputClass, 'max-w-60')}
          >
            {EDITORS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </Section>

        <Section
          title="Environment profiles"
          description={
            <>
              With a profile active, each service reads its env file and then <span className="font-mono">.env.&lt;profile&gt;</span> on top. Edits in Variables
              go to the profile file. Switch from the top bar. Lock a profile such as prod to make its values read-only.
            </>
          }
        >
          <div className="flex flex-wrap gap-1.5">
            <span
              className={cx(
                'inline-flex h-7 items-center rounded-full border px-3 text-xs',
                !local.envProfile ? 'border-accent/50 bg-accent-soft text-violet-200' : 'border-line text-muted',
              )}
            >
              default
            </span>
            {envProfiles.map((p) => (
              <span
                key={p}
                className={cx(
                  'group inline-flex h-7 items-center gap-1 rounded-full border pl-3 pr-1 text-xs',
                  local.envProfile === p ? 'border-accent/50 bg-accent-soft text-violet-200' : 'border-line text-muted',
                )}
              >
                {p}
                <button
                  title={lockedEnvs.includes(p) ? 'Unlock: allow editing' : 'Lock: make values read-only'}
                  onClick={() => saveConfig({ ...config, lockedEnvs: lockedEnvs.includes(p) ? lockedEnvs.filter((x) => x !== p) : [...lockedEnvs, p] })}
                  className={cx('rounded-full p-1', lockedEnvs.includes(p) ? 'text-red-300' : 'text-faint hover:text-fg')}
                >
                  {lockedEnvs.includes(p) ? <Lock size={10} /> : <LockOpen size={10} />}
                </button>
                <button
                  title="Remove profile"
                  onClick={() => {
                    if (local.envProfile === p) saveLocal({ envProfile: '' })
                    saveConfig({ ...config, envProfiles: envProfiles.filter((x) => x !== p), lockedEnvs: lockedEnvs.filter((x) => x !== p) })
                  }}
                  className="rounded-full p-1 text-faint hover:text-red-300"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex max-w-sm gap-2">
            <Input value={newEnv} onChange={(e) => setNewEnv(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addEnvProfile()} placeholder="staging" />
            <Button onClick={addEnvProfile} disabled={!newEnv.trim()}>
              <Plus size={14} /> Add
            </Button>
          </div>
        </Section>

        <Section title="Start profiles" description="Named groups of services to start together. Dependencies are always included.">
          {Object.entries(profiles).map(([p, ids]) => (
            <div key={p} className="rounded-xl border border-line bg-raised p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-medium">{p}</span>
                <button
                  title="Delete profile"
                  onClick={() => {
                    const { [p]: _, ...rest } = profiles
                    saveConfig({ ...config, profiles: rest })
                  }}
                  className="rounded p-1 text-faint hover:text-red-300"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {config.services.map((s) => {
                  const on = ids.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleMember(p, s.id)}
                      className={cx(
                        'inline-flex h-7 items-center gap-1.5 rounded-full border pl-1 pr-2.5 text-xs transition-colors',
                        on ? 'border-accent/50 bg-accent-soft text-violet-200' : 'border-line text-faint hover:bg-hover',
                      )}
                    >
                      <ServiceIcon icon={s.icon} color={s.color} size="sm" />
                      {s.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="flex max-w-sm gap-2">
            <Input value={newProfile} onChange={(e) => setNewProfile(e.target.value)} placeholder="Frontend only" />
            <Button
              disabled={!newProfile.trim() || newProfile.trim() in profiles}
              onClick={() => {
                saveConfig({ ...config, profiles: { ...profiles, [newProfile.trim()]: [] } })
                setNewProfile('')
              }}
            >
              <Plus size={14} /> Add
            </Button>
          </div>
        </Section>

        <Section
          title="Personal overrides"
          description={
            <>
              <span className="font-mono">runcraft.local.json</span> holds settings for this machine only: active env profile, editor, and per-service overrides
              like a different port or command.
            </>
          }
        >
          <pre className="overflow-x-auto rounded-xl border border-line bg-term p-3 font-mono text-[11.5px] leading-relaxed text-term-fg">{`{
  "services": {
    "api": { "port": 4001, "command": "pnpm dev:api --inspect" }
  }
}`}</pre>
          {overridden.length > 0 && (
            <p className="text-xs text-muted">
              Overridden here: {overridden.map((s) => `${config.services.find((c) => c.id === s.id)?.name} (${s.overrides!.join(', ')})`).join('; ')}
            </p>
          )}
          {ignored ? (
            <p className="text-xs text-emerald-300">runcraft.local.json is in .gitignore.</p>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-xs text-amber-300">Not in .gitignore yet. It may end up in commits.</p>
              <Button size="sm" onClick={() => saveLocal({ ignore: true })}>
                Add to .gitignore
              </Button>
            </div>
          )}
        </Section>

        <Section title="Your templates" description="Saved from a service's Settings tab. Available in every project when adding a service.">
          {templates.length ? (
            templates.map((t) => (
              <div key={t.key} className="flex items-center gap-3 rounded-xl border border-line bg-raised px-3 py-2">
                <ServiceIcon icon={t.icon} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{t.name}</div>
                  <div className="truncate font-mono text-[11px] text-faint">{t.command}</div>
                </div>
                <button
                  title="Delete template"
                  onClick={() => api('DELETE', `/api/templates/${t.key}`).then(() => setTemplates((l) => l.filter((x) => x.key !== t.key)), fail)}
                  className="rounded p-1 text-faint hover:text-red-300"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          ) : (
            <p className="text-xs text-faint">None yet.</p>
          )}
        </Section>
      </div>
    </div>
  )
}
