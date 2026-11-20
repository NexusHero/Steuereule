import { z } from 'zod'
import { describeFieldForPrompt, fieldsOfScreen, PERSON_B_SCREENS, provenanceKey, SCREENS, type Provenance, type Screen } from '@steuereule/core'
import { DomainError } from '../../common/domain-error.js'
import { isAiWritable } from '../../confirmation/ai-write-policy.js'
import { checkStageValue, OWN_TOOL_SCREENS, validateStageTarget } from '../../ki/advisor-safety.js'
import { assertScope, json, refused, dataUserFor, type McpDeps, type McpSession } from '../mcp-session.js'

/**
 * The catalogue's hints are written for the in-app advisor and name its tools; the user's assistant has
 * none of them, so those references become what it should do instead.
 */
function forExternalAssistant(description: string): string {
  return description.replace('nur über `propose_two_paths` vorschlagen', 'dem Nutzer beide Wege zeigen und ihn entscheiden lassen')
}

const MAX_BATCH_FIELDS = 60

/** Entering values (unconfirmed, ADR-0052 §6/§7), describing the fields, and taking an own entry back. */
export function registerEntryTools(session: McpSession, deps: McpDeps): void {
  const { server, userId, assistant } = session

  const PERSON_HINT = 'Bei Zusammenveranlagung: A der Nutzer, B Ehegatte oder Ehegattin. Pflicht in den Masken lstb, chLohnausweis, commute, rente, profil, stammdaten, sobald es Person B gibt.'

  /**
   * One entry, with the same target and value checks as the in-app advisor (unknown field, never-writable
   * field, booking mask, catalogue value rules). The user's own assistant may write personal fields
   * (ADR-0052 §8). What is stored is the catalogue's tidied value ("50.000" → "50000") under the trimmed name.
   */
  async function writeField(entry: { taxYear: number; screen: Screen; instance?: string | undefined; field: string; value: string | null; receiptId?: string | undefined; person?: 'A' | 'B' | undefined }): Promise<{ ok: true; key: string; result: string } | { ok: false; error: string }> {
    const { taxYear, screen, instance, value, receiptId, person } = entry
    const target = validateStageTarget(screen, entry.field, true)
    if (!target.ok) return { ok: false, error: target.error.startsWith('USE_BOOKING_TOOL') ? 'USE_BOOKING_TOOL: Buchungen sind über diesen Zugang noch nicht möglich; der Nutzer bucht in der App.' : target.error }
    const field = entry.field.trim()
    let cleanValue: string | null = null
    if (value !== null) {
      const checked = checkStageValue(screen, field, value)
      if (!checked.ok) return { ok: false, error: checked.error }
      cleanValue = checked.value
    }
    const whose = await dataUserFor(deps.link, userId, taxYear, screen, field, person)
    if (!whose.ok) return whose
    const key = provenanceKey(screen, field, instance)
    const provenance: Provenance = receiptId !== undefined ? { kind: 'assistent', name: assistant.clientName, receiptId } : { kind: 'assistent', name: assistant.clientName }
    try {
      const result = await deps.confirmation.write(whose.dataUserId, taxYear, key, cleanValue, provenance)
      await deps.audit.append({ userId, action: 'WRITE', resource: 'maske_eintragen' })
      return { ok: true, key, result }
    } catch (error) {
      // A refusal of the mask itself (no such record, a value its own rules reject) is the assistant's to fix.
      if (error instanceof DomainError) return { ok: false, error: `${error.code}: ${error.message}` }
      throw error
    }
  }

  const hintFor = (result: string): string =>
    result === 'vorschlag'
      ? 'Der Nutzer hat diesen Wert bereits bestätigt. Die Eingabe wurde als Vorschlag hinterlegt.'
      : 'Der Wert wurde unbestätigt eingetragen und muss vom Nutzer in der App geprüft und bestätigt werden.'

  server.tool(
    'maske_eintragen',
    'Trägt einen Wert in eine Erfassungsmaske ein. Der Wert wird als unbestätigt markiert und muss vom Nutzer in der App bestätigt werden. Hat der Nutzer bereits einen Wert bestätigt, wird der neue Wert als Vorschlag hinterlegt. Für mehrere Felder einer Maske: maske_eintragen_stapel.',
    {
      taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)'),
      screen: z.enum(SCREENS).describe('Die Erfassungsmaske (z.B. lstb, interview, kind, vermietung)'),
      instance: z.string().optional().describe('Instanz-ID bei mehrfachen Objekten (z.B. Vermietungsobjekt oder Kind)'),
      field: z.string().describe('Der Feldbezeichner (z.B. bruttoarbeitslohn, mieteinnahmen)'),
      value: z.string().nullable().describe('Der einzutragende Wert als String, oder null'),
      receiptId: z.string().optional().describe('Optionale Beleg-ID als Herkunftsnachweis'),
      person: z.enum(['A', 'B']).optional().describe(PERSON_HINT),
    },
    async (entry) => {
      assertScope(assistant, 'steuerdaten:write')
      const written = await writeField(entry)
      if (!written.ok) return refused(written.error)
      return json({ schluessel: written.key, ...(entry.person === 'B' ? { person: 'B' } : {}), ergebnis: written.result, hinweis: hintFor(written.result) })
    },
  )

  server.tool(
    'maske_eintragen_stapel',
    `Trägt viele Felder einer Maske in einem Aufruf ein (höchstens ${MAX_BATCH_FIELDS}), mit denselben Regeln wie maske_eintragen. Das Ergebnis nennt je Feld „geschrieben“, „vorschlag“, „unveraendert“ oder den Grund der Ablehnung; ein abgelehntes Feld hält die übrigen nicht auf. Feldnamen und Formen vorher mit maske_felder nachsehen.`,
    {
      taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)'),
      screen: z.enum(SCREENS).describe('Die Erfassungsmaske'),
      instance: z.string().optional().describe('Instanz-ID bei mehrfachen Objekten (z.B. Kind)'),
      felder: z.record(z.string(), z.string().nullable()).describe('Feldbezeichner → Wert (String oder null zum Leeren)'),
      receiptId: z.string().optional().describe('Optionale Beleg-ID als Herkunftsnachweis für alle Felder'),
      person: z.enum(['A', 'B']).optional().describe(PERSON_HINT),
    },
    async ({ taxYear, screen, instance, felder, receiptId, person }) => {
      assertScope(assistant, 'steuerdaten:write')
      const entries = Object.entries(felder)
      if (entries.length === 0 || entries.length > MAX_BATCH_FIELDS) return refused(`INVALID_ARGUMENTS: 1 bis ${MAX_BATCH_FIELDS} Felder je Aufruf.`)
      const results: Record<string, { ergebnis: string } | { fehler: string }> = {}
      // In order, one after the other: a later field may depend on an earlier one (a gate before its amount).
      for (const [field, value] of entries) {
        const written = await writeField({ taxYear, screen, instance, field, value, receiptId, person })
        results[field] = written.ok ? { ergebnis: written.result } : { fehler: written.error }
      }
      const rejected = Object.values(results).filter((r) => 'fehler' in r).length
      return json({ screen, ...(person === 'B' ? { person: 'B' } : {}), geschrieben: entries.length - rejected, abgelehnt: rejected, felder: results, hinweis: 'Alles Eingetragene ist unbestätigt, bis der Nutzer es in der App bestätigt.' })
    },
  )

  // What each field of a mask means and what it takes: the catalogue's own descriptions, as the in-app advisor sees them.
  server.tool(
    'maske_felder',
    'Beschreibt die Felder einer Erfassungsmaske: Name, Form des Werts und was hineingehört. Vor dem ersten Eintrag in eine Maske aufrufen, statt Feldnamen zu raten. `je_person`: bei Zusammenveranlagung `person` mitgeben; `braucht_instance`: Datensatz-ID mitgeben (Kind: kinder_auflisten).',
    { screen: z.enum(SCREENS).describe('Die Erfassungsmaske (z.B. lstb, chLohnausweis, commute, kind, interview)') },
    async ({ screen }) => {
      assertScope(assistant, 'steuerdaten:read')
      await deps.audit.append({ userId, action: 'READ', resource: 'maske_felder' })
      if (OWN_TOOL_SCREENS.has(screen)) return json({ ok: false, error: 'Buchungen sind über diesen Zugang noch nicht möglich; der Nutzer bucht in der App.' })
      const specs = fieldsOfScreen(screen).filter((spec) => isAiWritable(screen, spec.field, true))
      return json({
        screen,
        braucht_instance: specs.some((spec) => spec.perInstance),
        je_person: PERSON_B_SCREENS.has(screen),
        felder: specs.map((spec) => ({ feld: spec.field, beschreibung: forExternalAssistant(describeFieldForPrompt(spec)) })),
      })
    },
  )

  // Taking back an entry the assistant made by mistake: only its own, only while the user has not confirmed it.
  server.tool(
    'eintrag_zuruecknehmen',
    'Nimmt einen eigenen Eintrag zurück, den du als falsch erkannt hast: Ein unbestätigter Wert, den du eingetragen hast, wird geleert; ein Vorschlag von dir auf einem bestätigten Wert wird verworfen. Werte des Nutzers oder anderer Assistenten bleiben. Danach bei Bedarf richtig neu eintragen.',
    {
      taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)'),
      screen: z.enum(SCREENS).describe('Die Erfassungsmaske'),
      instance: z.string().optional().describe('Instanz-ID bei mehrfachen Objekten'),
      field: z.string().describe('Der Feldbezeichner'),
      person: z.enum(['A', 'B']).optional().describe('Wie bei maske_eintragen'),
    },
    async ({ taxYear, screen, instance, field, person }) => {
      assertScope(assistant, 'steuerdaten:write')
      const whose = await dataUserFor(deps.link, userId, taxYear, screen, field.trim(), person)
      if (!whose.ok) return refused(whose.error)
      const key = provenanceKey(screen, field.trim(), instance)
      try {
        const ergebnis = await deps.confirmation.withdrawAssistantEntry(whose.dataUserId, taxYear, key, assistant.clientName)
        await deps.audit.append({ userId, action: 'WRITE', resource: 'eintrag_zuruecknehmen' })
        return json({ ok: true, schluessel: key, ergebnis })
      } catch (error) {
        const code = (error as { code?: string }).code ?? 'ERROR'
        return refused(`${code}: ${error instanceof Error ? error.message : ''}`)
      }
    },
  )
}
