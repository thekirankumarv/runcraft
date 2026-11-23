import { Copy, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { renderSVG } from 'uqr'
import { api } from '../lib/api'
import { fail } from '../lib/store'
import { Button, cx, Menu } from './ui'

interface Phone {
  on: boolean
  url?: string
}

export default function PhoneAccess() {
  const [phone, setPhone] = useState<Phone>({ on: false })
  const [busy, setBusy] = useState(false)

  const refresh = () => api<Phone>('GET', '/api/phone').then(setPhone, () => {})
  useEffect(() => {
    refresh()
  }, [])

  const toggle = async (on: boolean) => {
    setBusy(true)
    try {
      setPhone(await api<Phone>('POST', '/api/phone', { on }))
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Menu
      align="right"
      width="w-80"
      trigger={(open) => (
        <button
          onClick={() => !open && refresh()}
          aria-label="Open on phone"
          title="Open on phone"
          className={cx(
            'relative inline-flex size-9 items-center justify-center rounded-lg border transition-colors',
            open ? 'border-line-strong bg-hover text-fg' : 'border-line bg-panel text-faint hover:text-muted',
          )}
        >
          <Smartphone size={15} />
          {phone.on && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-ok" />}
        </button>
      )}
    >
      {() => (
        <div className="p-3">
          <div className="text-[13px] font-semibold">Open on your phone</div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            Watch services and logs, and start, stop or restart them from a phone on the same Wi-Fi.
          </p>
          {phone.on && phone.url ? (
            <>
              <div
                className="mx-auto mt-3 size-48 overflow-hidden rounded-lg bg-white p-2"
                dangerouslySetInnerHTML={{ __html: renderSVG(phone.url, { border: 1, whiteColor: '#ffffff', blackColor: '#000000' }) }}
              />
              <button
                onClick={() => navigator.clipboard.writeText(phone.url!).then(() => toast.success('Link copied'), fail)}
                className="mt-3 flex w-full items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-left font-mono text-[11px] text-muted hover:bg-hover hover:text-fg"
              >
                <span className="min-w-0 flex-1 truncate">{phone.url.replace(/\?t=.*/, '')}</span>
                <Copy size={12} className="shrink-0" />
              </button>
              <p className="mt-3 rounded-md bg-warn/10 px-2.5 py-2 text-[11.5px] leading-relaxed text-amber-300">
                Anyone on this network with the link can see logs and variables saved in runcraft.json, and start or stop services. Terminals, git, env editing
                and port killing stay off. Turn it off when you're done.
              </p>
              <Button size="sm" className="mt-3 w-full justify-center" disabled={busy} onClick={() => toggle(false)}>
                Turn off
              </Button>
            </>
          ) : (
            <Button size="sm" variant="primary" className="mt-3 w-full justify-center" disabled={busy} onClick={() => toggle(true)}>
              <Smartphone size={13} /> Turn on and show QR code
            </Button>
          )}
        </div>
      )}
    </Menu>
  )
}
