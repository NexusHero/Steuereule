// A `fetch()`-shaped helper that can originate a real HTTP request from a CHOSEN
// local source address (`localAddress`) — something `fetch()` itself has no option
// for. Used by acceptance tests that need a genuine second socket peer (a real
// loopback address distinct from 127.0.0.1, e.g. 127.0.0.2) rather than a header
// value alone, because #350's seam anchors trust in the actual TCP peer
// (`request.ip`), not in anything a caller's header claims. The whole 127.0.0.0/8
// range is usable as both bind and connect addresses on Linux with no extra routing
// config — measured directly against this sandbox before relying on it here.
import http from 'node:http'

export interface RawRequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
  /** The local address this request's socket connects FROM — the real TCP peer the
   *  server will see as `request.ip`. Defaults to whatever the OS picks (127.0.0.1
   *  for a loopback target) when omitted. */
  localAddress?: string
}

export interface RawResponse {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
}

export function rawRequest(url: string, options: RawRequestOptions = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: options.method ?? 'GET',
        headers: options.headers,
        localAddress: options.localAddress,
      },
      (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString('utf8')
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
      },
    )
    req.on('error', reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}
