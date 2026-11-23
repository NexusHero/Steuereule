// Shapes of the structured preview (Glas-Erklärung) and what its row builders read.
import type { Screen } from '@steuereule/core'
import type { LiveFormDto } from '@steuereule/api-client'
import type { LiveRowContext } from './liveFormRows'

export interface GlassFormRow {
  readonly id: string
  readonly line: string
  readonly label: string
  readonly value: string
  readonly person?: 'A' | 'B' | 'gemeinsam' | undefined
  readonly provenanceLabel: string
  readonly screen: Screen
  readonly field?: string | undefined
}

export interface GlassFormSection {
  readonly formId: string
  readonly title: string
  readonly subtitle: string
  readonly rows: readonly GlassFormRow[]
}

/** What every section builder needs besides its own data. */
export interface GlassRowContext {
  readonly year: number
  readonly isJoint: boolean
  readonly partnerName: string
  readonly tr: LiveRowContext['tr']
  /** The provenance badge of the mask field a row leads to. */
  readonly prov: (screen: Screen, field?: string) => string
}

/** The printed values of the year, as the printout API answers them. */
export interface GlassLiveValues {
  readonly forms: readonly LiveFormDto[]
  /** Without printed values the rows fall back to the masks' figures. */
  readonly hasLive: boolean
  readonly settled: boolean
}

/** The context of the live rows of one person's copy. */
export function liveRowContextOf(ctx: GlassRowContext, person: 'A' | 'B'): LiveRowContext {
  return { year: ctx.year, person, tr: ctx.tr, prov: ctx.prov }
}
