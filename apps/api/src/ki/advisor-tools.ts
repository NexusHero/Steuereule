// The tools the owl may call: their names, argument schemas and descriptions as the model sees
// them, and the small rules around drafts (what counts as the same draft, what a refusal leaves behind).
import { ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import { ADVISOR_PLAN_MAX_STEPS, ADVISOR_PLAN_STEP_STATUSES, type AdvisorActionProposal, type AdvisorNotStaged, type Screen } from '@steuereule/core'

export const MAX_COMPANION_FIELDS = 3

export const TOOL_LABELS: Readonly<Record<string, string>> = {
  simulate_tax_delta: 'Simuliere Vorher/Nachher-Steuerwirkung …',
  stage_field_draft: 'Bereite sicheren Entwurf vor …',
  propose_two_paths: 'Vergleiche Zwei-Wege-Strategien …',
  ask_clarification: 'Prüfe Rückfragen …',
  ask_questions: 'Bereite die nächsten Fragen vor …',
  lookup_legal_source: 'Prüfe EStG-Paragraph …',
  plan_steps: 'Plane die nächsten Schritte …',
  remember_note: 'Merke mir das für dieses Steuerjahr …',
  replace_note: 'Aktualisiere eine Notiz …',
  forget_note: 'Entferne eine überholte Notiz …',
}

export interface RejectedDraft {
  readonly label: string
  readonly screen: string
  readonly reason: string
  /** Set when the user can do it by hand in that mask (a record that has to be created first). */
  readonly openScreen?: Screen | undefined
}

/** More drafts in one answer than anyone can review are a sign the model is looping. */
export const MAX_DRAFTS_PER_TURN = 8

export const draftKey = (draft: Pick<AdvisorActionProposal, 'screen' | 'field' | 'instance'>): string => `${draft.screen}|${draft.instance ?? ''}|${draft.field}`

export const FIGURE_KEYS = new Set(['beforeRefundEur', 'afterRefundEur', 'deltaEur'])

/** Every euro figure a tool reported in this turn, wherever it sits in the tool's answer. */
export function computedFiguresOf(messages: readonly BaseMessage[]): number[] {
  const figures: number[] = []
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk)
    if (value === null || typeof value !== 'object') return
    for (const [key, entry] of Object.entries(value)) {
      if (FIGURE_KEYS.has(key) && typeof entry === 'number') figures.push(entry)
      else walk(entry)
    }
  }
  for (const message of messages) {
    if (!(message instanceof ToolMessage) || typeof message.content !== 'string') continue
    try {
      walk(JSON.parse(message.content))
    } catch {
      // a tool answer that is not JSON carries no figures
    }
  }
  return figures
}

/** The reason of a tool error without its machine prefix (`UNKNOWN_FIELD: …`). */
export const humanReason = (error: string): string => error.replace(/^[A-Z_]+:\s*/, '')

/**
 * What the answer has to admit: a refused draft the model did not manage to replace. A refusal
 * counts as resolved when a later draft has the same label or went to the same screen, because
 * that is what a corrected retry looks like.
 */
export function unresolvedRejections(rejected: readonly RejectedDraft[], staged: readonly AdvisorActionProposal[]): AdvisorNotStaged[] {
  const seen = new Set<string>()
  const open: AdvisorNotStaged[] = []
  for (const draft of rejected) {
    if (staged.some((action) => action.label === draft.label || action.screen === draft.screen)) continue
    if (seen.has(draft.label)) continue
    seen.add(draft.label)
    open.push({ label: draft.label, reason: draft.reason, ...(draft.openScreen ? { screen: draft.openScreen } : {}) })
  }
  return open
}

export const draftTargetSchema = z.object({
  screen: z.string().max(40),
  field: z.string().max(100),
  newValue: z.string().max(200),
  label: z.string().max(160),
  reason: z.string().max(400).default(''),
  instance: z.string().max(80).nullable().optional(),
})

/** One schema per tool: the model sees it via bindTools, and toolsNode parses every call with it. */
export const TOOL_ARG_SCHEMAS = {
  simulate_tax_delta: z.object({
    screen: z.string().max(40),
    field: z.string().max(100),
    newValue: z.string().max(200),
  }),
  stage_field_draft: draftTargetSchema.extend({
    sourceId: z.string().max(40).default('estg-9-1'),
    companionFields: z.record(z.string().max(100), z.string().max(200)).optional(),
  }),
  propose_two_paths: z.object({
    title: z.string().max(160),
    sourceId: z.string().max(40).default('estg-4-5-6c'),
    safePath: draftTargetSchema,
    maxPath: draftTargetSchema.extend({ evidenceHint: z.string().max(260).default('Bitte entsprechenden Nachweis aufbewahren.') }),
  }),
  ask_clarification: z.object({
    choices: z.array(z.string().max(120)).min(1).max(4),
  }),
  ask_questions: z.object({
    questions: z
      .array(
        z.object({
          text: z.string().min(1).max(240),
          options: z.array(z.string().min(1).max(80)).min(2).max(4),
          recommended: z.string().max(80).optional(),
        }),
      )
      .min(1)
      .max(4),
  }),
  lookup_legal_source: z.object({
    sourceId: z.string().max(40),
  }),
  plan_steps: z.object({
    steps: z
      .array(z.object({ text: z.string().min(1).max(120), status: z.enum(ADVISOR_PLAN_STEP_STATUSES) }))
      .min(1)
      .max(ADVISOR_PLAN_MAX_STEPS),
  }),
  remember_note: z.object({ text: z.string().min(1).max(400) }),
  replace_note: z.object({ note: z.string().min(1).max(60), text: z.string().min(1).max(400) }),
  forget_note: z.object({ note: z.string().min(1).max(60) }),
} as const

export type ToolName = keyof typeof TOOL_ARG_SCHEMAS

export const TOOL_DESCRIPTIONS: Readonly<Record<ToolName, string>> = {
  simulate_tax_delta:
    'Simuliert deterministisch die exakte Vorher/Nachher-Erstattungswirkung eines Feldes ohne etwas in der Datenbank zu ändern.',
  stage_field_draft:
    'Erstellt einen unverbindlichen Feld-Entwurf (Status pending) zur Prüfung und Freigabe im Eulen-Modus. Rechnet das Steuerdelta deterministisch aus.',
  propose_two_paths:
    'Stellt zwei Alternativen (Sicher-Weg vs. Maximal-Weg mit Nachweishinweis) zur Auswahl durch den Nutzer gegenüber.',
  ask_clarification: 'Schlägt 2 bis 4 anklickbare Quick-Chips als nächste Rückfragen im Chat vor.',
  ask_questions:
    'Stellt dem Nutzer eine Runde von 1 bis 4 Fragen, jede mit 2 bis 4 antippbaren Antworten und deiner Empfehlung. Nur im Skill „Berater-Interview“ verwenden. Schreibt nichts in die Akte.',
  lookup_legal_source: 'Ruft Wortlaut, Paragraph und Rechtsstand einer EStG/AO-Rechtsquelle aus dem verifizierten Katalog ab.',
  plan_steps:
    'Zeigt dem Nutzer deinen Plan als Checkliste (höchstens 8 Schritte, Status offen/laeuft/erledigt). Immer die vollständige Liste senden. Schreibt nichts in die Akte.',
  remember_note:
    'Hält eine Projektnotiz für dieses Steuerjahr fest: eine Entscheidung oder ein Umstand aus dem Gespräch, der in keinem Feld der Erklärung steht. Ein Satz, höchstens 200 Zeichen, ohne persönliche Daten. Gilt danach in jedem Gespräch.',
  replace_note: 'Ersetzt den Text einer vorhandenen Projektnotiz (Angabe wie „Notiz 2“), wenn sie überholt oder korrigiert ist.',
  forget_note: 'Entfernt eine vorhandene Projektnotiz (Angabe wie „Notiz 2“), wenn sie nicht mehr gilt.',
}

/** JSON Schema keywords at least one provider's function-calling API rejects outright. */
export const UNSUPPORTED_SCHEMA_KEYWORDS: ReadonlySet<string> = new Set(['$schema', 'propertyNames'])

/**
 * The tool schema as the model gets to see it. Gemini answers 400 to `propertyNames` (which every
 * `z.record` produces), and a rejected schema silently sent every turn to the deterministic
 * fallback. Nothing is lost by leaving such keywords out here: toolsNode validates every call
 * against the full Zod schema anyway.
 */
export function toProviderToolSchema(schema: z.ZodType): Record<string, unknown> {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip)
    if (node === null || typeof node !== 'object') return node
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>)
        .filter(([key]) => !UNSUPPORTED_SCHEMA_KEYWORDS.has(key))
        .map(([key, value]) => [key, strip(value)]),
    )
  }
  return strip(z.toJSONSchema(schema)) as Record<string, unknown>
}

// The bodies are never invoked: toolsNode executes the calls itself so it can update graph state.
export function buildToolSchemas(): readonly StructuredToolInterface[] {
  return (Object.keys(TOOL_ARG_SCHEMAS) as ToolName[]).map((name) =>
    tool(async () => '', { name, description: TOOL_DESCRIPTIONS[name], schema: toProviderToolSchema(TOOL_ARG_SCHEMAS[name]) }),
  )
}

export function isToolName(name: string): name is ToolName {
  return Object.hasOwn(TOOL_ARG_SCHEMAS, name)
}

export function toolResult(callId: string, name: string, payload: Record<string, unknown>): ToolMessage {
  return new ToolMessage({ tool_call_id: callId, name, content: JSON.stringify(payload) })
}
