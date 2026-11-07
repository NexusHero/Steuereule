import { Injectable } from '@nestjs/common'
import { INCOME_TYPES, type IncomeType, type OwlSourceId, type KiPort, type AiProposal } from '@steuereule/core'

export const KI_PORT = Symbol('KI_PORT')

export interface LegalSourceEntry {
  readonly id: string
  readonly paragraph: string
  readonly legalStatusDate: string
  readonly translation: string
  readonly url: string
}

export const LEGAL_SOURCES: Readonly<Record<OwlSourceId | 'estg-32', LegalSourceEntry>> = {
  'estg-4-5-6c': {
    id: 'estg-4-5-6c',
    paragraph: '§ 4 Abs. 5 Satz 1 Nr. 6c EStG',
    legalStatusDate: '01.01.2025',
    translation:
      'Für jeden Kalendertag, an dem die berufliche Tätigkeit überwiegend in der häuslichen Wohnung ausgeübt wird, kann eine Tagespauschale von 6 € abgezogen werden, höchstens 1.260 € im Jahr (210 Tage).',
    url: 'https://www.gesetze-im-internet.de/estg/__4.html',
  },
  'estg-9-1': {
    id: 'estg-9-1',
    paragraph: '§ 9 Abs. 1 Satz 1 EStG',
    legalStatusDate: '01.01.2025',
    translation:
      'Werbungskosten sind Aufwendungen zur Erwerbung, Sicherung und Erhaltung der Einnahmen — dazu gehören Fortbildungen im ausgeübten Beruf.',
    url: 'https://www.gesetze-im-internet.de/estg/__9.html',
  },
  'estg-9-1-6': {
    id: 'estg-9-1-6',
    paragraph: '§ 9 Abs. 1 Satz 3 Nr. 6 und 7 EStG',
    legalStatusDate: '01.01.2025',
    translation:
      'Aufwendungen für Arbeitsmittel, etwa Werkzeuge und typische Berufskleidung, sind Werbungskosten; Arbeitsmittel bis 800 € netto können sofort voll abgezogen werden.',
    url: 'https://www.gesetze-im-internet.de/estg/__9.html',
  },
  'estg-9-4a': {
    id: 'estg-9-4a',
    paragraph: '§ 9 Abs. 4a EStG',
    legalStatusDate: '01.01.2025',
    translation:
      'Bei einer beruflichen Auswärtstätigkeit gelten Verpflegungspauschalen: 14 € bei mehr als 8 Stunden Abwesenheit, 28 € für jeden vollen Kalendertag.',
    url: 'https://www.gesetze-im-internet.de/estg/__9.html',
  },
  'estg-9-6': {
    id: 'estg-9-6',
    paragraph: '§ 9 Abs. 6 EStG',
    legalStatusDate: '01.01.2025',
    translation:
      'Kosten einer Erstausbildung oder eines Erststudiums sind nur Werbungskosten, wenn sie im Rahmen eines Dienstverhältnisses stattfinden; eine Zweitausbildung ist voll als Werbungskosten abziehbar.',
    url: 'https://www.gesetze-im-internet.de/estg/__9.html',
  },
  'estg-9-1-4a': {
    id: 'estg-9-1-4a',
    paragraph: '§ 9 Abs. 1 Satz 3 Nr. 4a EStG',
    legalStatusDate: '01.01.2025',
    translation:
      'Fahrten im Rahmen einer beruflichen Auswärtstätigkeit – etwa zu einer Fortbildung außerhalb der ersten Tätigkeitsstätte – sind mit 0,30 € je gefahrenem Kilometer (Hin- und Rückfahrt) als Werbungskosten abziehbar.',
    url: 'https://www.gesetze-im-internet.de/estg/__9.html',
  },
  'estg-10b': {
    id: 'estg-10b',
    paragraph: '§ 10b Abs. 1 EStG',
    legalStatusDate: '01.01.2025',
    translation:
      'Zuwendungen (Spenden und Mitgliedsbeiträge) zur Förderung steuerbegünstigter Zwecke können insgesamt bis zu 20 % des Gesamtbetrags der Einkünfte als Sonderausgaben abgezogen werden.',
    url: 'https://www.gesetze-im-internet.de/estg/__10b.html',
  },
  'estg-10-1-5': {
    id: 'estg-10-1-5',
    paragraph: '§ 10 Abs. 1 Nr. 5 EStG',
    legalStatusDate: '01.01.2025',
    translation:
      'Kinderbetreuungskosten für Kinder bis zum 14. Lebensjahr sind in Höhe von 80 % der Aufwendungen, höchstens 4.800 € je Kind und Jahr, als Sonderausgaben abziehbar.',
    url: 'https://www.gesetze-im-internet.de/estg/__10.html',
  },
  'estg-32': {
    id: 'estg-32',
    paragraph: '§ 32 Abs. 6 EStG',
    legalStatusDate: '01.01.2025',
    translation:
      'Für jedes zu berücksichtigende Kind wird der Kinderfreibetrag samt Freibetrag für den Betreuungs- und Erziehungs- oder Ausbildungsbedarf (2025: 9.600 € bei Zusammenveranlagung) von Amts wegen mit dem Kindergeld verglichen (Günstigerprüfung).',
    url: 'https://www.gesetze-im-internet.de/estg/__32.html',
  },
  'ao-355': {
    id: 'ao-355',
    paragraph: '§ 355 Abs. 1 AO',
    legalStatusDate: '01.01.2025',
    translation:
      'Der Einspruch gegen einen Steuerbescheid ist innerhalb eines Monats nach Bekanntgabe des Verwaltungsakts einzulegen.',
    url: 'https://www.gesetze-im-internet.de/ao_1977/__355.html',
  },
}

const IBAN_REGEX = /\b[A-Z]{2}\d{2}(?:[\s.-]?[A-Z0-9]{4}){3,7}(?:[\s.-]?[A-Z0-9]{1,4})?\b|\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/i
const TAX_ID_REGEX = /\b\d{2}[\s.-]?\d{3}[\s.-]?\d{3}[\s.-]?\d{3}\b|\b\d{3}[\s.-]?\d{3}[\s.-]?\d{3}[\s.-]?\d{2}\b|\b\d{11}\b/
// German and English spellings: payloads carry the code's English names, older records the German ones.
const PERSON_KEYS = new Set([
  'firstName',
  'lastName',
  'vorname',
  'nachname',
  'steuerId',
  'taxId',
  'idnr',
  'iban',
  'strasse',
  'street',
  'telefon',
  'phone',
  'birthDate',
  'geburtsdatum',
  'email',
  'kontoinhaber',
])

function findPersonKey(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  for (const [key, kind] of Object.entries(value)) {
    if (PERSON_KEYS.has(key)) return key
    const deeper = findPersonKey(kind)
    if (deeper) return deeper
  }
  return null
}

export function checkPiiFree(payload: unknown): void {
  const serialized = JSON.stringify(payload)
  if (IBAN_REGEX.test(serialized)) {
    throw new Error('PII boundary violation: IBAN detected in KI payload.')
  }
  if (TAX_ID_REGEX.test(serialized)) {
    throw new Error('PII boundary violation: 11-digit Steuer-ID detected in KI payload.')
  }
  const key = findPersonKey(payload)
  if (key) {
    throw new Error(`PII boundary violation: forbidden personal field "${key}" in KI payload.`)
  }
}

export function validateAiProposal(raw: unknown): AiProposal {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid KiVorschlag: not an object.')
  }
  const obj = raw as Record<string, unknown>
  if (typeof obj.id !== 'string' || obj.id.trim().length === 0) {
    throw new Error('Invalid KiVorschlag: id must be a non-empty string.')
  }
  if (typeof obj.einkunftsart !== 'string' || !(INCOME_TYPES as readonly string[]).includes(obj.einkunftsart)) {
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
    incomeType: obj.einkunftsart as IncomeType,
    amount: obj.betrag,
    ...(typeof obj.belegId === 'string' ? { receiptId: obj.belegId } : {}),
  }
}

/** The adapter behind KiPort. */
@Injectable()
export class RagKiAdapter implements KiPort {
  async proposeFromReceipt(receiptId: string): Promise<readonly AiProposal[]> {
    checkPiiFree({ belegId: receiptId })
    return []
  }

  async explainSource(sourceId: string): Promise<string> {
    if (!Object.hasOwn(LEGAL_SOURCES, sourceId)) throw new Error(`Unbekannte Rechtsquelle "${sourceId}".`)
    const entry = LEGAL_SOURCES[sourceId as OwlSourceId]
    return `${entry.translation} (${entry.paragraph}, Rechtsstand ${entry.legalStatusDate})`
  }
}
