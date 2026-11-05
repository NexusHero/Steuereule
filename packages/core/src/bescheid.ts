import type { Berechnungsstand } from './berechnung'
import type { AngestellteFakten } from './angestellte'

export type AssessmentAmountField = 'einnahmen' | 'vorsorgeaufwand' | 'anrechnung'
export type AssessmentOnlyField = 'festgesetzteSteuer' | 'erstattung'
export type AssessmentField = AssessmentAmountField | AssessmentOnlyField
export type BescheidFeldDef = {
  readonly id: AssessmentField
  readonly signiert: boolean
  readonly vergleichbar: boolean
}

export const BESCHEID_FELDER: readonly BescheidFeldDef[] = [
  { id: 'einnahmen', signiert: false, vergleichbar: true },
  { id: 'vorsorgeaufwand', signiert: false, vergleichbar: true },
  { id: 'anrechnung', signiert: false, vergleichbar: true },
  { id: 'festgesetzteSteuer', signiert: false, vergleichbar: false },
  { id: 'erstattung', signiert: true, vergleichbar: false },
]

export const BESCHEID_FELD_IDS: readonly AssessmentField[] = BESCHEID_FELDER.map((f) => f.id)

export const BESCHEID_VERGLEICHBARE_FELDER: readonly AssessmentAmountField[] = BESCHEID_FELDER.filter(
  (f): f is BescheidFeldDef & { id: AssessmentAmountField } => f.vergleichbar,
).map((f) => f.id)

export type AssessmentValues = Partial<Record<AssessmentField, number>>

/** A deviation on one of the three comparable buckets. */
export interface AssessmentDeviation {
  readonly feld: AssessmentAmountField
  readonly bescheid: number
  readonly berechnet: number
  readonly differenz: number
}

export interface AssessmentComparison {
  readonly abweichungen: readonly AssessmentDeviation[]
  readonly berechnungUnvollstaendig: boolean
}

export function reconcileAssessment(werte: AssessmentValues, stand: Berechnungsstand): AssessmentComparison {
  const abweichungen: AssessmentDeviation[] = []
  for (const feld of BESCHEID_VERGLEICHBARE_FELDER) {
    const bescheid = werte[feld]
    if (bescheid === undefined) continue
    const berechnet = stand[feld]
    if (bescheid !== berechnet) {
      abweichungen.push({ feld, bescheid, berechnet, differenz: bescheid - berechnet })
    }
  }
  return { abweichungen, berechnungUnvollstaendig: stand.kind === 'offen' }
}

export function bescheidBerechnungsstand(angestellte: AngestellteFakten, ch: Berechnungsstand | null): Berechnungsstand {
  const einnahmen = angestellte.einnahmen + (ch?.einnahmen ?? 0)
  const vorsorgeaufwand = ch?.vorsorgeaufwand ?? 0
  const anrechnung = ch?.anrechnung ?? 0
  const offenePosten = angestellte.offenePosten + (ch?.kind === 'offen' ? ch.offenePosten : 0)
  const konflikte = angestellte.konflikte + (ch?.kind === 'offen' ? ch.konflikte : 0)
  const gegated = [...new Set([...angestellte.gegated, ...(ch?.kind === 'offen' ? ch.gegated : [])])]
  const unbestaetigte = ch?.kind === 'offen' ? ch.unbestaetigte : 0
  const unbestaetigteSumme = ch?.kind === 'offen' ? ch.unbestaetigteSumme : 0
  const offen = offenePosten > 0 || konflikte > 0 || gegated.length > 0 || unbestaetigte > 0
  return offen
    ? { kind: 'offen', einnahmen, vorsorgeaufwand, anrechnung, offenePosten, konflikte, gegated, unbestaetigte, unbestaetigteSumme }
    : { kind: 'bestimmt', einnahmen, vorsorgeaufwand, anrechnung }
}

/** An IMMUTABLE snapshot of a submitted filing — the "Fassung". */
export interface Fassung {
  readonly nummer: number
  readonly einnahmen: number
  readonly vorsorgeaufwand: number
  readonly anrechnung: number
}

export type FassungsFeld = 'einnahmen' | 'vorsorgeaufwand' | 'anrechnung'

/** A single correction to apply to the eingereichte Fassung. */
export interface FassungsKorrektur {
  readonly feld: FassungsFeld
  readonly neuerBetrag: number
}

export interface FassungsAbweichung {
  readonly feld: FassungsFeld
  readonly vorher: number
  readonly nachher: number
  readonly differenz: number
}

export interface KorrekturErgebnis {
  readonly fassung: Fassung
  readonly abweichungen: readonly FassungsAbweichung[]
}

export function korrigiereFassung(vorfassung: Fassung, korrekturen: readonly FassungsKorrektur[]): KorrekturErgebnis {
  const fassung: { nummer: number; einnahmen: number; vorsorgeaufwand: number; anrechnung: number } = {
    ...vorfassung,
    nummer: vorfassung.nummer + 1,
  }
  const abweichungen: FassungsAbweichung[] = []
  for (const k of korrekturen) {
    if (!Number.isInteger(k.neuerBetrag) || k.neuerBetrag < 0) {
      throw new RangeError(`korrektur: neuerBetrag must be a non-negative integer`)
    }
    const vorher = fassung[k.feld]
    fassung[k.feld] = k.neuerBetrag
    if (vorher !== k.neuerBetrag) {
      abweichungen.push({ feld: k.feld, vorher, nachher: k.neuerBetrag, differenz: k.neuerBetrag - vorher })
    }
  }
  return { fassung, abweichungen }
}

export const EINSPRUCHS_GRUENDE = ['betrag-falsch', 'beleg-nicht-beruecksichtigt', 'sonstiges'] as const
export type AppealReason = (typeof EINSPRUCHS_GRUENDE)[number]

export function isAppealReason(value: string): value is AppealReason {
  return (EINSPRUCHS_GRUENDE as readonly string[]).includes(value)
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function appealDeadlineEnd(bescheiddatum: string): string {
  const m = ISO_DATE_RE.exec(bescheiddatum)
  if (m === null) throw new RangeError(`einspruchsfristEnde: "${bescheiddatum}" is not an ISO yyyy-mm-dd date`)
  const jahr = Number(m[1]!)
  const monat = Number(m[2]!)
  const tag = Number(m[3]!)
  const zielJahr = monat === 12 ? jahr + 1 : jahr
  const zielMonat = monat === 12 ? 1 : monat + 1
  const zielTag = Math.min(tag, daysInMonth(zielJahr, zielMonat))
  const mm = String(zielMonat).padStart(2, '0')
  const tt = String(zielTag).padStart(2, '0')
  return `${zielJahr}-${mm}-${tt}`
}

function daysSince(iso: string): number {
  const m = ISO_DATE_RE.exec(iso)
  if (m === null) throw new RangeError(`"${iso}" is not an ISO yyyy-mm-dd date`)
  return Date.UTC(Number(m[1]!), Number(m[2]!) - 1, Number(m[3]!)) / 86_400_000
}

export function remainingAppealDays(bescheiddatum: string, heute: string): number {
  const ende = daysSince(appealDeadlineEnd(bescheiddatum))
  const start = daysSince(heute)
  return ende - start
}

export const ASSESSMENT_UNCLEAR = 'unklar'

export function isValidAssessmentAmount(feld: AssessmentField, wert: number): boolean {
  if (!Number.isInteger(wert)) return false
  const def = BESCHEID_FELDER.find((f) => f.id === feld)
  return def?.signiert === true ? Number.isFinite(wert) : wert >= 0
}

export function serializeAssessmentField(feld: AssessmentField, wert: number | null | typeof ASSESSMENT_UNCLEAR): string | null {
  if (wert === null) return null
  if (wert === ASSESSMENT_UNCLEAR) return ASSESSMENT_UNCLEAR
  if (!isValidAssessmentAmount(feld, wert)) {
    throw new RangeError(`bescheid: erfasst value for "${feld}" is not a valid whole-euro amount`)
  }
  return String(wert)
}

export function deserializeAssessmentField(feld: AssessmentField, value: string | null): number | null | typeof ASSESSMENT_UNCLEAR {
  if (value === null) return null
  if (value === ASSESSMENT_UNCLEAR) return ASSESSMENT_UNCLEAR
  const wert = Number(value)
  if (!isValidAssessmentAmount(feld, wert)) {
    throw new Error(`bescheid: stored value "${value}" for "${feld}" is neither offen, unklar, nor a valid amount`)
  }
  return wert
}
