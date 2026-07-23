// `type:`/explicit classes throughout — see the comment on PutProfileDto for why
// (esbuild/tsx emit no `design:*` metadata, so @nestjs/swagger can't infer these).
import { ApiProperty } from '@nestjs/swagger'
import type { EstimateRange } from '@steuereule/core'

/** Mirrors @steuereule/core's `EstimateRange` shape with Swagger-visible properties. */
export class EstimateRangeDto implements EstimateRange {
  @ApiProperty({ type: Number, example: 1227, description: 'Lower bound of the estimate range, in whole euro.' })
  from!: number

  @ApiProperty({ type: Number, example: 1587, description: 'Upper bound of the estimate range, in whole euro.' })
  to!: number
}

/**
 * The one response shape for `GET /v1/steuerjahre/{jahr}/cockpit` — matches the field
 * names pinned in the frozen frontend contract (apps/mobile-web's cockpitSummary.ts,
 * REQ-001 T6/#93) exactly, so the eventual orval-generated client is call-site
 * compatible with today's provisional one. The wire body for a 200 response is either
 * this object directly, or JSON `null` (no tax year seeded/entered yet — the honest
 * empty state, never a 404) — see CockpitController's ApiOkResponse schema.
 */
export class CockpitSummaryDto {
  @ApiProperty({ type: Number, example: 2026 })
  taxYear!: number

  @ApiProperty({ type: EstimateRangeDto })
  estimate!: EstimateRangeDto

  @ApiProperty({ type: Number, example: 3, description: 'Count of still-open interview/receipt items.' })
  openItems!: number
}
