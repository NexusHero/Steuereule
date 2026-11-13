// Where the wait before the first word goes (#481). Runs a few turns against the real model
// through the production engine and prints, per setting: time to the first sign of life (a
// reasoning or status event), to the first answer token, and to the end.
//
//   AI_EVAL_GEMINI_API_KEY=… node --import tsx scripts/ai-eval/latency-check.ts   (from apps/api)
//
// Skipped without the key. A handful of short turns, a few cents.
import type { AdvisorStreamEvent } from '@steuereule/core'
import { EnvAiRuntimeConfigService } from '../../src/ki/ai-runtime-config.service.js'
import { LangGraphAdvisorEngine } from '../../src/ki/langgraph-advisor.engine.js'
import { PERSONAS } from './golden.js'
import { installProviderRejectionGuard } from '../../src/ki/provider-rejections.js'

// As in main.ts: a Gemini stream that breaks off after its turn ended must not end the run.
installProviderRejectionGuard()

const key = process.env.AI_EVAL_GEMINI_API_KEY?.trim()
if (!key) {
  console.log('[latency] skipped: AI_EVAL_GEMINI_API_KEY is not set')
  process.exit(0)
}

const QUESTIONS = [
  ['plain question', 'Was ist die Entfernungspauschale?'],
  ['draft', 'Ich habe 300 € gespendet. Trag das bitte ein.'],
] as const

const ALL_SETTINGS: ReadonlyArray<readonly [string, Record<string, string>]> = [
  ['thoughts shown, level low', { AI_ADVISOR_THINKING_LEVEL: 'low' }],
  ['thoughts shown, level medium', { AI_ADVISOR_THINKING_LEVEL: 'medium' }],
  ['thoughts shown, level high', { AI_ADVISOR_THINKING_LEVEL: 'high' }],
  ['thoughts shown, model decides', { AI_ADVISOR_THINKING_LEVEL: 'auto' }],
  ['thoughts hidden, level medium', { AI_ADVISOR_REASONING: 'off', AI_ADVISOR_THINKING_LEVEL: 'medium' }],
]
// LATENCY_ONLY=medium,low narrows the run to the settings whose label contains one of the words.
const only = (process.env.LATENCY_ONLY ?? '').split(',').map((word) => word.trim()).filter((word) => word !== '')
const SETTINGS = only.length === 0 ? ALL_SETTINGS : ALL_SETTINGS.filter(([label]) => only.some((word) => label.includes(word)))

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? Number.NaN

async function turn(env: Record<string, string>, message: string) {
  const runtime = new EnvAiRuntimeConfigService({ GEMINI_API_KEY: key, AI_ADVISOR_PROVIDER: 'google-genai', ...(process.env.AI_EVAL_GEMINI_MODEL ? { AI_ADVISOR_MODEL: process.env.AI_EVAL_GEMINI_MODEL } : {}), ...env })
  const engine = new LangGraphAdvisorEngine(runtime)
  const startedAt = Date.now()
  let firstSign: number | null = null
  let firstToken: number | null = null
  let mode = '?'
  for await (const event of engine.streamTurn({ message, digest: Object.values(PERSONAS)[0]! }) as AsyncIterable<AdvisorStreamEvent>) {
    const at = Date.now() - startedAt
    if (firstSign === null && (event.event === 'reasoning' || event.event === 'token' || event.event === 'tool')) firstSign = at
    if (firstToken === null && event.event === 'token') firstToken = at
    if (event.event === 'done') mode = (event.data as { mode: string }).mode
  }
  return { firstSign, firstToken, total: Date.now() - startedAt, mode }
}

const RUNS = Number(process.env.LATENCY_RUNS ?? 3)
console.log(`| Einstellung | Frage | erstes Lebenszeichen | erstes Wort | fertig |`)
console.log(`| --- | --- | --- | --- | --- |`)
for (const [label, env] of SETTINGS) {
  for (const [kind, message] of QUESTIONS) {
    const results: Array<Awaited<ReturnType<typeof turn>>> = []
    for (let i = 0; i < RUNS; i += 1) results.push(await turn(env, message))
    const bad = results.filter((r) => r.mode !== 'langgraph').length
    const s = (pick: (r: Awaited<ReturnType<typeof turn>>) => number | null) => `${(median(results.map((r) => pick(r) ?? Number.NaN)) / 1000).toFixed(1)} s`
    console.log(`| ${label} | ${kind} | ${s((r) => r.firstSign)} | ${s((r) => r.firstToken)} | ${s((r) => r.total)}${bad > 0 ? ` (${bad} fallback)` : ''} |`)
  }
}
