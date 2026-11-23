import type { Answers, Conflict, Notice } from '@steuereule/core'
import type { Breakpoint } from '@steuereule/ui'
import type { PartnerAreaParam } from '../../navigation/routes'
import type { FunnelPath } from '../funnel/KontoWandScreen'
import type { StromStep } from '../strom/stromPlan'
import type { TileDefinition, TileFacts } from './tiles'

export interface CockpitScreenProps {
  readonly taxYear?: number
  readonly isSignedIn?: boolean
  /** The session is still resolving: no guest „Weiter“ button for a user who may well be signed in. */
  readonly sessionPending?: boolean
  readonly onOpenInterview?: () => void
  readonly onOpenAssessment?: () => void
  readonly onOpenCapital?: () => void
  readonly onOpenRental?: () => void
  readonly onOpenKinder?: () => void
  /** Opens the official Vordrucke on their own screen. */
  readonly onOpenOfficialForm?: (year: number) => void
  readonly onOpenOwlMode?: (year: number) => void
  /** Opens the Belege tab: the cockpit says how many documents wait there. */
  readonly onOpenReceipts?: () => void
  readonly onOpenPrintout?: (year: number) => void
  readonly onOpenSubmission?: (year: number) => void
  /** A year with self-employment is filed through Mein ELSTER: the way forward leads to the fill-in help (ADR-0101 §16). */
  readonly onOpenElsterHelp?: (year: number) => void
  readonly onOpenConfirmation?: (year: number) => void
  readonly onContinuePath?: (path: FunnelPath) => void
  readonly onOpenTile?: (tile: TileDefinition, revisit: boolean) => void
  readonly onOpenPartner?: (area: PartnerAreaParam, name: string) => void
  readonly onYearChange?: (year: number) => void
  readonly onOpenMasterData?: () => void
  /** The Strom (ADR-0089): „Weiter“ leads to its next open step instead of the next tile. */
  readonly onOpenStrom?: (step: StromStep) => void
}

export interface Next {
  readonly label: string
  readonly onPress: () => void
  readonly missingFields?: readonly string[]
}

export interface PlausibilityFindings {
  readonly conflicts: readonly Conflict[]
  readonly notices: readonly Notice[]
}

export interface PullToRefresh {
  readonly pulling: boolean
  readonly onPull: () => void
}

export interface CockpitEmptyProps {
  readonly year: number
  /** The year is filed through Mein ELSTER (self-employment): said in one line above the work area. */
  readonly filedViaElster?: boolean
  readonly onYearChange: (year: number) => void
  readonly refresh: PullToRefresh
  readonly isRefreshing: boolean
  readonly next: Next | null
  readonly tileFacts: TileFacts | null
  readonly isSignedIn: boolean
  readonly isJointMarried: boolean
  readonly partnerName: string
  readonly findings: PlausibilityFindings
  readonly onOpenTile: (tile: TileDefinition, revisit: boolean) => void
  readonly onOpenPartner?: (area: PartnerAreaParam, name: string) => void
  readonly onOpenSubmission?: () => void
  readonly masterData: Next | null
  readonly onOpenInterview: () => void
  readonly onOpenAssessment: () => void
  readonly onOpenCapital: () => void
  readonly onOpenRental: () => void
  readonly onOpenKinder?: () => void
  readonly onOpenOwlMode?: () => void
  readonly onOpenPrintout?: () => void
  readonly onOpenOfficialForm?: () => void
  readonly bp: Breakpoint
  readonly deadlineAnswers: Answers | null
  readonly progress: Progress | null
  readonly onOpenReceipts?: () => void
}

export interface Progress {
  readonly done: number
  readonly total: number
}
