import { scrubDocumentTextPii, type AdvisorEngineInfo } from '@steuereule/core'
import type { z } from 'zod'
import type { AiRuntimeConfigService, ResolvedAiSlotConfig } from '../../ki/ai-runtime-config.service.js'
import { checkPiiFree } from '../../ki/ki.adapter.js'
import { extractJsonObject } from '../../ki/llm-json.js'
import type { SingleShotModel, SingleShotModelFactory, SingleShotPrompt } from '../../ki/single-shot-model.js'
import type { ParseReceiptDto, ParseReceiptResponseDto } from '../dto/parse-receipt.dto.js'

/**
 * The steps the document parse strategies share: finding the model, isolating its input, asking it for
 * one JSON object, and the small pieces every response repeats. Each strategy composes them in its own
 * order; nothing here knows a document kind.
 */

/** How long one isolated extraction call may take before the deterministic read stands. */
export const EXTRACTION_TIMEOUT_MS = 20_000

/** Said under the drafts when the text came from a photo or scan (ADR-0060). */
export const SCAN_CHECK_NOTE = 'Der Text stammt aus einem Scan; prüfe die Beträge, bevor du sie übernimmst.'

export const DETERMINISTIC_ENGINE: AdvisorEngineInfo = { mode: 'deterministic_fallback', provider: 'deterministic' }

/** The model of the `vision_ocr` slot and the slot it came from. */
export interface VisionModel {
  readonly model: SingleShotModel
  readonly slot: ResolvedAiSlotConfig
}

/**
 * The model for document extraction, or null: kill switch on, slot off or deterministic, no model for the
 * slot, or the runtime config unavailable. Null means the deterministic read stands.
 */
export async function resolveVisionModel(runtimeConfig: AiRuntimeConfigService, resolveModel: SingleShotModelFactory): Promise<VisionModel | null> {
  try {
    if (await runtimeConfig.isKillSwitchActive()) return null
    const slot = await runtimeConfig.resolveSlot('vision_ocr')
    if (!slot.enabled || slot.provider === 'deterministic') return null
    const model = resolveModel(slot)
    return model ? { model, slot } : null
  } catch {
    return null
  }
}

/**
 * The text that may leave the server: scrubbed of the household's names and identifiers, then checked.
 * `blocked` when an identifier survived the scrubber; the text must then not be sent.
 */
export function isolateGrounding(text: string, knownNames: readonly string[]): { readonly text: string; readonly blocked: boolean } {
  const grounding = scrubDocumentTextPii(text, [...knownNames])
  try {
    checkPiiFree({ text: grounding })
    return { text: grounding, blocked: false }
  } catch {
    return { text: grounding, blocked: true }
  }
}

/** Validates a model reply: the one JSON object in it, parsed by the schema. Throws when either fails. */
export function parseModelJson<S extends z.ZodTypeAny>(answer: string, schema: S): z.infer<S> {
  return schema.parse(extractJsonObject(answer)) as z.infer<S>
}

/**
 * One isolated extraction call through the `SingleShotModel` port, validated by the schema. Throws on a
 * timeout, a refusal or a reply that does not fit; the caller keeps its deterministic read then.
 */
export async function extractWithModel<S extends z.ZodTypeAny>(model: SingleShotModel, prompt: SingleShotPrompt, schema: S): Promise<z.infer<S>> {
  const answer = await model.complete(prompt, { signal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS) })
  return parseModelJson(answer, schema)
}

/** The engine a draft records: the model's slot when the model's reading was used, the rule otherwise. */
export function stagingEngine(slot: ResolvedAiSlotConfig | null): AdvisorEngineInfo {
  return slot ? { mode: 'langgraph', provider: slot.provider, model: slot.model } : DETERMINISTIC_ENGINE
}

/** Only a PDF text layer is read as is; anything else came through OCR. */
export function isFromOcr(dto: ParseReceiptDto): boolean {
  return dto.textSource !== 'pdf_text'
}

/** Set when the document is for another year than the one the user is working on. */
export function yearConflictOf(documentYear: number | null, activeYear: number): { documentYear: number; activeYear: number } | null {
  return documentYear !== null && documentYear !== activeYear ? { documentYear, activeYear } : null
}

/** A document of a year the app does not keep: said so, when the read was meant to stage drafts. */
export function noTaxYearReason(dto: ParseReceiptDto, filingYear: number | null): 'kein_steuerjahr' | null {
  return (dto.stageDraft ?? true) && filingYear === null ? 'kein_steuerjahr' : null
}

/** What a batch of drafts left for the response. */
export interface StagedDrafts {
  readonly stagedActionIds: string[]
  readonly stagedAction: ParseReceiptResponseDto['stagedAction']
  readonly assistantMessage: ParseReceiptResponseDto['assistantMessage']
}

export const NOTHING_STAGED: StagedDrafts = { stagedActionIds: [], stagedAction: null, assistantMessage: null }

export function stagedDraftsOf(staged: {
  readonly actions: readonly NonNullable<ParseReceiptResponseDto['stagedAction']>[]
  readonly assistantMessage: ParseReceiptResponseDto['assistantMessage']
}): StagedDrafts {
  return { stagedActionIds: staged.actions.map((a) => a.actionId), stagedAction: staged.actions[0] ?? null, assistantMessage: staged.assistantMessage }
}
