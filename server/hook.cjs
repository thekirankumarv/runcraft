// Preloaded into Node services via NODE_OPTIONS. Reports incoming HTTP requests to Runcraft's Traffic tab.
const http = require('node:http')
const https = require('node:https')

const target = process.env.RUNCRAFT_TRAFFIC
const token = process.env.RUNCRAFT_TOKEN
const MAX_BODY = 32 * 1024
const TEXT = /json|text|xml|javascript|x-www-form-urlencoded|graphql/i
const utf8 = new TextDecoder('utf-8', { fatal: true })

const sentHeaders = (res) => {
  if (typeof res._header !== 'string') return res.getHeaders()
  const headers = {}
  for (const line of res._header.split('\r\n').slice(1)) {
    const i = line.indexOf(':')
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim()
  }
  return headers
}

if (target && token && !globalThis.__runcraftTraffic) {
  globalThis.__runcraftTraffic = true
  let queue = []
  let timer

  const flush = () => {
    timer = undefined
    const entries = queue.splice(0, 200)
    if (!entries.length) return
    try {
      const req = http.request(target, { method: 'POST', headers: { 'content-type': 'application/json', 'x-runcraft-token': token } })
      req.on('socket', (s) => s.unref())
      req.on('error', () => {})
      req.on('response', (r) => r.resume())
      req.end(JSON.stringify(entries))
    } catch {}
    if (queue.length) schedule()
  }
  const schedule = () => {
    if (!timer) timer = setTimeout(flush, 250).unref()
  }

  const tee = () => {
    const chunks = []
    let size = 0
    return {
      add(chunk, encoding) {
        if (chunk == null || typeof chunk === 'function') return
        const buf = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk instanceof Uint8Array ? chunk : String(chunk), typeof encoding === 'string' ? encoding : 'utf8')
        if (size < MAX_BODY) chunks.push(buf.subarray(0, MAX_BODY - size))
        size += buf.length
      },
      read(headers) {
        if (!size) return { size }
        const type = String(headers['content-type'] ?? '')
        const encoded = headers['content-encoding'] && headers['content-encoding'] !== 'identity'
        if (encoded || (type && !TEXT.test(type))) return { size }
        const buf = Buffer.concat(chunks)
        try {
          return size > MAX_BODY ? { size, body: buf.toString('utf8'), truncated: true } : { size, body: utf8.decode(buf) }
        } catch {
          return { size }
        }
      },
    }
  }

  const track = (req, res) => {
    const start = Date.now()
    const reqBody = tee()
    const resBody = tee()
    const emit = req.emit
    req.emit = function (event, chunk) {
      if (event === 'data') reqBody.add(chunk)
      return emit.apply(this, arguments)
    }
    const write = res.write
    const end = res.end
    res.write = function (chunk, encoding) {
      resBody.add(chunk, encoding)
      return write.apply(this, arguments)
    }
    res.end = function (chunk, encoding) {
      resBody.add(chunk, encoding)
      return end.apply(this, arguments)
    }
    let done = false
    const finish = () => {
      if (done) return
      done = true
      try {
        const resHeaders = sentHeaders(res)
        queue.push({
          t: start,
          ms: Date.now() - start,
          method: req.method,
          url: req.url,
          host: req.headers.host,
          status: res.writableFinished ? res.statusCode : 0,
          reqHeaders: req.headers,
          resHeaders,
          req: reqBody.read(req.headers),
          res: resBody.read(resHeaders),
        })
        if (queue.length > 1000) queue = queue.slice(-1000)
        schedule()
      } catch {}
    }
    res.once('finish', finish)
    res.once('close', finish)
  }

  for (const Server of [http.Server, https.Server]) {
    const emit = Server.prototype.emit
    Server.prototype.emit = function (event, req, res) {
      if (event === 'request') {
        try {
          track(req, res)
        } catch {}
      }
      return emit.apply(this, arguments)
    }
  }
}
