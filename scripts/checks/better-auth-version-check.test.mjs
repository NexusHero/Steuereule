// node --test scripts/checks/better-auth-version-check.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { mismatches, resolvedVersions } from './better-auth-version-check.mjs'

const lock = (api, web) => `lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      better-auth:
        specifier: 0.0.1
        version: 0.0.1

  apps/api:
    dependencies:
      '@better-auth/passkey':
        specifier: ^1.7.15
        version: ${api.passkey}(@better-auth/core@${api.passkey}(x@1))
      better-auth:
        specifier: ${api.auth}
        version: ${api.auth}(@opentelemetry/api@1.10.0)
      fastify:
        specifier: 5.0.0
        version: 5.0.0

  apps/mobile-web:
    dependencies:
      '@better-auth/passkey':
        specifier: ^1.7.15
        version: ${web.passkey}(@better-auth/core@${web.passkey}(x@1))
      better-auth:
        specifier: ${web.auth}
        version: ${web.auth}(@opentelemetry/api@1.10.0)
      fastify:
        specifier: 4.0.0
        version: 4.0.0

packages:

  better-auth@9.9.9:
    resolution: {}
`

test('reads the resolved version of each tracked package, without the peer suffix', () => {
  const text = lock({ auth: '1.7.15', passkey: '1.7.15' }, { auth: '1.7.15', passkey: '1.7.12' })
  assert.deepEqual(resolvedVersions(text, 'apps/api'), { '@better-auth/passkey': '1.7.15', 'better-auth': '1.7.15' })
  assert.deepEqual(resolvedVersions(text, 'apps/mobile-web'), { '@better-auth/passkey': '1.7.12', 'better-auth': '1.7.15' })
  assert.equal(resolvedVersions(text, 'apps/unknown'), null)
})

test('equal versions pass', () => {
  assert.deepEqual(mismatches(lock({ auth: '1.7.15', passkey: '1.7.15' }, { auth: '1.7.15', passkey: '1.7.15' })), [])
})

test('a different better-auth version fails', () => {
  assert.deepEqual(mismatches(lock({ auth: '1.7.15', passkey: '1.7.15' }, { auth: '1.7.12', passkey: '1.7.15' })), [{ name: 'better-auth', 'apps/api': '1.7.15', 'apps/mobile-web': '1.7.12' }])
})

test('a different @better-auth/* package version fails too', () => {
  assert.deepEqual(
    mismatches(lock({ auth: '1.7.15', passkey: '1.7.15' }, { auth: '1.7.15', passkey: '1.7.12' })).map((row) => row.name),
    ['@better-auth/passkey'],
  )
})

test('other packages that differ between the apps are not this check’s business', () => {
  assert.deepEqual(mismatches(lock({ auth: '1.7.15', passkey: '1.7.15' }, { auth: '1.7.15', passkey: '1.7.15' })), [])
})

test('the lockfile of this repository passes', () => {
  assert.deepEqual(mismatches(readFileSync(new URL('../../pnpm-lock.yaml', import.meta.url), 'utf8')), [])
})
