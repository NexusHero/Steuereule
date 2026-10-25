// `type:` given explicitly — see PutProfileDto's comment for why.
import { ApiProperty } from '@nestjs/swagger'

/** Die § 152 Abs. 2 AO-Fakten, die das Banner nüchtern nennt (Produkt-ADR-023). */
export class VerspaetungszuschlagDto {
  @ApiProperty({ type: Number, example: 25, description: '§ 152 Abs. 2 Satz 2 AO — der Mindestzuschlag je angefangenem Monat, in Euro.' })
  mindestsatzEur!: number

  @ApiProperty({ type: Number, example: 0.25, description: '§ 152 Abs. 2 Satz 1 AO — 0,25 % der festgesetzten Steuer je angefangenem Monat.' })
  prozentProMonat!: number
}

/**
 * The response shape for `GET /v1/steuerjahre/{jahr}/fristen` — the honest Fristen-Fakt for the
 * tax year (ADR-0039): `stufe` is a banner input (`keine` | `warnung` | `abgelaufen`), NEVER a
 * tax status — the Steuerjahr stays `entwurf` even when the frist passed. `heute` is the server's
 * Europe/Berlin date (never the client clock).
 */
export class FristenResponseDto {
  @ApiProperty({ type: String, example: '2027-07-31', description: 'Die Abgabefrist (§ 149 Abs. 2 AO), ISO yyyy-mm-dd.' })
  abgabefrist!: string

  @ApiProperty({ type: String, example: '2027-06-01', description: 'Der Server-Stichtag in Europe/Berlin, ISO yyyy-mm-dd.' })
  heute!: string

  @ApiProperty({ type: String, enum: ['keine', 'warnung', 'abgelaufen'], description: 'keine | warnung (ab 60 Tage vor der Frist) | abgelaufen.' })
  stufe!: 'keine' | 'warnung' | 'abgelaufen'

  @ApiProperty({ type: Number, example: 60, description: 'Whole days from heute (exclusive) to the frist; negative = abgelaufen.' })
  verbleibendeTage!: number

  @ApiProperty({ type: VerspaetungszuschlagDto })
  verspaetungszuschlag!: VerspaetungszuschlagDto
}
