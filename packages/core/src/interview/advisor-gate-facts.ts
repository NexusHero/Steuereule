// Gate answers a draft depends on. The estimate and the printout count an amount behind a yes/no
// question (household services, health costs, prepayments …) only when that question is „Ja“; in a
// real-data run the owl drafted the craftsmen's amount without the gate and the 1.200 € reduction
// silently never counted. Which gate belongs to which field comes from the catalogue; this module
// only adds the copy and decides, from the case, whether the gate still needs a draft.
import type { CaseDigest } from './advisor'
import { yesNoGateOf, type EntryStepId } from './interview'
import type { OwlSourceId } from './owl-mode'

export interface DerivedGateAnswer {
  readonly field: EntryStepId
  readonly value: string
  readonly label: string
  readonly reason: string
  readonly sourceId: OwlSourceId
}

/**
 * What the user reads on the gate's card, per yes/no gate of the catalogue. A test holds every gate
 * of the catalogue to an entry here, so a new gate cannot reach the user without copy.
 * `estg-9-1` stands in where the list of legal sources has no closer paragraph (prepayments, § 37 EStG).
 */
export const GATE_COPY: Readonly<Partial<Record<EntryStepId, { readonly topic: string; readonly sourceId: OwlSourceId }>>> = {
  fortbildung: { topic: 'Fortbildung', sourceId: 'estg-9-1' },
  dhf: { topic: 'Doppelte Haushaltsführung', sourceId: 'estg-9-1' },
  umzug: { topic: 'Beruflicher Umzug', sourceId: 'estg-9-1' },
  abfindung: { topic: 'Abfindung', sourceId: 'estg-9-1' },
  lohnersatz: { topic: 'Lohnersatzleistungen', sourceId: 'estg-9-1' },
  spenden: { topic: 'Spenden', sourceId: 'estg-10b' },
  'kv-pv': { topic: 'Selbst gezahlte Kranken- und Pflegeversicherung', sourceId: 'estg-10-1-3' },
  riester: { topic: 'Riester-Vertrag', sourceId: 'estg-9-1' },
  'haushalt-gate': { topic: 'Haushaltsnahe Aufwendungen', sourceId: 'estg-35a' },
  'gesundheit-gate': { topic: 'Krankheitskosten', sourceId: 'estg-33' },
  'vorauszahlungen-gate': { topic: 'Vorauszahlungen', sourceId: 'estg-9-1' },
}

/**
 * The gate drafts this turn's interview drafts need: one per gate that is neither answered nor
 * drafted itself. `drafted` holds every interview value drafted in this turn (main and companion fields).
 * Never overrides an answer: a „Nein“ the user gave stays the user's to change.
 */
export function deriveGateAnswers(digest: CaseDigest, drafted: Readonly<Record<string, string>>): DerivedGateAnswer[] {
  // Without the list of answered gates nothing is known to be missing.
  if (!digest.answeredGates) return []
  const answered = digest.answeredGates
  const out: DerivedGateAnswer[] = []
  for (const [field, value] of Object.entries(drafted)) {
    const gate = yesNoGateOf(field)
    if (gate === undefined) continue
    // An amount of 0 says there is nothing behind the gate; it opens nothing.
    if (value === '0') continue
    if (Object.hasOwn(drafted, gate.gate) || (answered[gate.gate] ?? '') !== '') continue
    if (out.some((existing) => existing.field === gate.gate)) continue
    const copy = GATE_COPY[gate.gate]
    if (copy === undefined) continue
    out.push({
      field: gate.gate,
      value: gate.opensWith,
      label: `${copy.topic}: ${gate.opensWith}`,
      reason: `Deine Angaben zu „${copy.topic}“ zählen in der Schätzung und im Ausdruck nur, wenn diese Frage mit „${gate.opensWith}“ beantwortet ist.`,
      sourceId: copy.sourceId,
    })
  }
  return out
}
