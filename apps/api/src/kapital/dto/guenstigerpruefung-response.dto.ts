// `type:`/explicit classes throughout — see PutProfileDto's comment for why (esbuild/tsx
// emit no `design:*` metadata, so @nestjs/swagger can't infer these).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
// The SAME UnschaerfeDto the Veranlagungsartenvergleich serves — one wire shape for the one
// ADR-0034 margin (ADR-0033's one-rule instinct).
import { UnschaerfeDto } from '../../veranlagungsartenvergleich/dto/veranlagungsartenvergleich-response.dto.js'

/** Herkunfts-Metadaten an beiden Zahlen (Ticket-AC "ADR-0034-Muster"). */
export class GuenstigerpruefungHerkunftDto {
  @ApiProperty({ type: Number, example: 20000, description: 'The Kapitalerträge (whole euros) — the basis of both amounts.' })
  kapitalertraege!: number

  @ApiProperty({ type: Number, example: 60000, description: 'The übrige zvE-basis (Einnahmen-Basis from @steuereule/core — layer 3 open, no real zvE yet).' })
  uebrigesZvE!: number

  @ApiProperty({ type: Number, example: 1000, description: 'The applied Sparerpauschbetrag (§ 20 Abs. 9 EStG).' })
  sparerpauschbetrag!: number

  @ApiProperty({ type: String, enum: ['einzel', 'zusammen'], description: 'Which Veranlagungsart both amounts compute.' })
  veranlagung!: 'einzel' | 'zusammen'

  @ApiProperty({ type: [String], example: ['einkommensteuer', 'solidaritaetszuschlag'], description: 'Which tax components are folded into both amounts.' })
  bestandteile!: string[]
}

/**
 * The one response shape for `GET /v1/steuerjahre/{jahr}/kapital/guenstigerpruefung` — the
 * § 32d Abs. 6 EStG Günstigerprüfung as a bounded comparison (ADR-0034-Muster). A flat
 * discriminated union on `kind`: `aussage` is read FIRST — `empfehlung` exists only when
 * `kind === 'eindeutig'`. `nicht-anwendbar` is the honest gate (ausländischer Broker — keine
 * Abgeltung einbehalten; Krypto — gegated; kap-depot unbeantwortet; keine Kapitalerträge
 * erfasst) — never a fabricated zero. The wire body is this object or JSON `null` (no tax
 * year seeded yet — the honest empty state, same as Cockpit).
 */
export class GuenstigerpruefungDto {
  @ApiProperty({ type: String, enum: ['eindeutig', 'zu-knapp', 'unbestimmt', 'nicht-anwendbar'], example: 'eindeutig' })
  kind!: 'eindeutig' | 'zu-knapp' | 'unbestimmt' | 'nicht-anwendbar'

  @ApiPropertyOptional({ type: String, enum: ['abgeltung', 'persoenlich'], description: 'The recommendation (only when kind === "eindeutig").' })
  empfehlung?: 'abgeltung' | 'persoenlich'

  @ApiPropertyOptional({ type: Number, example: 4750, description: 'Abgeltungsteuer + Soli + KiSt-Ermäßigung (only when kind !== "nicht-anwendbar").' })
  abgeltung?: number

  @ApiPropertyOptional({ type: Number, example: 8482, description: 'The personal (tariff) tax on the capital income (only when kind !== "nicht-anwendbar").' })
  persoenlich?: number

  @ApiPropertyOptional({ type: Number, example: 3732, description: 'persoenlich − abgeltung (only when kind !== "nicht-anwendbar").' })
  delta?: number

  @ApiPropertyOptional({ type: UnschaerfeDto, description: 'The computed margin (only when kind !== "nicht-anwendbar").' })
  unschaerfe?: UnschaerfeDto

  @ApiPropertyOptional({ type: GuenstigerpruefungHerkunftDto, description: 'Origin metadata on both numbers (only when kind !== "nicht-anwendbar").' })
  herkunft?: GuenstigerpruefungHerkunftDto

  @ApiPropertyOptional({
    type: String,
    enum: ['keine-abgeltung-einbehalten', 'krypto-gegated', 'kap-depot-nicht-beantwortet', 'keine-kapitalertraege'],
    description: 'Why the Günstigerprüfung does not apply (only when kind === "nicht-anwendbar").',
  })
  grund?: 'keine-abgeltung-einbehalten' | 'krypto-gegated' | 'kap-depot-nicht-beantwortet' | 'keine-kapitalertraege'
}
