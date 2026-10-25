// Application logic for the Fristen-/Verspätungszuschlag-Warnmodus (ticket 10.7, M6). The facts
// are computed ONLY by @steuereule/core (`abgabefristFuer`/`fristenWarnung`) — never re-derived
// here (ADR-014/048 determinism boundary). The service owns the ONE non-pure input: "heute" —
// the server clock in Europe/Berlin (never the client clock, which the user could skew), mapped
// to an ISO yyyy-mm-dd. No persistence, no audit entry: the fristen are statutory facts, not
// user data (REQ-004 governs sensitive tax/profile data).
import { BadRequestException, Injectable } from '@nestjs/common'
import {
  VERSPAETUNGSZUSCHLAG_MINDESTSATZ_EUR,
  VERSPAETUNGSZUSCHLAG_PROZENT_PRO_MONAT,
  fristenWarnung,
} from '@steuereule/core'
import type { FristenResponseDto } from './dto/fristen-response.dto.js'

/**
 * The server's "heute" in Europe/Berlin as ISO yyyy-mm-dd. `now` is injectable so the
 * midnight-boundary behaviour is unit-testable (22:00 UTC is already the next day in Berlin);
 * the production call passes nothing and uses the real clock.
 */
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

@Injectable()
export class FristenService {
  async getFristen(steuerjahr: number): Promise<FristenResponseDto> {
    const heute = heuteInBerlin()
    // The core throws for an unsupported year (the per-year Regelwerk, Produkt-ADR-022) — at the
    // boundary that is an honest 400, never a neighbouring year's frist.
    let warnung
    try {
      warnung = fristenWarnung(steuerjahr, heute)
    } catch (error) {
      if (error instanceof RangeError) {
        throw new BadRequestException(error.message)
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
