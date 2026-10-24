// `type:`/explicit classes throughout — see PutProfileDto's comment for why
// (esbuild/tsx emit no `design:*` metadata, so @nestjs/swagger can't infer these).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/**
 * The honest Cockpit stand, as a flat discriminated union on the wire (same shape as
 * LstbZustandDto/StepDto): `kind` fixes which optional fields are present. It mirrors
 * @steuereule/core's `CockpitSpanne` (ticket 15) exactly — never re-derived in the API.
 *   - `bestimmt`  — nothing open/conflicting/gated; `wert` is the settled point value (ADR-015).
 *   - `spanne`    — open items/conflicts widen the settled sum into a bounded range; `von`/`bis`
 *                   are the bounds, `offenePosten`/`konflikte` name what stands in the way.
 *   - `gated`     — a declared Einkunftsart 1.0 cannot compute (ADR-032); `summe` is the settled
 *                   partial sum, `gegated` names the gated categories — no numeric range is honest.
 */
export class CockpitStandDto {
  @ApiProperty({ type: String, enum: ['bestimmt', 'spanne', 'gated'], example: 'spanne' })
  kind!: 'bestimmt' | 'spanne' | 'gated'

  @ApiPropertyOptional({ type: Number, example: 1444, description: 'The settled point value (only when kind === "bestimmt").' })
  wert?: number

  @ApiPropertyOptional({ type: Number, example: 1227, description: 'Lower bound (only when kind === "spanne").' })
  von?: number

  @ApiPropertyOptional({ type: Number, example: 1587, description: 'Upper bound (only when kind === "spanne").' })
  bis?: number

  @ApiPropertyOptional({ type: Number, example: 3, description: 'Still-open required line items (only when kind === "spanne").' })
  offenePosten?: number

  @ApiPropertyOptional({ type: Number, example: 1, description: 'Open posten conflicts, ADR-008 (only when kind === "spanne").' })
  konflikte?: number

  @ApiPropertyOptional({ type: Number, example: 0, description: 'The settled partial sum (only when kind === "gated").' })
  summe?: number

  @ApiPropertyOptional({ type: [String], example: ['Gewerbe'], description: 'The gated Einkunftsarten (only when kind === "gated").' })
  gegated?: string[]
}

/**
 * The one response shape for `GET /v1/steuerjahre/{jahr}/cockpit`. `stand` is the deterministic
 * fold result from @steuereule/core (`berechne` + `cockpitSpanne`) — the Schätz-Platzhalter
 * (`baseEstimate`) is gone (ADR-0032: no number that looks like a calculation without
 * being one). `openItems` stays the Minimal-Gate's `remainingSteps` count (REQ-015), the "N Angaben
 * offen" line and the "Fragen beantworten" CTA both read it from. The wire body for a 200 response
 * is either this object directly, or JSON `null` (no tax year seeded/entered yet — the honest empty
 * state, never a 404) — see CockpitController's ApiOkResponse schema.
 */
export class CockpitSummaryDto {
  @ApiProperty({ type: Number, example: 2026 })
  taxYear!: number

  @ApiProperty({ type: CockpitStandDto })
  stand!: CockpitStandDto

  @ApiProperty({ type: Number, example: 3, description: 'Minimal-Gate questions still open (REQ-015 remainingSteps).' })
  openItems!: number
}
