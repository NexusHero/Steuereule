// #476 — live check of what the unit tests can only imitate: reasoning summaries, token usage and
// prompt-cache hits against a real provider, through the production engine.
//
//   AI_EVAL_GEMINI_API_KEY=…    node --import tsx scripts/ai-eval/reasoning-check.ts   (from apps/api)
//   AI_EVAL_ANTHROPIC_API_KEY=… node --import tsx scripts/ai-eval/reasoning-check.ts
//   AI_EVAL_OPENAI_API_KEY=…    node --import tsx scripts/ai-eval/reasoning-check.ts
//
// Every key that is set is checked; without any the run is skipped (exit 0). A handful of short
// turns per provider, a few cents in total. AI_EVAL_<PROVIDER>_MODEL overrides the app's default model.
//
// What it proves per provider:
//   1. a plain answer arrives with reasoning as separate events, and none of it inside the answer
//   2. a turn with a tool call survives the second model round (thinking blocks must be passed back)
//   3. token usage is reported
//   4. the second turn reads the stable system prompt from the provider's cache
//   5. the forced plan ("Was hab ich vergessen?") works with reasoning on
import type { AdvisorStreamEvent, AdvisorTurnResult } from '@steuereule/core'
import { EnvAiRuntimeConfigService, type AiProviderKind } from '../../src/ki/ai-runtime-config.service.js'
import { LangGraphAdvisorEngine } from '../../src/ki/langgraph-advisor.engine.js'
import { PERSONAS } from './golden.js'

interface Target {
  readonly provider: AiProviderKind
  readonly keyEnv: string
  readonly keyName: string
  readonly modelEnv: string
}

const TARGETS: readonly Target[] = [
  { provider: 'google-genai', keyEnv: 'AI_EVAL_GEMINI_API_KEY', keyName: 'GEMINI_API_KEY', modelEnv: 'AI_EVAL_GEMINI_MODEL' },
  { provider: 'anthropic', keyEnv: 'AI_EVAL_ANTHROPIC_API_KEY', keyName: 'ANTHROPIC_API_KEY', modelEnv: 'AI_EVAL_ANTHROPIC_MODEL' },
  { provider: 'openai', keyEnv: 'AI_EVAL_OPENAI_API_KEY', keyName: 'OPENAI_API_KEY', modelEnv: 'AI_EVAL_OPENAI_MODEL' },
]

interface Turn {
  readonly reply: string
  readonly reasoning: string
  readonly reasoningEvents: number
  readonly tools: readonly string[]
  readonly planned: boolean
  readonly result: AdvisorTurnResult | null
  readonly error: string | null
}

async function runTurn(engine: LangGraphAdvisorEngine, message: string, planRequired = false): Promise<Turn> {
  const digest = Object.values(PERSONAS)[0]!
  let reply = ''
  let reasoning = ''
  let reasoningEvents = 0
  let planned = false
  const tools: string[] = []
  let result: AdvisorTurnResult | null = null
  let error: string | null = null
  try {
    for await (const event of engine.streamTurn({ message, digest, planRequired }) as AsyncIterable<AdvisorStreamEvent>) {
      if (event.event === 'token') reply += event.data.text
      if (event.event === 'reasoning') {
        reasoning += event.data.text
        reasoningEvents += 1
      }
      if (event.event === 'tool') tools.push(event.data.name)
      if (event.event === 'plan') planned = true
      if (event.event === 'error') error = `${event.data.code}: ${event.data.message}`
      if (event.event === 'done') result = event.data as AdvisorTurnResult
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }
  return { reply, reasoning, reasoningEvents, tools, planned, result, error }
}

async function check(target: Target, key: string): Promise<boolean> {
  const model = process.env[target.modelEnv]?.trim()
  const runtime = new EnvAiRuntimeConfigService({
    [target.keyName]: key,
    AI_ADVISOR_PROVIDER: target.provider,
    ...(model ? { AI_ADVISOR_MODEL: model } : {}),
    AI_ADVISOR_REASONING: 'summary',
  })
  const slot = await runtime.resolveSlot('advisor_chat')
  const engine = new LangGraphAdvisorEngine(runtime)
  const tag = `[reasoning-check] ${target.provider} (${slot.model})`
  let ok = true
  const verdict = (pass: boolean, label: string, detail = ''): void => {
    if (!pass) ok = false
    console.log(`${tag} ${pass ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  }
  /** Observed, not required: a model may legitimately not offer it. */
  const note = (seen: boolean, label: string, detail = ''): void => console.log(`${tag} ${seen ? '✅' : '⚠️ '} ${label}${detail ? ` — ${detail}` : ''}`)

  const plain = await runTurn(engine, 'Erkläre mir in zwei Sätzen, was der Arbeitnehmer-Pauschbetrag ist.')
  const reached = plain.result?.mode === 'langgraph' && plain.error === null
  verdict(reached, 'the model answered through the engine', plain.error ?? (plain.result ? `mode ${plain.result.mode}` : 'no result'))
  if (!reached) return false
  note(plain.reasoningEvents > 0, 'reasoning arrived as its own events', `${plain.reasoningEvents} events, ${plain.reasoning.length} characters`)
  verdict(plain.reasoning.length === 0 || !plain.reply.includes(plain.reasoning.slice(0, 60)), 'no reasoning inside the answer')
  verdict(plain.result?.usage !== undefined && plain.result.usage.inputTokens > 0, 'token usage reported', JSON.stringify(plain.result?.usage ?? null))

  const second = await runTurn(engine, 'Und was ist die Entfernungspauschale, in zwei Sätzen?')
  note((second.result?.usage?.cachedInputTokens ?? 0) > 0, 'second turn read the system prompt from the cache', `${second.result?.usage?.cachedInputTokens ?? 0} of ${second.result?.usage?.inputTokens ?? 0} input tokens`)

  const withTool = await runTurn(engine, 'Mein einfacher Arbeitsweg sind jetzt 38 km. Bitte bereite den Eintrag vor.')
  verdict(withTool.error === null && withTool.result?.mode === 'langgraph', 'a turn with a tool call completes with reasoning on', withTool.error ?? `tools: ${withTool.tools.join(', ') || 'none'}`)
  note(withTool.tools.length > 0, 'the model actually called a tool in that turn', withTool.tools.join(', '))

  const plan = await runTurn(engine, 'Was hab ich vergessen?', true)
  verdict(plan.error === null && plan.result?.mode === 'langgraph', 'the forced plan turn completes with reasoning on', plan.error ?? '')
  note(plan.planned, 'the plan was opened')
  return ok
}

async function main(): Promise<void> {
  const present = TARGETS.filter((target) => process.env[target.keyEnv]?.trim())
  if (present.length === 0) {
    console.log(`[reasoning-check] skipped — none of ${TARGETS.map((t) => t.keyEnv).join(', ')} is set`)
    return
  }
  let allOk = true
  for (const target of present) {
    if (!(await check(target, process.env[target.keyEnv]!.trim()))) allOk = false
  }
  console.log(allOk ? '[reasoning-check] PASS' : '[reasoning-check] FAIL — see ❌ above')
  if (!allOk) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
