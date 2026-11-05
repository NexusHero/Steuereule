import type { Answers } from './interview'

export type KrankenversicherungArt = 'gesetzlich' | 'privat' | 'ausland'

/** Self-paid health and care insurance of one person, as the Anlage Vorsorgeaufwand asks for it. */
export interface Krankenversicherung {
  readonly art: KrankenversicherungArt
  /** KV Basisabsicherung, without care insurance and extras. */
  readonly kvBasis: number
  /** Whether the KV contributions carry a Krankengeld claim (only asked for statutory and foreign insurance). */
  readonly mitKrankengeld: boolean
  readonly pv: number
  /** Beyond the Basisabsicherung (Wahlleistungen, Zusatzversicherungen). */
  readonly wahlleistungen: number
}

const ART: Readonly<Record<string, KrankenversicherungArt>> = {
  'Gesetzlich (freiwillig)': 'gesetzlich',
  Privat: 'privat',
  Ausländisch: 'ausland',
}

function betrag(value: string | undefined): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function krankenversicherungAusAntworten(answers: Answers): Krankenversicherung | null {
  if (answers['kv-pv'] !== 'Ja') return null
  return {
    art: ART[answers['kv-pv-art'] ?? ''] ?? 'gesetzlich',
    kvBasis: betrag(answers['kv-pv-betrag']),
    mitKrankengeld: answers['kv-krankengeld'] === 'Ja',
    pv: betrag(answers['pv-betrag']),
    wahlleistungen: betrag(answers['kv-wahl-betrag']),
  }
}

/** § 10 Abs. 1 Nr. 3 EStG: KV with a Krankengeld claim counts 4 % less; PV fully; extras only within § 10 Abs. 4 — not counted here. */
export function abziehbareBasisvorsorge(kv: Krankenversicherung | null): number {
  if (kv === null) return 0
  return Math.round(kv.mitKrankengeld ? kv.kvBasis * 0.96 : kv.kvBasis) + kv.pv
}
