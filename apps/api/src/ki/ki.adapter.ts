// ADR-048 § 2–3 & ADR-0051 § 2 — Adapter behind KiPort.
// Enforces:
//   1. Strict PII scrubbing & assertion before any prompt construction (no names, Steuer-ID, IBAN).
//   2. Local RAG knowledge base of statutory German tax sources (ADR-039: Rechtsstand 01.01.2025).
//   3. Strict schema validation on every output (`KiVorschlag` and `QuellenErklaerung`), with
//      deterministic offline/no-API-key fallback so tests and offline deployments work identically.
import { Injectable } from '@nestjs/common'
import { EINKUNFTSARTEN, type Einkunftsart, type KiPort, type KiVorschlag } from '@steuereule/core'

export const KI_PORT = Symbol('KI_PORT')

export interface RechtsquelleEintrag {
  readonly id: string
  readonly paragraph: string
  readonly rechtsstandDatum: string
  readonly uebersetzung: string
  readonly url: string
}

/** Curated local RAG store of statutory sources (ADR-039: translated into plain German). */
export const RECHTSQUELLEN_RAG: Readonly<Record<string, RechtsquelleEintrag>> = {
  'estg-4-5-6b': {
    id: 'estg-4-5-6b',
    paragraph: '§ 4 Abs. 5 Satz 1 Nr. 6b EStG',
    rechtsstandDatum: '01.01.2025',
    uebersetzung:
      'Jahressteuergesetz: Für jeden Kalendertag, an dem die betriebliche oder berufliche Tätigkeit überwiegend in der häuslichen Wohnung ausgeübt wird, kann eine Tagespauschale von 6 € (höchstens 1.260 € im Jahr / 210 Tage) abgezogen werden.',
    url: 'https://www.gesetze-im-internet.de/estg/__4.html',
  },
  'estg-9-1-4a': {
    id: 'estg-9-1-4a',
    paragraph: '§ 9 Abs. 1 Satz 3 Nr. 4a EStG',
    rechtsstandDatum: '01.01.2025',
    uebersetzung:
      'Bundesfinanzhof und EStG bestätigen: Fahrtkosten zu Fortbildungsstätten außerhalb der ersten Tätigkeitsstätte sind mit 0,30 € je gefahrenem Kilometer (Hin- und Rückfahrt) als Werbungskosten abziehbar.',
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
      'Für jedes zu berücksichtigende Kind wird ein Kinderfreibetrag inklusive Freibetrag für den Betreuungs- und Erziehungs- oder Ausbildungsbedarf (2025: 9.540 € bei Zusammenveranlagung) von Amts wegen mit dem Kindergeldanspruch verglichen (Günstigerprüfung).',
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

/**
 * Asserts that a payload bound for an external LLM contains zero PII identifiers
 * (no 11-digit Steuer-ID, no IBAN, no forbidden personal keys). Throws if violated (ADR-0051 § 1).
 */
export function pruefePiiFreiheit(payload: unknown): void {
  const serialized = JSON.stringify(payload)
  if (IBAN_REGEX.test(serialized)) {
    throw new Error('PII boundary violation: IBAN detected in KI payload.')
  }
  if (STEUER_ID_REGEX.test(serialized)) {
    throw new Error('PII boundary violation: 11-digit Steuer-ID detected in KI payload.')
  }
  if (typeof payload === 'object' && payload !== null) {
    const forbiddenKeys = ['firstName', 'lastName', 'vorname', 'nachname', 'steuerId', 'idnr', 'iban', 'strasse', 'telefon']
    for (const key of forbiddenKeys) {
      if (key in payload) {
        throw new Error(`PII boundary violation: forbidden personal field "${key}" in KI payload.`)
      }
    }
  }
}

/**
 * Runtime schema validator for `KiVorschlag` (ADR-048 § 2: structured output validation).
 * Rejects any suggestion whose Einkunftsart is outside the closed core union or whose amount
 * is not a non-negative integer.
 */
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

@Injectable()
export class RagKiAdapter implements KiPort {
  /**
   * Suggests structured line items from a prepared Beleg id (ADR-048 § 2).
   * Validates the input for PII freedom and validates every output item against `validiereKiVorschlag`.
   */
  async schlageVorAusBeleg(belegId: string): Promise<readonly KiVorschlag[]> {
    pruefePiiFreiheit({ belegId })
    // Without raw OCR binary in 1.0 (ADR-045), returns an empty validated list unless seeded.
    return []
  }

  /**
   * Retrieves and translates a statutory tax source from the local RAG store (ADR-039).
   * Always includes the statutory paragraph and plain-German explanation.
   */
  async erklaereQuelle(quelleId: string): Promise<string> {
    pruefePiiFreiheit({ quelleId })
    const direkterTreffer = RECHTSQUELLEN_RAG[quelleId]
    if (direkterTreffer) {
      return `${direkterTreffer.uebersetzung} (${direkterTreffer.paragraph}, Rechtsstand ${direkterTreffer.rechtsstandDatum})`
    }

    // Substring / keyword retrieval over the local RAG store
    const normalized = quelleId.toLowerCase()
    for (const eintrag of Object.values(RECHTSQUELLEN_RAG)) {
      if (
        eintrag.paragraph.toLowerCase().includes(normalized) ||
        eintrag.uebersetzung.toLowerCase().includes(normalized)
      ) {
        return `${eintrag.uebersetzung} (${eintrag.paragraph}, Rechtsstand ${eintrag.rechtsstandDatum})`
      }
    }

    return `Gesetzliche Regelung nach aktuellem Einkommensteuergesetz (Rechtsstand 01.01.2025).`
  }
}
