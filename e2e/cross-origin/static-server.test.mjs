import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { originOf, securityHeaders, startStaticServer } from './static-server.mjs'

async function serve(options) {
  const root = await mkdtemp(join(tmpdir(), 'static-server-'))
  await writeFile(join(root, 'index.html'), '<!doctype html><title>x</title>')
  const server = await startStaticServer(root, 0, '127.0.0.1', options)
  return { server, url: `http://127.0.0.1:${server.address().port}` }
}

test('originOf keeps the origin only and rejects non-URLs', () => {
  assert.equal(originOf('https://api.example.org/v1/x'), 'https://api.example.org')
  assert.equal(originOf('not a url'), null)
  assert.equal(originOf(''), null)
})

test('every response carries the fixed headers, also 304 and the SPA fallback', async () => {
  const { server, url } = await serve({ apiOrigin: 'https://api.example.org' })
  try {
    const page = await fetch(`${url}/some/deep/link`)
    assert.equal(page.status, 200)
    assert.match(page.headers.get('strict-transport-security'), /max-age=\d+/)
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(page.headers.get('x-frame-options'), 'DENY')
    assert.equal(page.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
    assert.match(page.headers.get('permissions-policy'), /geolocation=\(\)/)

    const cached = await fetch(`${url}/`, { headers: { 'if-none-match': page.headers.get('etag') } })
    assert.equal(cached.status, 304)
    assert.equal(cached.headers.get('x-content-type-options'), 'nosniff')
  } finally {
    server.close()
  }
})

test('the CSP names the API origin in connect-src and forbids framing, objects and inline scripts', async () => {
  const { server, url } = await serve({ apiOrigin: 'https://api.example.org/ignored/path' })
  try {
    const csp = (await fetch(url)).headers.get('content-security-policy')
    assert.match(csp, /connect-src 'self' https:\/\/api\.example\.org /)
    assert.doesNotMatch(csp, /api\.example\.org\/ignored/)
    assert.match(csp, /frame-ancestors 'none'/)
    assert.match(csp, /object-src 'none'/)
    assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'(;|$)/)
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/)
    assert.doesNotMatch(csp, /connect-src[^;]*\s\*(\s|;|$)/)
  } finally {
    server.close()
  }
})

test('without an API origin there is no CSP (local E2E servers) but the other headers stay', async () => {
  assert.equal(securityHeaders(null)['content-security-policy'], undefined)
  assert.equal(securityHeaders(null)['x-frame-options'], 'DENY')
})

test('WEB-34: the CSP lets the receipt preview frame its own blob: URL', async () => {
  const csp = securityHeaders('https://api.example.org')['content-security-policy']
  assert.match(csp, /frame-src 'self' blob:(;|$)/)
  assert.match(csp, /child-src 'self' blob:(;|$)/)
})

test('WEB-21: a malformed percent-encoding is a 400 without internals, not a 500 with the error text', async () => {
  const { server, url } = await serve({ apiOrigin: 'https://api.example.org' })
  try {
    const response = await fetch(`${url}/%E0%A4%A`)
    assert.equal(response.status, 400)
    const body = await response.text()
    assert.doesNotMatch(body, /URIError|malformed/i)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.match(response.headers.get('content-security-policy'), /default-src 'self'/)
  } finally {
    server.close()
  }
})

test('WEB-21: under NODE_ENV=production the server refuses to start without an API origin (no CSP)', () => {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('./static-server.mjs', import.meta.url)), '--root', tmpdir(), '--port', '0'], {
    env: { ...process.env, NODE_ENV: 'production', API_ORIGIN: '' },
    encoding: 'utf8',
    timeout: 10_000,
  })
  assert.equal(run.status, 1)
  assert.match(run.stderr, /API origin.*required.*production/i)
})
