import { Injectable } from '@nestjs/common'
import { InvalidInputError } from '../common/domain-error.js'
import {
  VERSPAETUNGSZUSCHLAG_MINDESTSATZ_EUR,
  VERSPAETUNGSZUSCHLAG_PROZENT_PRO_MONAT,
  fristenWarnung,
} from '@steuereule/core'
import type { FristenResponseDto } from './dto/fristen-response.dto.js'

export function heuteInBerlin(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value
  const jahr = get('year')
  const monat = get('month')
  const tag = get('day')
  if (jahr === undefined || monat === undefined || tag === undefined) {
    throw new Error('heuteInBerlin: the Berlin date parts are incomplete')
  }
  return `${jahr}-${monat}-${tag}`
}

/** Application logic for the Fristen-/Verspätungszuschlag-Warnmodus. */
@Injectable()
export class FristenService {
  async getFristen(steuerjahr: number): Promise<FristenResponseDto> {
    const heute = heuteInBerlin()
    let warnung
    try {
      warnung = fristenWarnung(steuerjahr, heute)
    } catch (error) {
      if (error instanceof RangeError) {
        throw new InvalidInputError('STEUERJAHR_UNSUPPORTED', error.message)
      }
      throw error
    }

    return {
      abgabefrist: warnung.abgabefrist,
      heute,
      stufe: warnung.stufe,
      verbleibendeTage: warnung.verbleibendeTage,
      verspaetungszuschlag: {
        mindestsatzEur: VERSPAETUNGSZUSCHLAG_MINDESTSATZ_EUR,
        prozentProMonat: VERSPAETUNGSZUSCHLAG_PROZENT_PRO_MONAT,
      },
    }
  }
}
