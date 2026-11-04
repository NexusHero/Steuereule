import { Injectable } from '@nestjs/common'
import { EINKUNFTSARTEN, type Einkunftsart, type EulenQuelleId, type KiPort, type KiVorschlag } from '@steuereule/core'

export const KI_PORT = Symbol('KI_PORT')

export interface RechtsquelleEintrag {
  readonly id: string
  readonly paragraph: string
  readonly rechtsstandDatum: string
  readonly uebersetzung: string
  readonly url: string
}

export const RECHTSQUELLEN: Readonly<Record<EulenQuelleId | 'estg-32', RechtsquelleEintrag>> = {
  'estg-4-5-6c': {
    id: 'estg-4-5-6c',
    paragraph: '§ 4 Abs. 5 Satz 1 Nr. 6c EStG',
    rechtsstandDatum: '01.01.2025',
    uebersetzung:
      'Für jeden Kalendertag, an dem die berufliche Tätigkeit überwiegend in der häuslichen Wohnung ausgeübt wird, kann eine Tagespauschale von 6 € abgezogen werden, höchstens 1.260 € im Jahr (210 Tage).',
    url: 'https://www.gesetze-im-internet.de/estg/__4.html',
  },
  'estg-9-1-4a': {
    id: 'estg-9-1-4a',
    paragraph: '§ 9 Abs. 1 Satz 3 Nr. 4a EStG',
    rechtsstandDatum: '01.01.2025',
    uebersetzung:
      'Fahrten im Rahmen einer beruflichen Auswärtstätigkeit – etwa zu einer Fortbildung außerhalb der ersten Tätigkeitsstätte – sind mit 0,30 € je gefahrenem Kilometer (Hin- und Rückfahrt) als Werbungskosten abziehbar.',
    url: 'https://www.gesetze-im-internet.de/estg/__9.html',
  },
  'estg-10b': {
    id: 'estg-10b',
    paragraph: '§ 10b Abs. 1 EStG',
    rechtsstandDatum: '01.01.2025',
    uebersetzung:
      'Zuwendungen (Spenden und Mitgliedsbeiträge) zur Förderung steuerbegünstigter Zwecke können insgesamt bis zu 20 % des Gesamtbetrags der Einkünfte als Sonderausgaben abgezogen werden.',
    url: 'https://www.gesetze-im-internet.de/estg/__10b.html',
  },
  'estg-10-1-5': {
    id: 'estg-10-1-5',
    paragraph: '§ 10 Abs. 1 Nr. 5 EStG',
    rechtsstandDatum: '01.01.2025',
    uebersetzung:
      'Kinderbetreuungskosten für Kinder bis zum 14. Lebensjahr sind in Höhe von 80 % der Aufwendungen, höchstens 4.800 € je Kind und Jahr, als Sonderausgaben abziehbar.',
    url: 'https://www.gesetze-im-internet.de/estg/__10.html',
  },
  'estg-32': {
    id: 'estg-32',
    paragraph: '§ 32 Abs. 6 EStG',
    rechtsstandDatum: '01.01.2025',
    uebersetzung:
      'Für jedes zu berücksichtigende Kind wird der Kinderfreibetrag samt Freibetrag für den Betreuungs- und Erziehungs- oder Ausbildungsbedarf (2025: 9.600 € bei Zusammenveranlagung) von Amts wegen mit dem Kindergeld verglichen (Günstigerprüfung).',
    url: 'https://www.gesetze-im-internet.de/estg/__32.html',
  },
  'ao-355': {
    id: 'ao-355',
    paragraph: '§ 355 Abs. 1 AO',
    rechtsstandDatum: '01.01.2025',
    uebersetzung:
      'Der Einspruch gegen einen Steuerbescheid ist innerhalb eines Monats nach Bekanntgabe des Verwaltungsakts einzulegen.',
    url: 'https://www.gesetze-im-internet.de/ao_1977/__355.html',
  },
}

const IBAN_REGEX = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/
const STEUER_ID_REGEX = /\b\d{11}\b/
const PERSONEN_SCHLUESSEL = new Set(['firstName', 'lastName', 'vorname', 'nachname', 'steuerId', 'idnr', 'iban', 'strasse', 'telefon'])

function findePersonenSchluessel(wert: unknown): string | null {
  if (typeof wert !== 'object' || wert === null) return null
  for (const [schluessel, kind] of Object.entries(wert)) {
    if (PERSONEN_SCHLUESSEL.has(schluessel)) return schluessel
    const tiefer = findePersonenSchluessel(kind)
    if (tiefer) return tiefer
  }
  return null
}

export function pruefePiiFreiheit(payload: unknown): void {
  const serialized = JSON.stringify(payload)
  if (IBAN_REGEX.test(serialized)) {
    throw new Error('PII boundary violation: IBAN detected in KI payload.')
  }
  if (STEUER_ID_REGEX.test(serialized)) {
    throw new Error('PII boundary violation: 11-digit Steuer-ID detected in KI payload.')
  }
  const schluessel = findePersonenSchluessel(payload)
  if (schluessel) {
    throw new Error(`PII boundary violation: forbidden personal field "${schluessel}" in KI payload.`)
  }
}

export function validiereKiVorschlag(raw: unknown): KiVorschlag {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid KiVorschlag: not an object.')
  }
  const obj = raw as Record<string, unknown>
  if (typeof obj.id !== 'string' || obj.id.trim().length === 0) {
    throw new Error('Invalid KiVorschlag: id must be a non-empty string.')
  }
  if (typeof obj.einkunftsart !== 'string' || !(EINKUNFTSARTEN as readonly string[]).includes(obj.einkunftsart)) {
    throw new Error(`Invalid KiVorschlag: unknown einkunftsart "${String(obj.einkunftsart)}".`)
  }
  if (typeof obj.betrag !== 'number' || !Number.isInteger(obj.betrag) || obj.betrag < 0) {
    throw new Error('Invalid KiVorschlag: betrag must be a non-negative integer.')
  }
  if (obj.belegId !== undefined && typeof obj.belegId !== 'string') {
    throw new Error('Invalid KiVorschlag: belegId must be a string when present.')
  }
  return {
    id: obj.id,
    einkunftsart: obj.einkunftsart as Einkunftsart,
    betrag: obj.betrag,
    ...(typeof obj.belegId === 'string' ? { belegId: obj.belegId } : {}),
  }
}

/** The adapter behind KiPort. */
@Injectable()
export class RagKiAdapter implements KiPort {
  async schlageVorAusBeleg(belegId: string): Promise<readonly KiVorschlag[]> {
    pruefePiiFreiheit({ belegId })
    return []
  }

  async erklaereQuelle(quelleId: string): Promise<string> {
    if (!Object.hasOwn(RECHTSQUELLEN, quelleId)) throw new Error(`Unbekannte Rechtsquelle "${quelleId}".`)
    const eintrag = RECHTSQUELLEN[quelleId as EulenQuelleId]
    return `${eintrag.uebersetzung} (${eintrag.paragraph}, Rechtsstand ${eintrag.rechtsstandDatum})`
  }
}
