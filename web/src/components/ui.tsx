import { Box, Calendar, Clock, Cloud, Cog, Cpu, Database, Globe, Mail, Radio, Server, Shield, Terminal, X, Zap, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Status } from '../lib/types'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variant = 'primary' | 'default' | 'ghost' | 'danger' | 'success'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-violet-500 shadow-[0_0_0_1px_#a78bfa33_inset,0_6px_20px_-6px_#8b5cf680]',
  success: 'bg-emerald-500/90 text-white hover:bg-emerald-500 shadow-[0_6px_20px_-8px_#22c55e90]',
  default: 'bg-raised text-fg border border-line hover:bg-hover hover:border-line-strong',
  ghost: 'text-muted hover:text-fg hover:bg-hover',
  danger: 'bg-bad/10 text-red-300 border border-bad/25 hover:bg-bad/20',
}

export function Button({
  variant = 'default',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none select-none',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
        VARIANTS[variant],
        className,
      )}
    />
  )
}

export function IconButton({
  icon: Icon,
  label,
  className,
  active,
  size = 15,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; active?: boolean; size?: number }) {
  return (
    <button
      {...props}
      title={label}
      aria-label={label}
      className={cx(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-30 disabled:pointer-events-none',
        active ? 'bg-accent-soft text-violet-300' : 'text-muted hover:text-fg hover:bg-hover',
        className,
      )}
    >
      <Icon size={size} strokeWidth={1.8} />
    </button>
  )
}

export const inputClass =
  'h-8 w-full rounded-lg border border-line bg-panel px-2.5 text-[13px] text-fg placeholder:text-faint outline-none transition-colors focus:border-accent/60 focus:ring-2 focus:ring-accent/15'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, className)} />
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block space-y-1.5', className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="block text-[11px] leading-snug text-faint">{hint}</span>}
    </label>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-xs text-muted hover:text-fg"
    >
      <span className={cx('relative h-[18px] w-8 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line-strong')}>
        <span
          className={cx(
            'absolute top-[2px] size-[14px] rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[16px]' : 'translate-x-[2px]',
          )}
        />
      </span>
      {label}
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-panel p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx('h-6 rounded-md px-2 text-xs transition-colors', value === o.value ? 'bg-hover text-fg shadow-sm' : 'text-faint hover:text-muted')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-panel px-1 font-sans text-[10px] text-faint">
    {children}
  </kbd>
)

export function Dialog({
  open,
  onClose,
  title,
  children,
  width = 'max-w-lg',
  footer,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  width?: string
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[10vh] backdrop-blur-[2px] animate-fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal
        className={cx('w-full overflow-hidden rounded-2xl border border-line-strong bg-raised shadow-2xl shadow-black/60 animate-pop', width)}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-[14px] font-semibold">{title}</h2>
            <IconButton icon={X} label="Close" onClick={onClose} />
          </div>
        )}
        {children}
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-panel/60 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Menu({
  trigger,
  children,
  align = 'left',
  width = 'w-64',
}: {
  trigger: (open: boolean) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(!open)}>{trigger(open)}</div>
      {open && (
        <div
          className={cx(
            'absolute top-full z-40 mt-1.5 overflow-hidden rounded-xl border border-line-strong bg-raised p-1 shadow-2xl shadow-black/50 animate-pop',
            align === 'right' ? 'right-0' : 'left-0',
            width,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem({
  icon: Icon,
  children,
  onClick,
  hint,
  danger,
  disabled,
}: {
  icon?: LucideIcon
  children: ReactNode
  onClick?: () => void
  hint?: ReactNode
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors disabled:opacity-40',
        danger ? 'text-red-300 hover:bg-bad/10' : 'text-fg hover:bg-hover',
      )}
    >
      {Icon && <Icon size={14} className={danger ? '' : 'text-muted'} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </button>
  )
}

export const MenuLabel = ({ children }: { children: ReactNode }) => <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-faint">{children}</div>
export const MenuSeparator = () => <div className="my-1 h-px bg-line" />

export const STATUS: Record<Status, { label: string; color: string; text: string; glow?: string }> = {
  running: { label: 'Online', color: 'bg-ok text-ok', text: 'text-emerald-300', glow: '#22c55e' },
  unhealthy: { label: 'Unhealthy', color: 'bg-warn text-warn', text: 'text-amber-300', glow: '#f5a524' },
  starting: { label: 'Starting', color: 'bg-warn text-warn', text: 'text-amber-300', glow: '#f5a524' },
  stopping: { label: 'Stopping', color: 'bg-warn text-warn', text: 'text-amber-300' },
  crashed: { label: 'Crashed', color: 'bg-bad text-bad', text: 'text-red-300', glow: '#f04444' },
  stopped: { label: 'Stopped', color: 'bg-zinc-600 text-zinc-600', text: 'text-faint' },
  idle: { label: 'Idle', color: 'bg-zinc-700 text-zinc-700', text: 'text-faint' },
}

export function StatusDot({ status, className }: { status: Status; className?: string }) {
  const anim = status === 'running' ? 'animate-pulse-dot' : status === 'starting' || status === 'stopping' ? 'animate-pulse-fast' : ''
  return <span className={cx('inline-block size-2 shrink-0 rounded-full', STATUS[status].color, anim, className)} />
}

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-2 py-0.5 text-[11px] font-medium', STATUS[status].text)}>
      <StatusDot status={status} className="size-1.5" />
      {STATUS[status].label}
    </span>
  )
}

export const ICONS: Record<string, LucideIcon> = {
  terminal: Terminal,
  globe: Globe,
  server: Server,
  database: Database,
  radio: Radio,
  clock: Clock,
  cog: Cog,
  box: Box,
  zap: Zap,
  cloud: Cloud,
  mail: Mail,
  calendar: Calendar,
  shield: Shield,
  cpu: Cpu,
}

export const COLORS: Record<string, string> = {
  violet: 'from-violet-500/25 to-violet-500/5 text-violet-300 ring-violet-400/25',
  blue: 'from-blue-500/25 to-blue-500/5 text-blue-300 ring-blue-400/25',
  cyan: 'from-cyan-500/25 to-cyan-500/5 text-cyan-300 ring-cyan-400/25',
  emerald: 'from-emerald-500/25 to-emerald-500/5 text-emerald-300 ring-emerald-400/25',
  amber: 'from-amber-500/25 to-amber-500/5 text-amber-300 ring-amber-400/25',
  rose: 'from-rose-500/25 to-rose-500/5 text-rose-300 ring-rose-400/25',
  pink: 'from-pink-500/25 to-pink-500/5 text-pink-300 ring-pink-400/25',
  zinc: 'from-zinc-400/20 to-zinc-400/5 text-term-fg ring-zinc-400/20',
}

const ICON_COLOR: Record<string, string> = {
  globe: 'blue',
  server: 'violet',
  database: 'emerald',
  radio: 'pink',
  clock: 'amber',
  cog: 'cyan',
  box: 'blue',
  zap: 'amber',
  cloud: 'cyan',
  mail: 'rose',
}
export const colorFor = (icon?: string, color?: string) => color ?? ICON_COLOR[icon ?? ''] ?? 'zinc'

export function ServiceIcon({ icon, color, size = 'md' }: { icon?: string; color?: string; size?: 'sm' | 'md' | 'lg' }) {
  const Icon = ICONS[icon ?? 'terminal'] ?? Terminal
  const box = size === 'sm' ? 'size-6 rounded-md' : size === 'lg' ? 'size-10 rounded-xl' : 'size-8 rounded-lg'
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center bg-gradient-to-b ring-1 ring-inset', box, COLORS[colorFor(icon, color)])}>
      <Icon size={size === 'sm' ? 13 : size === 'lg' ? 19 : 16} strokeWidth={1.8} />
    </span>
  )
}

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null
  const max = Math.max(10, ...values)
  const w = 48
  const h = 14
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`).join(' ')
  return (
    <svg width={w} height={h} className={className} aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  )
}

export const formatBytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`)

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <span className="mb-1 inline-flex size-10 items-center justify-center rounded-xl border border-line bg-raised text-faint">
        <Icon size={18} />
      </span>
      <div className="text-[13px] font-medium">{title}</div>
      {children && <div className="max-w-sm text-xs leading-relaxed text-faint">{children}</div>}
    </div>
  )
}
