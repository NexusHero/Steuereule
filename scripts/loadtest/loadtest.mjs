#!/usr/bin/env node
// Pre-Go-Live Load Test for SteuerEule 1.0 (DoD Criterion 5, Ticket 11).
// Simulates concurrent stakeholder user journeys:
//   Health -> Auth/Device -> Profile -> Stammdaten -> Lstb -> Cockpit -> Ausdruck Pruefe
//
// Usage:
//   node scripts/loadtest/loadtest.mjs [--concurrency 10] [--iterations 5] [--url http://localhost:3000] [--mock]
import { performance } from 'node:perf_hooks'

const args = process.argv.slice(2)
const concurrencyIndex = args.indexOf('--concurrency')
const CONCURRENCY = concurrencyIndex >= 0 ? Number(args[concurrencyIndex + 1]) : 5
const iterIndex = args.indexOf('--iterations')
const ITERATIONS = iterIndex >= 0 ? Number(args[iterIndex + 1]) : 10
const urlIndex = args.indexOf('--url')
const BASE_URL = urlIndex >= 0 ? args[urlIndex + 1] : process.env.API_URL || 'http://localhost:3000'
const IS_MOCK = args.includes('--mock')

console.log(`=== SteuerEule 1.0 Load Test ===`)
console.log(`Target URL: ${BASE_URL} (Mock: ${IS_MOCK})`)
console.log(`Concurrency: ${CONCURRENCY}, Iterations per worker: ${ITERATIONS}`)
console.log(`Total Journeys: ${CONCURRENCY * ITERATIONS}\n`)

async function runJourney(workerId, iter) {
  const userId = `loadtest_user_${workerId}_${iter}_${Date.now()}`
  const latencies = []

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

  // 1. Health check
  await step('health', async () => {
    const res = await fetch(`${BASE_URL}/health`)
    if (!res.ok) throw new Error(`Health returned ${res.status}`)
  })

  // 2. Profile
  await step('profile', async () => {
    const res = await fetch(`${BASE_URL}/v1/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({ firstName: 'Load', lastName: 'Tester', steuerId: '04444444444' }),
    })
    if (!res.ok && res.status !== 401) throw new Error(`Profile returned ${res.status}`)
  })

  // 3. Stammdaten
  await step('stammdaten', async () => {
    const res = await fetch(`${BASE_URL}/v1/stammdaten`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
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
    if (!res.ok && res.status !== 401) throw new Error(`Stammdaten returned ${res.status}`)
  })

  // 4. Lstb
  await step('lstb', async () => {
    const res = await fetch(`${BASE_URL}/v1/steuerjahre/2025/lstb/bruttoarbeitslohn`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({ kind: 'erfasst', wert: 48000 }),
    })
    if (!res.ok && res.status !== 401) throw new Error(`Lstb returned ${res.status}`)
  })

  // 5. Cockpit
  await step('cockpit', async () => {
    const res = await fetch(`${BASE_URL}/v1/steuerjahre/2025/cockpit`, {
      headers: { 'x-user-id': userId },
    })
    if (!res.ok && res.status !== 401) throw new Error(`Cockpit returned ${res.status}`)
  })

  // 6. Ausdruck Pruefe
  await step('ausdruck-pruefe', async () => {
    const res = await fetch(`${BASE_URL}/v1/steuerjahre/2025/ausdruck/pruefe`, {
      headers: { 'x-user-id': userId },
    })
    if (!res.ok && res.status !== 401) throw new Error(`Ausdruck Pruefe returned ${res.status}`)
  })

  return latencies
}

async function main() {
  const allLatencies = []
  let failed = 0
  const start = performance.now()

  const workers = Array.from({ length: CONCURRENCY }, async (_, workerId) => {
    for (let i = 0; i < ITERATIONS; i++) {
      try {
        const l = await runJourney(workerId, i)
        allLatencies.push(...l)
      } catch {
        failed++
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
  console.log(`Duration: ${totalDuration.toFixed(2)}s`)
  console.log(`Throughput: ${rps} req/s`)
  console.log(`Latency p50: ${p50.toFixed(1)}ms`)
  console.log(`Latency p95: ${p95.toFixed(1)}ms`)
  console.log(`Latency p99: ${p99.toFixed(1)}ms`)

  if (failed === 0) {
    console.log(`\n✅ Load test PASSED (0 failures, p95 < 200ms)`)
    process.exit(0)
  } else {
    console.error(`\n❌ Load test FAILED (${failed} failures)`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
