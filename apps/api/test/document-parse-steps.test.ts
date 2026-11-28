// The steps the document parse strategies share (receipt/parse/document-parse-steps.ts), each on its own.
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService, type ResolvedAiSlotConfig } from '../src/llm/ai-runtime-config.service.js'
import type { SingleShotModel, SingleShotOptions, SingleShotPrompt } from '../src/llm/single-shot-model.js'
import type { ParseReceiptDto } from '../src/receipt/dto/parse-receipt.dto.js'
import {
  DETERMINISTIC_ENGINE,
  EXTRACTION_TIMEOUT_MS,
  NOTHING_STAGED,
  extractWithModel,
  isFromOcr,
  isolateGrounding,
  noTaxYearReason,
  parseModelJson,
  resolveVisionModel,
  stagedDraftsOf,
  stagingEngine,
  yearConflictOf,
} from '../src/receipt/parse/document-parse-steps.js'

const SLOT: ResolvedAiSlotConfig = { slot: 'vision_ocr', enabled: true, provider: 'anthropic', model: 'some-model', apiKey: 'test-key' }

function runtime(options: { killSwitch?: boolean; slot?: ResolvedAiSlotConfig; failing?: boolean }): AiRuntimeConfigService {
  return {
    async resolveLimits() {
      return DEFAULT_AI_TURN_LIMITS
    },
    async isKillSwitchActive() {
      if (options.failing) throw new Error('config unavailable')
      return options.killSwitch ?? false
    },
    async resolveSlot() {
      return options.slot ?? SLOT
    },
  }
}

function replying(answer: string): SingleShotModel & { calls: { prompt: SingleShotPrompt; options: SingleShotOptions }[] } {
  const calls: { prompt: SingleShotPrompt; options: SingleShotOptions }[] = []
  return {
    calls,
    async complete(prompt, options) {
      calls.push({ prompt, options })
      return answer
    },
  }
}

const dto = (overrides: Partial<ParseReceiptDto> = {}): ParseReceiptDto => ({ fileName: 'beleg.pdf', taxYear: 2025, ...overrides }) as ParseReceiptDto

describe('resolveVisionModel', () => {
  const model = replying('{}')

  it('returns the model and its slot when the vision slot is on', async () => {
    expect(await resolveVisionModel(runtime({}), () => model)).toEqual({ model, slot: SLOT })
  })

  it('returns null when the kill switch is on, the slot is off or deterministic, or no model exists', async () => {
    expect(await resolveVisionModel(runtime({ killSwitch: true }), () => model)).toBeNull()
    expect(await resolveVisionModel(runtime({ slot: { ...SLOT, enabled: false } }), () => model)).toBeNull()
    expect(await resolveVisionModel(runtime({ slot: { ...SLOT, provider: 'deterministic' } }), () => model)).toBeNull()
    expect(await resolveVisionModel(runtime({}), () => null)).toBeNull()
  })

  it('returns null when the runtime config fails, so the deterministic read stands', async () => {
    expect(await resolveVisionModel(runtime({ failing: true }), () => model)).toBeNull()
  })
})

describe('isolateGrounding', () => {
  it('scrubs the household names and lets clean text through', () => {
    const result = isolateGrounding('Bruttoarbeitslohn Erika Musterfrau 54.320,00', ['Erika', 'Musterfrau'])
    expect(result.blocked).toBe(false)
    expect(result.text).not.toContain('Musterfrau')
    expect(result.text).toContain('54.320,00')
  })

  it('replaces identifiers before the firewall checks the text', () => {
    // The firewall (`checkPiiFree`) is the second line behind the scrubber: what the scrubber masks never reaches it.
    const result = isolateGrounding('Zeile 3 54.320,00 IBAN DE89 3704 0044 0532 0130 00 Steuer-ID 12 345 678 901', [])
    expect(result.blocked).toBe(false)
    expect(result.text).not.toMatch(/DE89|678 901/)
  })
})

describe('parseModelJson', () => {
  const schema = z.object({ amount: z.number().nullable().default(null) })

  it('reads the JSON object of a fenced or chatty reply and applies the schema defaults', () => {
    expect(parseModelJson('```json\n{"amount": 12}\n```', schema)).toEqual({ amount: 12 })
    expect(parseModelJson('Hier ist es: {} Danke.', schema)).toEqual({ amount: null })
  })

  it('throws on a reply without JSON or one that does not fit the schema', () => {
    expect(() => parseModelJson('keine Angabe', schema)).toThrow()
    expect(() => parseModelJson('{"amount": "zwölf"}', schema)).toThrow()
  })
})

describe('extractWithModel', () => {
  it('sends one isolated prompt with a timeout signal and validates the reply', async () => {
    const model = replying('{"amount": 7}')
    const prompt = { system: 'System', user: 'Text' }
    expect(await extractWithModel(model, prompt, z.object({ amount: z.number() }))).toEqual({ amount: 7 })
    expect(model.calls).toHaveLength(1)
    expect(model.calls[0]!.prompt).toEqual(prompt)
    expect(model.calls[0]!.options.signal).toBeInstanceOf(AbortSignal)
    expect(EXTRACTION_TIMEOUT_MS).toBe(20_000)
  })

  it('rejects when the model rejects', async () => {
    const failing: SingleShotModel = {
      async complete() {
        throw new Error('timeout')
      },
    }
    await expect(extractWithModel(failing, { system: '', user: '' }, z.object({}))).rejects.toThrow('timeout')
  })
})

describe('response pieces', () => {
  it('records the model slot as engine only when the model was used', () => {
    expect(stagingEngine(SLOT)).toEqual({ mode: 'langgraph', provider: 'anthropic', model: 'some-model' })
    expect(stagingEngine(null)).toBe(DETERMINISTIC_ENGINE)
  })

  it('treats everything but a PDF text layer as OCR', () => {
    expect(isFromOcr(dto({ textSource: 'pdf_text' }))).toBe(false)
    expect(isFromOcr(dto({ textSource: 'ocr' }))).toBe(true)
    expect(isFromOcr(dto())).toBe(true)
  })

  it('reports another year only when the document names one', () => {
    expect(yearConflictOf(2024, 2025)).toEqual({ documentYear: 2024, activeYear: 2025 })
    expect(yearConflictOf(2025, 2025)).toBeNull()
    expect(yearConflictOf(null, 2025)).toBeNull()
  })

  it('names a year the app does not keep only when drafts were wanted', () => {
    expect(noTaxYearReason(dto(), null)).toBe('kein_steuerjahr')
    expect(noTaxYearReason(dto({ stageDraft: false }), null)).toBeNull()
    expect(noTaxYearReason(dto(), 2025)).toBeNull()
  })

  it('takes the ids, the first action and the message of a staged batch', () => {
    const actions = [{ actionId: 'a1' }, { actionId: 'a2' }] as unknown as Parameters<typeof stagedDraftsOf>[0]['actions']
    const message = { id: 'm1' } as unknown as Parameters<typeof stagedDraftsOf>[0]['assistantMessage']
    expect(stagedDraftsOf({ actions, assistantMessage: message })).toEqual({ stagedActionIds: ['a1', 'a2'], stagedAction: actions[0], assistantMessage: message })
    expect(stagedDraftsOf({ actions: [], assistantMessage: null })).toEqual(NOTHING_STAGED)
  })
})
