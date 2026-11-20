const TOKEN_KEY = 'runcraft.token'

function readToken() {
  const params = new URLSearchParams(location.search)
  const fromUrl = params.get('t')
  if (fromUrl) {
    try {
      localStorage.setItem(TOKEN_KEY, fromUrl)
    } catch {}
    params.delete('t')
    const qs = params.toString()
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : ''))
    return fromUrl
  }
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export const token = readToken()
export const clientId = crypto.randomUUID()

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-runcraft-token': token, 'x-runcraft-client': clientId },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(data?.error ?? res.statusText, res.status)
  return data
}

export function connectSocket(onMessages: (msgs: any[]) => void, onState: (open: boolean) => void) {
  let ws: WebSocket
  let retry = 500
  const connect = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?t=${encodeURIComponent(token)}`)
    ws.onopen = () => {
      retry = 500
      onState(true)
    }
    ws.onmessage = (e) => onMessages(JSON.parse(e.data))
    ws.onclose = () => {
      onState(false)
      setTimeout(connect, (retry = Math.min(retry * 2, 5000)))
    }
  }
  connect()
}
