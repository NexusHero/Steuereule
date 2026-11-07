#!/usr/bin/env node
// Pre-Go-Live Load & Performance Budget Gate for SteuerEule 1.0 (DoD Criterion 5, Ticket 11).
// Simulates concurrent authenticated user journeys against real Prisma + AES-256-GCM + Tax Kernel:
//   Health Ready -> Profile -> Stammdaten -> LStB -> Cockpit -> Ausdruck Pruefung -> Advisor Session
//
// Usage:
//   node scripts/loadtest/loadtest.mjs [--concurrency 5] [--iterations 5] [--url http://localhost:3000] [--origin http://localhost:3300] [--max-p95 250] [--mock]
import { performance } from 'node:perf_hooks'

const args = process.argv.slice(2)
const concurrencyIndex = args.indexOf('--concurrency')
const CONCURRENCY = concurrencyIndex >= 0 ? Number(args[concurrencyIndex + 1]) : 5
const iterIndex = args.indexOf('--iterations')
const ITERATIONS = iterIndex >= 0 ? Number(args[iterIndex + 1]) : 5
const urlIndex = args.indexOf('--url')
const BASE_URL = urlIndex >= 0 ? args[urlIndex + 1] : process.env.API_URL || 'http://localhost:3000'
const originIndex = args.indexOf('--origin')
const ORIGIN =
  originIndex >= 0
    ? args[originIndex + 1]
    : process.env.WEB_ORIGIN || process.env.CORS_ALLOWED_ORIGIN?.split(',')[0]?.trim() || 'http://localhost:8081'
const maxP95Index = args.indexOf('--max-p95')
const MAX_P95_MS = maxP95Index >= 0 ? Number(args[maxP95Index + 1]) : 250
const IS_MOCK = args.includes('--mock')

console.log(`=== SteuerEule 1.0 Real-Session Load & Latency Budget Gate ===`)
console.log(`Target URL: ${BASE_URL} (Origin: ${ORIGIN}, Mock: ${IS_MOCK})`)
console.log(`Concurrency: ${CONCURRENCY}, Iterations per worker: ${ITERATIONS}, Budget: p95 <= ${MAX_P95_MS}ms`)
console.log(`Total Journeys: ${CONCURRENCY * ITERATIONS}\n`)

function extractCookieHeader(res) {
  const raw = res.headers.getSetCookie?.() ?? []
  return raw.map((c) => c.split(';')[0]).join('; ')
}

async function createAuthenticatedSession() {
  if (IS_MOCK) return 'mock=1'
  const email = `loadtest.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@steuereule.test`
  const res = await fetch(`${BASE_URL}/v1/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({
      email,
      password: 'LoadTest-Password-2026!',
      name: 'Load Tester',
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Auth bootstrap failed with HTTP ${res.status}: ${text}`)
  }
  const cookie = extractCookieHeader(res)
  if (!cookie) {
    throw new Error('Auth bootstrap succeeded but returned no session cookie')
  }
  return cookie
}

async function runJourney(cookie, workerId, iter) {
  const latencies = []
  const authHeaders = {
    'Content-Type': 'application/json',
    Origin: ORIGIN,
    Cookie: cookie,
  }

  const step = async (name, fn) => {
    const t0 = performance.now()
    if (IS_MOCK) {
      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 15 + 5)))
    } else {
      await fn()
    }
    const ms = performance.now() - t0
    latencies.push(ms)
  }

  // 1. Health readiness check (includes DB ping)
  await step('health-ready', async () => {
    const res = await fetch(`${BASE_URL}/v1/health/ready`)
    if (res.status !== 200) throw new Error(`Health ready returned ${res.status}`)
  })

  // 2. Profile (AES-256-GCM encrypted write)
  await step('profile', async () => {
    const res = await fetch(`${BASE_URL}/v1/profile`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        firstName: `Load${workerId}`,
        lastName: `Tester${iter}`,
        steuerId: '04444444444',
      }),
    })
    if (res.status !== 200) throw new Error(`Profile returned ${res.status}`)
  })

  // 3. Stammdaten (AES-256-GCM encrypted write)
  await step('stammdaten', async () => {
    const res = await fetch(`${BASE_URL}/v1/stammdaten`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        geburtsdatum: '1990-01-01',
        strasse: 'Testweg',
        hausnummer: '1',
        plz: '10115',
        wohnort: 'Berlin',
        familienstand: 'ledig',
        religion: null,
        iban: 'DE89370400440532013000',
        finanzamt: 'Berlin Mitte',
      }),
    })
    if (res.status !== 200) throw new Error(`Stammdaten returned ${res.status}`)
  })

  // 4. LStB Bruttoarbeitslohn (AES-256-GCM encrypted write)
  await step('lstb', async () => {
    const res = await fetch(`${BASE_URL}/v1/steuerjahre/2025/lstb/bruttoarbeitslohn`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ kind: 'erfasst', value: 48000 + iter * 100 }),
    })
    if (res.status !== 200) throw new Error(`Lstb returned ${res.status}`)
  })

  // 5. Cockpit (Full deterministic tax kernel evaluation + decrypt)
  await step('cockpit', async () => {
    const res = await fetch(`${BASE_URL}/v1/steuerjahre/2025/cockpit`, {
      headers: { Origin: ORIGIN, Cookie: cookie },
    })
    if (res.status !== 200) throw new Error(`Cockpit returned ${res.status}`)
  })

  // 6. Ausdruck Pruefung (Form readiness & gap analysis)
  await step('ausdruck-pruefung', async () => {
    const res = await fetch(`${BASE_URL}/v1/steuerjahre/2025/ausdruck/pruefung`, {
      headers: { Origin: ORIGIN, Cookie: cookie },
    })
    if (res.status !== 200) throw new Error(`Ausdruck Pruefung returned ${res.status}`)
  })

  // 7. Advisor Session (Case digest + Owl suggestions)
  await step('advisor-session', async () => {
    const res = await fetch(`${BASE_URL}/v1/steuerjahre/2025/advisor/session`, {
      headers: { Origin: ORIGIN, Cookie: cookie },
    })
    if (res.status !== 200) throw new Error(`Advisor Session returned ${res.status}`)
  })

  return latencies
}

async function main() {
  const cookie = await createAuthenticatedSession()
  const allLatencies = []
  const failureReasons = []
  let failed = 0
  const start = performance.now()

  const workers = Array.from({ length: CONCURRENCY }, async (_, workerId) => {
    for (let i = 0; i < ITERATIONS; i++) {
      try {
        const l = await runJourney(cookie, workerId, i)
        allLatencies.push(...l)
      } catch (err) {
        failed++
        if (failureReasons.length < 5) {
          failureReasons.push(err instanceof Error ? err.message : String(err))
        }
      }
    }
  })

  await Promise.all(workers)
  const totalDuration = (performance.now() - start) / 1000

  allLatencies.sort((a, b) => a - b)
  const p50 = allLatencies[Math.floor(allLatencies.length * 0.5)] || 0
  const p95 = allLatencies[Math.floor(allLatencies.length * 0.95)] || 0
  const p99 = allLatencies[Math.floor(allLatencies.length * 0.99)] || 0

  const totalReq = allLatencies.length
  const rps = (totalReq / totalDuration).toFixed(1)

  console.log(`=== Results ===`)
  console.log(`Total Requests: ${totalReq}`)
  console.log(`Failed Journeys: ${failed}`)
  if (failureReasons.length > 0) {
    console.log(`Sample Failures: ${failureReasons.join(' | ')}`)
  }
  console.log(`Duration: ${totalDuration.toFixed(2)}s`)
  console.log(`Throughput: ${rps} req/s`)
  console.log(`Latency p50: ${p50.toFixed(1)}ms`)
  console.log(`Latency p95: ${p95.toFixed(1)}ms (Budget: <= ${MAX_P95_MS}ms)`)
  console.log(`Latency p99: ${p99.toFixed(1)}ms`)

  if (failed > 0) {
    console.error(`\n❌ Load test FAILED (${failed} failed journeys)`)
    process.exit(1)
  }
  if (p95 > MAX_P95_MS) {
    console.error(`\n❌ Load test FAILED latency budget: p95 ${p95.toFixed(1)}ms > ${MAX_P95_MS}ms`)
    process.exit(1)
  }

  console.log(`\n✅ Load test PASSED (0 failures, p95 ${p95.toFixed(1)}ms <= ${MAX_P95_MS}ms)`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
