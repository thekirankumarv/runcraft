import { ArrowUpRight, Plug, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { fail, select, svcName, useStore } from '../lib/store'
import type { PortInfo } from '../lib/types'
import { Button, Empty, IconButton } from './ui'

export default function PortsView() {
  const pid = useStore((s) => s.pid)
  const [ports, setPorts] = useState<PortInfo[] | null>(null)
  const [query, setQuery] = useState('')
  const [confirm, setConfirm] = useState<number>()

  const load = () => api<PortInfo[]>('GET', '/api/ports').then(setPorts, fail)
  useEffect(() => {
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [])

  const kill = async (p: PortInfo) => {
    await api('POST', '/api/ports/kill', { pid: p.pid }).catch(fail)
    toast.success(`Stopped ${p.command} on :${p.port}`)
    setConfirm(undefined)
    setTimeout(load, 500)
  }

  const shown = ports?.filter((p) => !query || `${p.port} ${p.command} ${p.pid}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <div>
            <h2 className="text-[15px] font-semibold">Listening ports</h2>
            <p className="text-xs text-faint">Everything on this machine accepting TCP connections. Free a stuck port without hunting for its PID.</p>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by port or process"
            className="ml-auto h-8 w-56 rounded-lg border border-line bg-panel px-2.5 text-xs outline-none placeholder:text-faint focus:border-accent/50"
          />
          <IconButton icon={RefreshCw} label="Refresh" onClick={load} />
        </div>
        {shown && !shown.length ? (
          <Empty icon={Plug} title="No listening ports" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-raised text-[11px] text-faint">
                <tr>
                  <th className="px-4 py-2 font-medium">Port</th>
                  <th className="px-4 py-2 font-medium">Process</th>
                  <th className="px-4 py-2 font-medium">PID</th>
                  <th className="px-4 py-2 font-medium">Address</th>
                  <th className="px-4 py-2 font-medium">Service</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown?.map((p) => (
                  <tr key={`${p.pid}-${p.port}`} className="group border-t border-line hover:bg-raised/60">
                    <td className="px-4 py-2 font-mono font-semibold">
                      <a href={`http://localhost:${p.port}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-violet-300">
                        {p.port}
                        <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100" />
                      </a>
                    </td>
                    <td className="px-4 py-2">{p.command}</td>
                    <td className="px-4 py-2 font-mono text-xs text-faint">{p.pid}</td>
                    <td className="px-4 py-2 font-mono text-xs text-faint">{p.address}</td>
                    <td className="px-4 py-2">
                      {p.owner && (
                        <button
                          onClick={() => p.owner!.project === pid && select(p.owner!.service, 'logs')}
                          className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-violet-200"
                        >
                          {p.owner.project === pid ? svcName(p.owner.service) : p.owner.service}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {confirm === p.pid ? (
                        <span className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setConfirm(undefined)}>
                            Cancel
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => kill(p)}>
                            Kill {p.command}
                          </Button>
                        </span>
                      ) : (
                        <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => setConfirm(p.pid)}>
                          Kill
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
