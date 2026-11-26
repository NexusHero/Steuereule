// node --test e2e/harness/ports.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveBootConfig } from './ports.mjs'

test('the defaults are the ports CI documents', () => {
  assert.deepEqual(resolveBootConfig({}, {}), {
    apiPort: 3301,
    webPort: 4173,
    postgresPort: 5432,
    apiOrigin: 'http://localhost:3301',
    webOrigin: 'http://localhost:4173',
    databaseUrl: 'postgres://steuereule:steuereule@localhost:5432/steuereule',
  })
})

test('the environment moves the ports and the origins and the database URL follow', () => {
  const config = resolveBootConfig({}, { E2E_API_PORT: '4301', E2E_WEB_PORT: '5173', E2E_POSTGRES_PORT: '55432' })
  assert.equal(config.apiOrigin, 'http://localhost:4301')
  assert.equal(config.webOrigin, 'http://localhost:5173')
  assert.equal(config.databaseUrl, 'postgres://steuereule:steuereule@localhost:55432/steuereule')
})

test('an explicit option beats the environment', () => {
  assert.equal(resolveBootConfig({ apiPort: 3999 }, { E2E_API_PORT: '4301' }).apiPort, 3999)
})

test('an explicit origin without a port option gives the API the origin\'s port, not a second default', () => {
  const config = resolveBootConfig({ apiOrigin: 'http://localhost:3777' }, {})
  assert.equal(config.apiPort, 3777)
  assert.equal(config.apiOrigin, 'http://localhost:3777')
})

test('an invalid port is refused by name', () => {
  assert.throws(() => resolveBootConfig({}, { E2E_API_PORT: 'abc' }), /E2E_API_PORT must be a TCP port/)
  assert.throws(() => resolveBootConfig({}, { E2E_WEB_PORT: '70000' }), /E2E_WEB_PORT must be a TCP port/)
})

test('an empty variable counts as unset', () => {
  assert.equal(resolveBootConfig({}, { E2E_API_PORT: '' }).apiPort, 3301)
})

// Codex review on #586: an explicit origin or database URL is an option, so its port beats the environment;
// otherwise the service binds one port and is probed at another.
test('an explicit origin beats the environment, and the origin and the port stay in step', () => {
  const config = resolveBootConfig({ apiOrigin: 'http://localhost:3777', webOrigin: 'http://localhost:3778' }, { E2E_API_PORT: '4301', E2E_WEB_PORT: '5173' })
  assert.equal(config.apiPort, 3777)
  assert.equal(config.webPort, 3778)
  assert.equal(config.apiOrigin, 'http://localhost:3777')
})

test('an explicit database URL beats the environment', () => {
  const config = resolveBootConfig({ databaseUrl: 'postgres://u:p@localhost:6543/db' }, { E2E_POSTGRES_PORT: '55432' })
  assert.equal(config.postgresPort, 6543)
  assert.equal(config.databaseUrl, 'postgres://u:p@localhost:6543/db')
})

test('an origin without a port means the scheme default, not the environment', () => {
  assert.equal(resolveBootConfig({ apiOrigin: 'http://localhost' }, { E2E_API_PORT: '4301' }).apiPort, 80)
})

test('a port option that contradicts the origin option is refused', () => {
  assert.throws(() => resolveBootConfig({ apiPort: 3999, apiOrigin: 'http://localhost:3777' }, {}), /apiPort 3999 contradicts apiOrigin/)
})
