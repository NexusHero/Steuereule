import {
  amtlicherMonatskurs,
  deserialisiereLohnausweisFeld,
  grenzgaengerStatus,
  tatsaechlicherKurs,
  type Answers,
  type GrenzgaengerStatus,
  type LohnausweisWerte,
  type Wechselkurs,
} from '@steuereule/core'
import type { ChLohnausweisRecord } from './ch-lohnausweis.repository.js'

export function lohnausweisWerteAusRecord(record: ChLohnausweisRecord | null): LohnausweisWerte {
  const werte: LohnausweisWerte = {}
  if (record === null) return werte
  for (const [feldId, stored] of Object.entries(record.felder)) {
    const wert = deserialisiereLohnausweisFeld(stored)
    if (typeof wert === 'number') werte[feldId as keyof LohnausweisWerte] = wert
  }
  return werte
}

export function wechselkursAusRecord(record: ChLohnausweisRecord | null): Wechselkurs | null {
  if (record === null || record.wechselkursMonat === null || record.wechselkursKurs === null || record.wechselkursModus === null) {
    return null
  }
  if (record.wechselkursModus === 'amtlich') return amtlicherMonatskurs(record.wechselkursMonat, record.wechselkursKurs)
  if (record.wechselkursBelegId === null) return null
  return tatsaechlicherKurs(record.wechselkursMonat, record.wechselkursKurs, record.wechselkursBelegId)
}

export function grenzgaengerStatusAusAnswers(answers: Answers): GrenzgaengerStatus | null {
  const wohnsitz = answers['ch-wohnsitz']
  if (wohnsitz !== 'Deutschland' && wohnsitz !== 'Schweiz') return null
  const tageStr = answers['ch-nichtrueckkehrtage']
  if (tageStr === undefined) return null
  const tage = Number(tageStr)
  if (!Number.isInteger(tage)) return null
  return grenzgaengerStatus(wohnsitz, tage)
}
