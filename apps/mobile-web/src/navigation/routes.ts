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
export type PartnerAreaParam = 'lstb' | 'arbeitsweg'

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
  Partner: { year: number; area: PartnerAreaParam }
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

export type AppTabParamList = {
  Cockpit: NavigatorScreenParams<CockpitStackParamList> | undefined
  Owl: undefined
  Receipts: undefined
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
