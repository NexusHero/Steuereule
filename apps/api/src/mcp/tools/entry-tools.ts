import { Logger } from '@nestjs/common'
import { describeFieldForPrompt, fieldsOfScreen, PERSON_B_SCREENS, provenanceKey, type Provenance, type Screen } from '@steuereule/core'
import { z } from 'zod'
import { DomainError } from '../../common/domain-error.js'
import { isAiWritable } from '../../confirmation/ai-write-policy.js'
import { checkStageValue, OWN_TOOL_SCREENS, validateStageTarget } from '../../ki/advisor-safety.js'
import { dataUserFor, isOwnProvenance, isOwnReceipt, provenanceOf, type McpDeps, type McpSession } from '../mcp-session.js'
import { boundedRecord, fieldArg, instanceArg, MAX_FIELD_LENGTH, personArg, receiptIdArg, screenArg, taxYearArg, valueArg } from '../tool-args.js'
import { json, reasonOfError, refused } from '../tool-results.js'

/**
 * The catalogue's hints are written for the in-app advisor and name its tools; the user's assistant has
 * none of them, so those references become what it should do instead (also for feld_finden, H2-25).
 */
export function forExternalAssistant(description: string): string {
  return description.replace('nur über `propose_two_paths` vorschlagen', 'dem Nutzer beide Wege zeigen und ihn entscheiden lassen')
}

const MAX_BATCH_FIELDS = 60

/** Fields only the user enters, even through their own assistant. */
export const isUserOnly = (screen: Screen, field: string): boolean => screen === 'stammdaten' && field.trim() === 'religion'

const logger = new Logger('McpEntryTools')

/** Entering values (unconfirmed, ADR-0052 §6/§7), describing the fields, and taking an own entry back. */
export function registerEntryTools(session: McpSession, deps: McpDeps): void {
  const { server, userId, assistant } = session

  // A booking is no field value: it goes its own way as a draft the user takes in the app (#549).
  const bookingRefusal = deps.business
    ? 'USE_BOOKING_TOOL: Eine Buchung ist kein Feldwert. Lege sie mit buchung_entwerfen als Entwurf an; der Nutzer übernimmt sie in der App.'
    : 'USE_BOOKING_TOOL: Buchungen sind über diesen Zugang noch nicht möglich; der Nutzer bucht in der App.'

  const NO_SUCH_RECEIPT = 'RECEIPT_NOT_FOUND: Diesen Beleg gibt es in diesem Konto nicht. Gib als receiptId eine belegId aus belege_auflisten oder beleg_hochladen an, oder lass sie weg.'

  /**
   * One entry, with the same target and value checks as the in-app advisor (unknown field, never-writable
   * field, booking mask, catalogue value rules). The user's own assistant may write personal fields
   * (ADR-0052 §8). What is stored is the catalogue's tidied value ("50.000" → "50000") under the trimmed name.
   */
  async function writeField(entry: { taxYear: number; screen: Screen; instance?: string | undefined; field: string; value: string | null; receiptId?: string | undefined; person?: 'A' | 'B' | undefined }): Promise<{ ok: true; key: string; result: string } | { ok: false; error: string }> {
    const { taxYear, screen, instance, value, receiptId, person } = entry
    // Art. 9 DSGVO: the confession is the user's to enter, with the consent in the app (amendment 3, 7).
    if (isUserOnly(screen, entry.field)) return { ok: false, error: 'USER_ONLY: Die Konfession trägt der Nutzer selbst in der App ein. Trage stattdessen stammdaten.kirchensteuerpflichtig („true“ oder „false“) ein.' }
    const target = validateStageTarget(screen, entry.field, true)
    if (!target.ok) return { ok: false, error: target.error.startsWith('USE_BOOKING_TOOL') ? bookingRefusal : target.error }
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
    const provenance: Provenance = provenanceOf(assistant, receiptId)
    try {
      const result = await deps.confirmation.write(whose.dataUserId, taxYear, key, cleanValue, provenance)
      return { ok: true, key, result }
    } catch (error) {
      // A refusal of the mask itself (no such record, a value its own rules reject) is the assistant's to fix;
      // anything else is named without its inside, and in a batch the other fields still go in (MCP-7).
      if (error instanceof DomainError) return { ok: false, error: `${error.code}: ${error.message}` }
      return { ok: false, error: reasonOfError(error, (message) => logger.error(`maske_eintragen: ${message}`)) }
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
      taxYear: taxYearArg(),
      screen: screenArg('Die Erfassungsmaske (z.B. lstb, interview, kind, vermietung); ihre Felder nennt maske_felder'),
      instance: instanceArg('Datensatz-ID bei Masken mit mehreren Datensätzen (Kind: kinder_auflisten, Vermietung: vermietungen_auflisten)').optional(),
      field: fieldArg('Der Feldbezeichner (z.B. bruttoarbeitslohn, mieteinnahmen), wie maske_felder ihn nennt'),
      value: valueArg('Der einzutragende Wert als String in der Form, die maske_felder nennt, oder null zum Leeren').nullable(),
      receiptId: receiptIdArg().optional(),
      person: personArg().optional(),
    },
    async (entry) => {
      if (!(await isOwnReceipt(deps, userId, entry.receiptId))) return refused(NO_SUCH_RECEIPT)
      const written = await writeField(entry)
      if (!written.ok) return refused(written.error)
      return json({ schluessel: written.key, ...(entry.person === 'B' ? { person: 'B' } : {}), ergebnis: written.result, hinweis: hintFor(written.result) })
    },
  )

  server.tool(
    'maske_eintragen_stapel',
    `Trägt viele Felder einer Maske in einem Aufruf ein (höchstens ${MAX_BATCH_FIELDS}), mit denselben Regeln wie maske_eintragen. Das Ergebnis nennt je Feld „geschrieben“, „vorschlag“ (der Nutzer hat dort schon einen Wert; deiner wartet auf seine Entscheidung und zählt bis dahin nicht), „unveraendert“ oder den Grund der Ablehnung; ein abgelehntes Feld hält die übrigen nicht auf. Feldnamen und Formen vorher mit maske_felder nachsehen.`,
    {
      taxYear: taxYearArg(),
      screen: screenArg(),
      instance: instanceArg('Datensatz-ID bei Masken mit mehreren Datensätzen (z.B. Kind)').optional(),
      felder: boundedRecord(z.string().max(MAX_FIELD_LENGTH), valueArg('Wert oder null').nullable(), MAX_BATCH_FIELDS).describe(`Feldbezeichner → Wert (String oder null zum Leeren), 1 bis ${MAX_BATCH_FIELDS} Felder`),
      receiptId: receiptIdArg().optional(),
      person: personArg().optional(),
    },
    async ({ taxYear, screen, instance, felder, receiptId, person }) => {
      const entries = Object.entries(felder)
      if (entries.length === 0 || entries.length > MAX_BATCH_FIELDS) return refused(`INVALID_ARGUMENTS: 1 bis ${MAX_BATCH_FIELDS} Felder je Aufruf.`)
      if (!(await isOwnReceipt(deps, userId, receiptId))) return refused(NO_SUCH_RECEIPT)
      const results: Record<string, { ergebnis: string } | { fehler: string }> = {}
      // In order, one after the other: a later field may depend on an earlier one (a gate before its amount).
      for (const [field, value] of entries) {
        const written = await writeField({ taxYear, screen, instance, field, value, receiptId, person })
        results[field] = written.ok ? { ergebnis: written.result } : { fehler: written.error }
      }
      const count = (outcome: string) => Object.values(results).filter((r) => 'ergebnis' in r && r.ergebnis === outcome).length
      const rejected = Object.values(results).filter((r) => 'fehler' in r).length
      return json({ screen, ...(person === 'B' ? { person: 'B' } : {}), geschrieben: count('geschrieben'), vorschlaege: count('vorschlag'), unveraendert: count('unveraendert'), abgelehnt: rejected, felder: results, hinweis: 'Alles Eingetragene ist unbestätigt, bis der Nutzer es in der App bestätigt.' })
    },
  )

  // What each field of a mask means and what it takes: the catalogue's own descriptions, as the in-app advisor sees them.
  server.tool(
    'maske_felder',
    'Beschreibt die Felder einer Erfassungsmaske: Name, Form des Werts und was hineingehört. Vor dem ersten Eintrag in eine Maske aufrufen, statt Feldnamen zu raten. `je_person`: bei Zusammenveranlagung `person` mitgeben; `braucht_instance`: Datensatz-ID mitgeben (Kind: kinder_auflisten).',
    { screen: screenArg('Die Erfassungsmaske (z.B. lstb, chLohnausweis, commute, kind, interview)') },
    async ({ screen }) => {
      if (OWN_TOOL_SCREENS.has(screen)) return refused(bookingRefusal)
      const specs = fieldsOfScreen(screen).filter((spec) => isAiWritable(screen, spec.field, true) && !isUserOnly(screen, spec.field))
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
    'Nimmt einen eigenen Eintrag zurück, den du als falsch erkannt hast: Ein unbestätigter Wert, den du eingetragen hast, wird geleert; ein Vorschlag von dir auf einem bestätigten Wert wird verworfen; ein eigener offener Buchungsentwurf (Maske "buchung", Feld "entry", instance = Entwurf) wird verworfen. Werte des Nutzers oder anderer Assistenten bleiben. Danach bei Bedarf richtig neu eintragen.',
    {
      taxYear: taxYearArg(),
      screen: screenArg(),
      instance: instanceArg('Datensatz-ID bei Masken mit mehreren Datensätzen; bei einer Buchung die Entwurfs-ID').optional(),
      field: fieldArg(),
      person: personArg('Wie bei maske_eintragen').optional(),
    },
    async ({ taxYear, screen, instance, field, person }) => {
      const whose = await dataUserFor(deps.link, userId, taxYear, screen, field.trim(), person)
      if (!whose.ok) return refused(whose.error)
      const key = provenanceKey(screen, field.trim(), instance)
      const ergebnis = await deps.confirmation.withdrawAssistantEntry(whose.dataUserId, taxYear, key, (p) => isOwnProvenance(p, assistant))
      return json({ ok: true, schluessel: key, ergebnis })
    },
  )
}
