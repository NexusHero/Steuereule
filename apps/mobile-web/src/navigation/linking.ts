import type { LinkingOptions, PathConfig } from '@react-navigation/native'
import type { AppTabParamList, CockpitStackParamList, ProfileStackParamList, RootStackParamList } from './routes'

const cockpitScreens: NonNullable<PathConfig<CockpitStackParamList>['screens']> = {
  CockpitHome: '',
  Interview: { path: 'steuerjahr/:year/interview', parse: { year: Number } },
  AccountWall: 'konto-wand',
  Lstb: { path: 'steuerjahr/:year/lstb', parse: { year: Number } },
  Pension: { path: 'steuerjahr/:year/rente', parse: { year: Number } },
  CrossBorder: { path: 'steuerjahr/:year/schweiz', parse: { year: Number } },
  Catalog: {
    path: 'steuerjahr/:year/katalog/:entry',
    parse: {
      year: Number,
      revisit: (v: string) => v === '1',
    },
    stringify: {
      revisit: (v: boolean) => (v ? '1' : ''),
    },
  },
  Workdays: { path: 'steuerjahr/:year/arbeitstage', parse: { year: Number } },
  Submission: { path: 'steuerjahr/:year/abgabe', parse: { year: Number } },
  Plausibility: { path: 'steuerjahr/:year/plausibilitaet', parse: { year: Number } },
  FilingTypeComparison: { path: 'steuerjahr/:year/veranlagungsvergleich', parse: { year: Number } },
  Assessment: { path: 'steuerjahr/:year/bescheid', parse: { year: Number } },
  Capital: { path: 'steuerjahr/:year/kapital', parse: { year: Number } },
  Rental: { path: 'steuerjahr/:year/vermietung', parse: { year: Number } },
  Children: { path: 'steuerjahr/:year/kinder', parse: { year: Number } },
  CockpitMasterData: { path: 'steuerjahr/:year/stammdaten', parse: { year: Number } },
  Partner: { path: 'steuerjahr/:year/partner/:area', parse: { year: Number } },
}

const profileScreens: NonNullable<PathConfig<ProfileStackParamList>['screens']> = {
  ProfileHome: '',
  Privacy: 'datenschutz',
  Security: 'sicherheit',
  ProfileMasterData: 'stammdaten',
}

const appConfig: PathConfig<AppTabParamList> = {
  path: 'app',
  initialRouteName: 'Cockpit',
  screens: {
    Cockpit: {
      path: '',
      initialRouteName: 'CockpitHome',
      screens: cockpitScreens,
    } as PathConfig<CockpitStackParamList> as never,
    Owl: 'eule',
    Receipts: 'belege',
    Profile: {
      path: 'profil',
      initialRouteName: 'ProfileHome',
      screens: profileScreens,
    } as PathConfig<ProfileStackParamList> as never,
  },
}

const rootScreens: Record<keyof RootStackParamList, unknown> = {
  Splash: '',
  Login: 'login',
  Registration: 'registrierung',
  Onboarding: 'onboarding',
  App: appConfig,
  Device: 'device',
  Legal: 'rechtliches/:page',
  Printout: 'app/steuerjahr/:year/ausdruck',
  Confirmation: 'app/steuerjahr/:year/bestaetigung',
  OauthConsent: 'oauth/consent',
}

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [],
  config: {
    screens: rootScreens,
  } as NonNullable<LinkingOptions<RootStackParamList>['config']>,
}
