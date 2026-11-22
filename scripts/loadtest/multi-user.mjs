#!/usr/bin/env node
// Many-user load test: N virtual users, each with an own account session, walk the hot read endpoints
// with think times. Unlike loadtest.mjs (one shared user, CI gate) this shows how the API behaves when
// 100-1000 different users hit it, and where it saturates.
//
// Seed the users first (throwaway database only):
//   LOADTEST_USERS=1000 LOADTEST_COOKIES=/tmp/cookies.txt pnpm --filter @steuereule/api exec tsx scripts/loadtest-seed.ts
// Then:
//   node scripts/loadtest/multi-user.mjs --cookies /tmp/cookies.txt --users 1000 --seconds 60 --think 5000-15000 \
//     [--url http://localhost:3000] [--origin http://localhost:8081] [--pid <api pid>] [--max-p95 <ms>] [--max-error-rate <percent>]
// --pid additionally samples the API process' CPU and memory (ps). With --max-p95 / --max-error-rate the run
// exits 1 when the slowest endpoint's p95 or the error rate is above the budget (the nightly pipeline uses both).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : fallback
}
const COOKIES_FILE = option('cookies')
if (!COOKIES_FILE) {
  console.error('Missing --cookies <file> (see the header of this script).')
  process.exit(2)
}
const USERS = Number(option('users', '100'))
const SECONDS = Number(option('seconds', '60'))
const [THINK_MIN, THINK_MAX] = option('think', '5000-15000').split('-').map(Number)
const BASE_URL = option('url', process.env.API_URL || 'http://localhost:3000')
const ORIGIN = option('origin', process.env.WEB_ORIGIN || 'http://localhost:8081')
const PID = option('pid')
const MAX_P95_MS = option('max-p95') === undefined ? null : Number(option('max-p95'))
const MAX_ERROR_RATE = option('max-error-rate') === undefined ? null : Number(option('max-error-rate'))

const cookies = readFileSync(COOKIES_FILE, 'utf8').split('\n').filter(Boolean).slice(0, USERS)
if (cookies.length < USERS) console.warn(`Only ${cookies.length} cookies for ${USERS} users: sessions are shared.`)

// [name, path, weight]: how often a user opens which screen.
const MIX = [
  ['cockpit', '/v1/steuerjahre/2025/cockpit', 3],
  ['belege-page', '/v1/belege?limit=30', 3],
  ['advisor-session', '/v1/steuerjahre/2025/advisor/session', 2],
  ['verlauf', '/v1/verlauf', 1],
  ['ausdruck-pruefung', '/v1/steuerjahre/2025/ausdruck/pruefung', 1],
  ['health', '/v1/health/ready', 1],
]
const bag = MIX.flatMap(([name, path, weight]) => Array.from({ length: weight }, () => [name, path]))
const stats = Object.fromEntries(MIX.map(([name]) => [name, { latencies: [], errors: {} }]))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const percentile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0)
const countError = (name, key) => {
  stats[name].errors[key] = (stats[name].errors[key] ?? 0) + 1
}

const state = { stopped: false }
async function virtualUser(index) {
  await sleep(Math.random() * THINK_MAX) // spread the start
  while (!state.stopped) {
    const [name, path] = bag[Math.floor(Math.random() * bag.length)]
    const startedAt = performance.now()
    try {
      const res = await fetch(BASE_URL + path, { headers: { Origin: ORIGIN, Cookie: cookies[index % cookies.length] } })
      await res.arrayBuffer()
      if (res.status === 200) stats[name].latencies.push(performance.now() - startedAt)
      else countError(name, res.status)
    } catch (error) {
      countError(name, error?.cause?.code ?? error?.name ?? 'error')
    }
    await sleep(THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN))
  }
}

const samples = { cpu: [], rssMb: [] }
const sampler = PID
  ? setInterval(() => {
      try {
        const [cpu, rss] = execFileSync('ps', ['-o', '%cpu=,rss=', '-p', PID]).toString().trim().split(/\s+/).map(Number)
        samples.cpu.push(cpu)
        samples.rssMb.push(rss / 1024)
      } catch {
        // The process may already be gone; sampling is best effort.
      }
    }, 2000)
  : null

const startedAt = performance.now()
const workers = Array.from({ length: USERS }, (_, index) => virtualUser(index))
await sleep(SECONDS * 1000)
state.stopped = true
await Promise.all(workers)
if (sampler) clearInterval(sampler)
const duration = (performance.now() - startedAt) / 1000

let total = 0
let failed = 0
let worstP95 = 0
const rows = Object.entries(stats).map(([name, { latencies, errors }]) => {
  const sorted = latencies.sort((a, b) => a - b)
  const errorCount = Object.values(errors).reduce((sum, n) => sum + n, 0)
  total += sorted.length + errorCount
  failed += errorCount
  worstP95 = Math.max(worstP95, percentile(sorted, 0.95))
  const ms = (q) => `${percentile(sorted, q).toFixed(0)}`.padStart(5)
  return `${name.padEnd(18)} n=${String(sorted.length).padStart(5)} p50=${ms(0.5)}ms p95=${ms(0.95)}ms p99=${ms(0.99)}ms err=${errorCount}${errorCount ? ` ${JSON.stringify(errors)}` : ''}`
})
console.log(`\n=== ${USERS} users, think ${THINK_MIN}-${THINK_MAX} ms, ${duration.toFixed(0)} s ===`)
console.log(rows.join('\n'))
console.log(`total=${total} errors=${failed} (${((failed / Math.max(1, total)) * 100).toFixed(2)}%) throughput=${(total / duration).toFixed(0)} req/s`)
if (PID && samples.cpu.length > 0) {
  const avg = (values) => (values.reduce((sum, n) => sum + n, 0) / values.length).toFixed(0)
  console.log(`server cpu avg=${avg(samples.cpu)}% max=${Math.max(...samples.cpu).toFixed(0)}%  rss max=${Math.max(...samples.rssMb).toFixed(0)} MB`)
}

const errorRate = (failed / Math.max(1, total)) * 100
const violations = []
if (MAX_ERROR_RATE !== null && errorRate > MAX_ERROR_RATE) violations.push(`error rate ${errorRate.toFixed(2)}% > ${MAX_ERROR_RATE}%`)
if (MAX_P95_MS !== null && worstP95 > MAX_P95_MS) violations.push(`worst p95 ${worstP95.toFixed(0)} ms > ${MAX_P95_MS} ms`)
if (violations.length > 0) {
  console.error(`Budget exceeded: ${violations.join('; ')}`)
  process.exit(1)
}
