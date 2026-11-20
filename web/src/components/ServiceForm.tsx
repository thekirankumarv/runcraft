import type { ServiceConfig } from '../lib/types'
import { tildify } from '../lib/store'
import { COLORS, colorFor, cx, Field, ICONS, Input, inputClass, Segmented, Toggle } from './ui'

type HealthMode = 'auto' | 'tcp' | 'http' | 'none'

export function cleanService(s: ServiceConfig): ServiceConfig {
  const watch = s.watch?.filter(Boolean)
  return { ...s, name: s.name.trim() || s.id, command: s.command.trim(), cwd: s.cwd.trim() || '.', watch: watch?.length ? watch : undefined }
}

export default function ServiceForm({
  value,
  onChange,
  others,
  root,
}: {
  value: ServiceConfig
  onChange: (v: ServiceConfig) => void
  others: ServiceConfig[]
  root?: string
}) {
  const set = (patch: Partial<ServiceConfig>) => onChange({ ...value, ...patch })
  const mode: HealthMode = value.health?.type ?? 'auto'
  const setMode = (m: HealthMode) =>
    set({
      health:
        m === 'auto'
          ? undefined
          : m === 'http'
            ? { type: 'http', url: value.port ? `http://localhost:${value.port}/` : 'http://localhost:3000/' }
            : m === 'tcp'
              ? { type: 'tcp' }
              : { type: 'none' },
    })

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <Field label="Name">
          <Input value={value.name} onChange={(e) => set({ name: e.target.value })} placeholder="API" autoFocus />
        </Field>
        <div className="flex gap-1 pb-1">
          {Object.keys(COLORS).map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => set({ color: c })}
              className={cx(
                'size-5 rounded-full bg-gradient-to-b ring-1 ring-inset transition-transform hover:scale-110',
                COLORS[c],
                colorFor(value.icon, value.color) === c && 'outline-2 outline-offset-2 outline-white/40',
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {Object.entries(ICONS).map(([key, Icon]) => (
          <button
            key={key}
            type="button"
            title={key}
            onClick={() => set({ icon: key })}
            className={cx(
              'inline-flex size-8 items-center justify-center rounded-lg border transition-colors',
              (value.icon ?? 'terminal') === key ? 'border-accent/60 bg-accent-soft text-violet-300' : 'border-line text-faint hover:text-fg hover:bg-hover',
            )}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>

      <Field label="Command" hint="Runs in a shell, so && chains and env prefixes work.">
        <Input className="font-mono text-[12px]" value={value.command} onChange={(e) => set({ command: e.target.value })} placeholder="pnpm dev:api" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Working directory" hint={root ? `Relative to ${tildify(root)}` : undefined}>
          <Input className="font-mono text-[12px]" value={value.cwd} onChange={(e) => set({ cwd: e.target.value })} placeholder="." />
        </Field>
        <Field label="Port" hint="Used for health checks and conflict detection.">
          <Input
            type="number"
            value={value.port ?? ''}
            onChange={(e) => set({ port: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="auto-detect"
          />
        </Field>
      </div>

      <Field label="Run before start" hint="Optional. e.g. prisma generate, a migration, a build step.">
        <Input
          className="font-mono text-[12px]"
          value={value.pre ?? ''}
          onChange={(e) => set({ pre: e.target.value || undefined })}
          placeholder="pnpm prisma generate"
        />
      </Field>

      <Field label="Env file" hint="Relative to the working directory. Edits in the Variables tab are written here.">
        <Input
          className="font-mono text-[12px]"
          value={value.envFile ?? ''}
          onChange={(e) => set({ envFile: e.target.value || undefined })}
          placeholder=".env"
        />
      </Field>

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted">Health check</span>
        <div className="flex items-center gap-2">
          <Segmented<HealthMode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'tcp', label: 'TCP port' },
              { value: 'http', label: 'HTTP' },
              { value: 'none', label: 'None' },
            ]}
          />
          {value.health?.type === 'http' && (
            <input
              className={cx(inputClass, 'flex-1 font-mono text-[12px]')}
              value={value.health.url}
              onChange={(e) => set({ health: { type: 'http', url: e.target.value } })}
            />
          )}
        </div>
        <p className="text-[11px] text-faint">Auto checks the port once one is known, otherwise treats the process as up once it stays alive.</p>
      </div>

      {others.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted">Depends on</span>
          <div className="flex flex-wrap gap-1.5">
            {others.map((o) => {
              const on = value.dependsOn?.includes(o.id)
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => set({ dependsOn: on ? value.dependsOn!.filter((d) => d !== o.id) : [...(value.dependsOn ?? []), o.id] })}
                  className={cx(
                    'h-7 rounded-full border px-2.5 text-xs transition-colors',
                    on ? 'border-accent/50 bg-accent-soft text-violet-200' : 'border-line text-muted hover:bg-hover',
                  )}
                >
                  {o.name}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-faint">
            Dependencies start first and must be healthy before this one starts. You can also draw connections on the canvas.
          </p>
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-line bg-panel/60 p-3">
        <Toggle checked={!!value.autoRestart} onChange={(v) => set({ autoRestart: v || undefined })} label="Restart automatically when it crashes" />
        <Field label="Restart when files change" hint="Comma-separated paths, for processes without their own hot reload.">
          <Input
            className="font-mono text-[12px]"
            value={value.watch?.join(', ') ?? ''}
            onChange={(e) => {
              const watch = e.target.value.split(',').map((s) => s.trim())
              set({ watch: watch.some(Boolean) ? watch : undefined })
            }}
            placeholder="src, config"
          />
        </Field>
      </div>
    </div>
  )
}
