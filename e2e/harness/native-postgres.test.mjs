// node --test e2e/harness/native-postgres.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asUnprivileged, nativePostgresCommands, planPrivilege, shellQuote } from './native-postgres.mjs'

const BIN = { initdb: '/usr/lib/postgresql/16/bin/initdb', pg_ctl: '/usr/lib/postgresql/16/bin/pg_ctl' }
const env = ({ euid = 0, commands = ['runuser', 'su'], users = ['postgres'] } = {}) => ({
  euid,
  hasCommand: (name) => commands.includes(name),
  userExists: (name) => users.includes(name),
})
const args = { bin: BIN, dataDir: '/tmp/steuereule-pg-abc', dbUser: 'steuereule', port: '5432' }

test('a non-root process runs the commands as itself, with nothing to chown', () => {
  const commands = nativePostgresCommands({ plan: planPrivilege(env({ euid: 1000 })), ...args })
  assert.equal(commands.chown, null)
  assert.equal(commands.initdb, `"${BIN.initdb}" -D "/tmp/steuereule-pg-abc" -U steuereule --auth=trust --no-locale --encoding=UTF8`)
  assert.equal(commands.start, `"${BIN.pg_ctl}" -D "/tmp/steuereule-pg-abc" -l "/tmp/steuereule-pg-abc/postgres.log" -o "-p 5432" start`)
  assert.equal(commands.stop, `"${BIN.pg_ctl}" -D "/tmp/steuereule-pg-abc" stop -m fast`)
})

test('root drops to the postgres user through runuser and chowns the data directory first', () => {
  const commands = nativePostgresCommands({ plan: planPrivilege(env()), ...args })
  assert.equal(commands.chown, 'chown -R postgres "/tmp/steuereule-pg-abc"')
  for (const key of ['initdb', 'start', 'stop']) assert.match(commands[key], /^runuser -u postgres -- sh -c '/, key)
  assert.match(commands.start, /pg_ctl" -D "\/tmp\/steuereule-pg-abc" -l .* start'$/)
})

test('root without runuser falls back to su', () => {
  const plan = planPrivilege(env({ commands: ['su'] }))
  assert.equal(asUnprivileged(plan, 'echo hi'), `su -s /bin/sh postgres -c 'echo hi'`)
})

test('root with no unprivileged account fails with an actionable message, not an initdb error', () => {
  assert.throws(() => planPrivilege(env({ users: [] })), /does not exist.*Install the `postgresql` package/s)
})

test('root with neither runuser nor su fails with an actionable message', () => {
  assert.throws(() => planPrivilege(env({ commands: [] })), /needs `runuser`.*neither is on PATH/s)
})

test('quoting survives single quotes in the command', () => {
  assert.equal(shellQuote(`a'b`), `'a'\\''b'`)
})
