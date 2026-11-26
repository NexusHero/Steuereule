import { z } from 'zod'
import { decomposeProvenanceKey, fieldsOfScreen, PERSON_B_INTERVIEW_FIELDS, PERSON_B_SCREENS, provenanceKey, type FieldSpec, type Provenance, type Screen } from '@steuereule/core'
import { OWN_TOOL_SCREENS } from '../../ki/advisor-safety.js'
import { isOwnProvenance, type AssistantSessionInfo, type McpDeps, type McpSession } from '../mcp-session.js'
import { instanceArg, personArg, screenArg, taxYearArg } from '../tool-args.js'
import { json, refused } from '../tool-results.js'
import { ageAtYearEnd, churchTaxLiableFrom, readView, stateOfPostalCode } from '../read-view.js'

/** Where a value came from, as a kind; another assistant's name stays out (ADR-0052 amendment 3). */
function sourceOf(provenance: Provenance | undefined, assistant: AssistantSessionInfo): string {
  if (provenance === undefined || provenance.kind === 'nutzer') return 'nutzer'
  if (provenance.kind === 'assistent') return isOwnProvenance(provenance, assistant) ? 'du' : 'anderer-assistent'
  return provenance.kind === 'uebernahme' ? 'jahresuebernahme' : 'beleg'
}

/**
 * Reading back what is in the return (ADR-0052 amendment 3): amounts in plain, people only derived
 * (age, Bundesland, liable to church tax or not), third parties and free text only as "set".
 */
export function registerReadTools(session: McpSession, deps: McpDeps): void {
  const { server, userId, assistant } = session

  /** Whose record is read: Person B only where the user records her figures, and only her own masks. */
  async function readerFor(taxYear: number, screen: Screen, person: 'A' | 'B' | undefined): Promise<{ ok: true; dataUserId: string; specs: readonly FieldSpec[] } | { ok: false; error: string }> {
    const specs = fieldsOfScreen(screen)
    if (person !== 'B') return { ok: true, dataUserId: userId, specs }
    const spouse = await deps.link?.spouseForAdvisor(userId, taxYear)
    if (!spouse) return { ok: false, error: 'NO_PERSON_B: Es gibt für dieses Steuerjahr keine Zusammenveranlagung mit Person B.' }
    if (!spouse.recordable) return { ok: false, error: 'PERSON_B_OWNS_DATA: Person B pflegt ihre Angaben im eigenen Konto.' }
    if (screen === 'interview') return { ok: true, dataUserId: spouse.spouseUserId, specs: specs.filter((spec) => PERSON_B_INTERVIEW_FIELDS.has(spec.field)) }
    if (!PERSON_B_SCREENS.has(screen)) return { ok: false, error: 'JOINT_SCREEN: Diese Maske gehört zur gemeinsamen Erklärung; ohne `person` lesen.' }
    return { ok: true, dataUserId: spouse.spouseUserId, specs }
  }

  server.tool(
    'maske_lesen',
    'Liest die eingetragenen Werte einer Maske zurück, je Feld mit Stand (bestaetigt, unbestaetigt, vorschlag-offen, leer) und Herkunft (nutzer, du, anderer-assistent, jahresuebernahme, beleg). Beträge und Auswahlwerte im Klartext; Persönliches nur abgeleitet (Alter, Bundesland, kirchensteuerpflichtig) oder als „gesetzt“. Nutze es, um eigene Einträge zu prüfen, bevor du den Nutzer bestätigen lässt.',
    {
      taxYear: taxYearArg(),
      screen: screenArg(),
      instance: instanceArg('Datensatz-ID bei Masken mit mehreren Datensätzen (Kind: kinder_auflisten, Vermietung: vermietungen_auflisten)').optional(),
      person: personArg('B für die Angaben von Ehegatte oder Ehegattin, die der Nutzer führt; sonst A').optional(),
      nurGefuellte: z.boolean().optional().describe('true: leere Felder weglassen'),
    },
    async ({ taxYear, screen, instance, person, nurGefuellte }) => {
      if (OWN_TOOL_SCREENS.has(screen)) return refused('USE_BOOKING_TOOL: Buchungen liest du mit buchungsentwuerfe_auflisten (nur deine offenen Entwürfe); gebuchte Buchungen sind über diesen Zugang nicht lesbar.')
      const reader = await readerFor(taxYear, screen, person)
      if (!reader.ok) return refused(reader.error)
      if (reader.specs.some((spec) => spec.perInstance) && instance === undefined) return refused('RECORD_REQUIRED: Diese Maske braucht `instance` (z. B. aus kinder_auflisten).')

      const keys = reader.specs.map((spec) => provenanceKey(screen, spec.field, instance))
      const [values, markings] = await Promise.all([deps.confirmation.readRawValues(reader.dataUserId, taxYear, keys), deps.confirmation.list(reader.dataUserId, taxYear)])
      const felder = reader.specs.flatMap((spec, index) => {
        const key = keys[index]!
        const raw = values[key] ?? null
        const marking = markings.find((m) => m.key === key)
        const empty = raw === null || raw === ''
        if (empty && !marking?.proposal && nurGefuellte === true) return []
        const stand = marking?.proposal ? 'vorschlag-offen' : empty ? 'leer' : marking && !marking.confirmed ? 'unbestaetigt' : 'bestaetigt'
        return [
          {
            feld: spec.field,
            ...readView(spec, raw, taxYear),
            stand,
            ...(empty ? {} : { herkunft: sourceOf(marking?.provenance, assistant) }),
            ...(marking?.proposal ? { vorschlag: { ...readView(spec, marking.proposal.value, taxYear), herkunft: sourceOf(marking.proposal.provenance, assistant) } } : {}),
          },
        ]
      })
      return json({ screen, ...(person === 'B' ? { person: 'B' } : {}), ...(instance !== undefined ? { instance } : {}), felder })
    },
  )

  server.tool(
    'haushalt_ueberblick',
    'Der Haushalt auf einen Blick, ohne Namen und Kennungen: Veranlagung, je Person Alter am Jahresende, Bundesland, Familienstand, Berufsgruppe, Kirchensteuerpflicht und in welchem Land sie Lohn bezieht; Kinder als Nummer und Alter mit ihrer `instance`; Bearbeitungsstand. Nach steuerjahre_auflisten aufrufen, um den Fall einzuordnen.',
    { taxYear: taxYearArg() },
    async ({ taxYear }) => {

      const person = async (dataUserId: string, label: 'A' | 'B') => {
        const v = await deps.confirmation.readRawValues(dataUserId, taxYear, ['stammdaten.geburtsdatum', 'stammdaten.plz', 'stammdaten.familienstand', 'stammdaten.religion', 'stammdaten.kirchensteuerpflichtig', 'interview.beruf', 'lstb.bruttoarbeitslohn', 'chLohnausweis.bruttolohn-total'])
        const liable = v['stammdaten.kirchensteuerpflichtig']
        return {
          person: label,
          alterJahre: ageAtYearEnd(v['stammdaten.geburtsdatum'], taxYear),
          bundesland: stateOfPostalCode(v['stammdaten.plz']),
          familienstand: v['stammdaten.familienstand'] ?? null,
          berufsgruppe: v['interview.beruf'] ?? null,
          // The user's confession wins over the yes/no the assistant may set (amendment 3, 7).
          kirchensteuerpflichtig: churchTaxLiableFrom(v['stammdaten.religion']) ?? (liable === 'true' ? true : liable === 'false' ? false : null),
          lohnAus: [...(v['lstb.bruttoarbeitslohn'] ? ['Deutschland'] : []), ...(v['chLohnausweis.bruttolohn-total'] ? ['Schweiz'] : [])],
        }
      }
      const [summary, spouse, filing, kinder] = await Promise.all([
        deps.cockpit.getSummary(userId, taxYear),
        deps.link?.spouseForAdvisor(userId, taxYear),
        deps.confirmation.readRawValues(userId, taxYear, ['kopplung.filingType']),
        deps.children?.list(userId, taxYear),
      ])
      return json({
        taxYear,
        status: summary?.status ?? null,
        veranlagung: filing['kopplung.filingType'] ?? (spouse ? 'zusammen' : 'einzel'),
        personen: [
          await person(userId, 'A'),
          ...(spouse ? [spouse.recordable ? { ...(await person(spouse.spouseUserId, 'B')), angaben: 'führt der Nutzer' } : { person: 'B', angaben: 'eigenes Konto, hier nicht lesbar' }] : []),
        ],
        kinder: (kinder?.kinder ?? []).map((k) => ({ instance: k.id, nummer: k.sequenceNumber, alterJahre: ageAtYearEnd(k.geburtsdatum, taxYear) })),
      })
    },
  )

  server.tool(
    'belege_auflisten',
    'Listet die Belege im Posteingang ohne Dateinamen: belegId, Art, Jahr, Belegdatum, ob eine Datei dazu gespeichert ist (`hatDatei`) und die Felder, deren Herkunft der Beleg ist. Die belegId gibst du bei maske_eintragen als receiptId mit.',
    { taxYear: taxYearArg() },
    async ({ taxYear }) => {
      const [receipts, markings] = await Promise.all([deps.receipts.list(userId), deps.confirmation.list(userId, taxYear)])
      const fieldsOf = (receiptId: string) =>
        markings.filter((m) => 'receiptId' in m.provenance && m.provenance.receiptId === receiptId).map((m) => {
          const { screen, field } = decomposeProvenanceKey(m.key)
          return `${screen}.${field}`
        })
      return json({
        belege: receipts
          .filter((r) => r.assignment.taxYear === undefined || r.assignment.taxYear === taxYear)
          .map((r) => ({ belegId: r.id, art: r.kind, steuerjahr: r.assignment.taxYear ?? null, belegdatum: r.belegdatum, hatDatei: r.hasFile, felder: fieldsOf(r.id) })),
      })
    },
  )
}
