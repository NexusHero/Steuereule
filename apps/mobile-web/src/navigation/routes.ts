import type { NavigatorScreenParams } from '@react-navigation/native'
import type { LegalPage } from '../screens/legal/texts'

export type CatalogEntryParam =
  | 'lebenslagen'
  | 'einkuenfte'
  | 'sonderausgaben'
  | 'alleinerziehend'
  | 'haushalt'
  | 'gesundheit'
  | 'vorauszahlungen'
export type PartnerAreaParam = 'lstb' | 'arbeitsweg' | 'schweiz' | 'rente'

export type CockpitStackParamList = {
  CockpitHome: undefined
  Interview: { year: number }
  AccountWall: undefined
  Lstb: { year: number }
  Pension: { year: number }
  CrossBorder: { year: number }
  Catalog: { year: number; entry: CatalogEntryParam; revisit?: boolean }
  Workdays: { year: number }
  Submission: { year: number }
  Plausibility: { year: number }
  FilingTypeComparison: { year: number }
  Assessment: { year: number }
  Capital: { year: number }
  Rental: { year: number }
  Children: { year: number }
  CockpitMasterData: { year: number }
  /** The official Vordrucke on their own screen; `form` opens one first, e.g. `anlage-n`. */
  OfficialForm: { year: number; form?: string }
  Partner: { year: number; area: PartnerAreaParam }
  /** The Strom (ADR-0089): one address segment per step, e.g. `spenden` or `auswahl`. */
  Strom: { year: number; step: string }
  /** The self-employed area (ADR-0101): `page` is one address segment (`buch`, `bank`, `elster` ...), none is the overview. */
  /** `zahlung` is the query parameter of the Stripe return URL (`erfolg`). */
  Business: { year: number; page?: string; person?: 'A' | 'B'; zahlung?: string }
}

export const SHEET_ROUTE_NAMES: readonly (keyof CockpitStackParamList)[] = [
  'Lstb',
  'CrossBorder',
  'Pension',
  'Catalog',
  'Workdays',
  'Capital',
  'Rental',
  'Children',
  'Partner',
]

export function isSheetRouteName(name: string | undefined): boolean {
  return name !== undefined && (SHEET_ROUTE_NAMES as readonly string[]).includes(name)
}

export type ProfileStackParamList = {
  ProfileHome: undefined
  Privacy: undefined
  Security: undefined
  ProfileMasterData: undefined
}

/** The Verlauf (ADR-0098): the timeline, one year's page, and the development over the years. */
export type HistoryStackParamList = {
  HistoryHome: undefined
  HistoryYear: { year: number }
  HistoryDevelopment: undefined
  /** The Bescheide, the time to them and the Einsprüche (ADR-0099 §9). */
  HistoryDocuments: undefined
}

export type AppTabParamList = {
  Cockpit: NavigatorScreenParams<CockpitStackParamList> | undefined
  Owl: undefined
  Receipts: undefined
  /** The Verlauf over all years (ADR-0098); it took over the year list. */
  History: NavigatorScreenParams<HistoryStackParamList> | undefined
  Profile: NavigatorScreenParams<ProfileStackParamList> | undefined
}

export type RootStackParamList = {
  Splash: undefined
  Login: undefined
  Registration: undefined
  Onboarding: undefined
  App: { start?: 'interview' } | (NavigatorScreenParams<AppTabParamList> & { start?: 'interview' }) | undefined
  Device: { user_code?: string } | undefined
  Legal: { page: LegalPage }
  // `zahlung` is the query parameter in the Stripe return URL; it stays as the API writes it.
  Printout: { year: string; payment?: string }
  Confirmation: { year: string }
  OauthConsent: { client_id?: string; scope?: string } | undefined
}
