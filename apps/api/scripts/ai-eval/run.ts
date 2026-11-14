// #450 Teil 1B — nightly evaluation of the Eule against the real model (Gemini Flash, D6).
//
//   AI_EVAL_GEMINI_API_KEY=… node --import tsx scripts/ai-eval/run.ts      (from apps/api)
//
// Runs the production LangGraph advisor engine with the real chat model, a spy on every prompt that
// leaves for the model, and the golden dataset (golden.ts). Scoring is deterministic (scoring.ts):
// amounts against the core, sources against the legal source list, PII against the spy.
//
// Env:
//   AI_EVAL_GEMINI_API_KEY   the key (CI secret of the same name). Missing → the run is skipped, exit 0.
//   AI_EVAL_MODEL            default gemini-3.8-flash (the app's default for google-genai)
//   AI_EVAL_COST_CAP_EUR     default 5 (D6). The run stops before the next case once the estimate reaches it.
//   AI_EVAL_EUR_PER_MTOK_IN / _OUT  price assumption for the estimate, default 0.30 / 2.50 € per million tokens
//   AI_EVAL_ENFORCE          1 → exit 1 on a threshold violation. Off for the first week (D9).
//   AI_EVAL_REPORT_DIR       default /tmp/ai-eval (report.md, report.json)
import { mkdir, appendFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import type { BaseMessage } from '@langchain/core/messages'
import type { LLMResult } from '@langchain/core/outputs'
import { scrubUserMessagePii, type AdvisorActionProposal, type AdvisorTurnResult } from '@steuereule/core'
import { EnvAiRuntimeConfigService } from '../../src/ki/ai-runtime-config.service.js'
import { createChatModelFromConfig } from '../../src/ki/chat-model.factory.js'
import { LangGraphAdvisorEngine } from '../../src/ki/langgraph-advisor.engine.js'
import { CASES, CONSISTENCY_RUNS, PERSONAS, type PersonaKey } from './golden.js'
import { markdownReport, scoreCase, summarize, type CaseResult, type TurnRecord } from './scoring.js'
import { installProviderRejectionGuard } from '../../src/ki/provider-rejections.js'

// As in main.ts: a Gemini stream that breaks off after its turn ended must not end the run.
installProviderRejectionGuard()

const env = process.env
const KEY = env.AI_EVAL_GEMINI_API_KEY?.trim()
const MODEL = env.AI_EVAL_MODEL?.trim() || 'gemini-3.8-flash'
const COST_CAP_EUR = Number(env.AI_EVAL_COST_CAP_EUR ?? 5)
const EUR_PER_MTOK_IN = Number(env.AI_EVAL_EUR_PER_MTOK_IN ?? 0.3)
const EUR_PER_MTOK_OUT = Number(env.AI_EVAL_EUR_PER_MTOK_OUT ?? 2.5)
const ENFORCE = env.AI_EVAL_ENFORCE === '1' || env.AI_EVAL_ENFORCE === 'true'
const REPORT_DIR = env.AI_EVAL_REPORT_DIR ?? '/tmp/ai-eval'
/** Profile names the app hands to the scrubber; the PII cases use them. */
const KNOWN_NAMES = ['Erika', 'Mustermann']

/** Records every prompt and the token usage of every model call. */
class SpyHandler extends BaseCallbackHandler {
  name = 'ai-eval-spy'
  prompts: string[] = []
  inputTokens = 0
  outputTokens = 0
  /** Calls that reached the model and came back, and calls that failed (key, quota, outage). */
  answered = 0
  failed: string[] = []

  override handleChatModelStart(_llm: unknown, messages: BaseMessage[][]): void {
    for (const batch of messages) {
      this.prompts.push(batch.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n'))
    }
  }

  override handleLLMError(err: unknown): void {
    this.failed.push(err instanceof Error ? err.message.slice(0, 160) : String(err).slice(0, 160))
  }

  override handleLLMEnd(output: LLMResult): void {
    this.answered += 1
    const usage = output.llmOutput?.tokenUsage as { promptTokens?: number; completionTokens?: number } | undefined
    let input = usage?.promptTokens ?? 0
    let out = usage?.completionTokens ?? 0
    if (input === 0 && out === 0) {
      for (const generation of output.generations.flat()) {
        const meta = (generation as { message?: { usage_metadata?: { input_tokens?: number; output_tokens?: number } } }).message?.usage_metadata
        input += meta?.input_tokens ?? 0
        out += meta?.output_tokens ?? 0
      }
    }
    this.inputTokens += input
    this.outputTokens += out
  }

  costEur(): number {
    return (this.inputTokens / 1e6) * EUR_PER_MTOK_IN + (this.outputTokens / 1e6) * EUR_PER_MTOK_OUT
  }
}

async function writeReport(markdown: string, json: unknown): Promise<void> {
  await mkdir(REPORT_DIR, { recursive: true })
  await writeFile(join(REPORT_DIR, 'report.md'), markdown)
  await writeFile(join(REPORT_DIR, 'report.json'), JSON.stringify(json, null, 2) + '\n')
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, markdown)
}

async function main(): Promise<void> {
  if (!KEY) {
    const note = '# KI-Evaluation Eule\n\nÜbersprungen: `AI_EVAL_GEMINI_API_KEY` ist nicht gesetzt.\n'
    await writeReport(note, { skipped: true })
    console.log('[ai-eval] skipped — AI_EVAL_GEMINI_API_KEY is not set')
    return
  }

  const spy = new SpyHandler()
  const runtime = new EnvAiRuntimeConfigService({ GEMINI_API_KEY: KEY, AI_ADVISOR_PROVIDER: 'google-genai', AI_ADVISOR_MODEL: MODEL })
  const engine = new LangGraphAdvisorEngine(runtime, (config) => {
    const model = createChatModelFromConfig(config)
    if (model) model.callbacks = [spy]
    return model
  })

  const results: CaseResult[] = []
  let stoppedByCost = false
  for (const testCase of CASES) {
    if (spy.costEur() >= COST_CAP_EUR) {
      stoppedByCost = true
      console.log(`[ai-eval] cost cap reached (${spy.costEur().toFixed(2)} €) — stopping before ${testCase.id}`)
      break
    }
    const digest = PERSONAS[testCase.persona as PersonaKey]
    if (digest === undefined) throw new Error(`unknown persona ${testCase.persona}`)
    const runs = testCase.kind === 'consistency' ? CONSISTENCY_RUNS : 1
    const turns: TurnRecord[] = []
    for (let run = 0; run < runs; run++) {
      const promptsBefore = spy.prompts.length
      const failedBefore = spy.failed.length
      const started = Date.now()
      let ttftMs: number | null = null
      const actions: AdvisorActionProposal[] = []
      let result: AdvisorTurnResult | null = null
      let error: string | undefined
      try {
        const message = scrubUserMessagePii(testCase.message, KNOWN_NAMES)
        for await (const event of engine.streamTurn({ message, activeScreen: testCase.activeScreen, digest })) {
          if (event.event === 'token' && ttftMs === null) ttftMs = Date.now() - started
          if (event.event === 'action') actions.push(event.data)
          if (event.event === 'error') error = `${event.data.code}: ${event.data.message}`
          if (event.event === 'done') result = event.data as AdvisorTurnResult
        }
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
      }
      // Without a model call the engine answered from its deterministic fallback (bad key, quota, outage):
      // that measures the fallback, not the model. Only the StBerG boundary may skip the model on purpose.
      const prompts = spy.prompts.slice(promptsBefore)
      if (prompts.length === 0 && testCase.kind !== 'stberg' && error === undefined) error = 'the model was not called (deterministic fallback answered)'
      if (spy.failed.length > failedBefore && error === undefined) error = `the model call failed, the fallback answered: ${spy.failed.at(-1)}`
      turns.push({
        replyText: result?.replyText ?? '',
        actions: actions.length > 0 ? actions : (result?.meta.actions ?? []),
        sources: result?.meta.sources ?? [],
        prompts,
        ttftMs,
        ...(error !== undefined ? { error } : {}),
      })
    }
    const scored = scoreCase(testCase, digest, turns)
    results.push(scored)
    console.log(`[ai-eval] ${scored.pass ? '✅' : '❌'} ${testCase.id}${scored.problems.length ? ` — ${scored.problems.join('; ')}` : ''}`)
  }

  if (spy.answered === 0) {
    const note = `# KI-Evaluation Eule — ${MODEL}\n\n**Fehler:** Das Modell wurde in keinem Fall erreicht (Schlüssel, Modellname oder Kontingent prüfen). Gemessen wäre nur die deterministische Rückfallebene.\n`
    await writeReport(note, { model: MODEL, error: 'model never reached' })
    console.error('[ai-eval] the model was never reached — check AI_EVAL_GEMINI_API_KEY and AI_EVAL_MODEL')
    process.exit(1)
  }
  const summary = summarize(results)
  const report = markdownReport({ model: MODEL, costEur: spy.costEur(), costCapEur: COST_CAP_EUR, stoppedByCost, enforce: ENFORCE, results, summary })
  await writeReport(report, { model: MODEL, costEur: spy.costEur(), tokens: { input: spy.inputTokens, output: spy.outputTokens }, stoppedByCost, enforce: ENFORCE, summary, results })
  console.log(`\n${report}`)
  if (ENFORCE && summary.violations.length > 0) {
    console.error(`[ai-eval] ${summary.violations.length} threshold violation(s) — see ${REPORT_DIR}/report.md`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
