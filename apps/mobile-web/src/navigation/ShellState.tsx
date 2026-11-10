import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { NavigationHelpers } from '@react-navigation/native'
import { CURRENT_TAX_YEAR, SELECTABLE_TAX_YEARS } from '../config/taxYear'
import type { FunnelPath } from '../screens/funnel/KontoWandScreen'
import { rememberTaxYear, rememberedTaxYear } from '../screens/funnel/sessionMemory'
import type { AppTabParamList, CockpitStackParamList, PartnerAreaParam } from './routes'

export interface PartnerTarget {
  readonly area: PartnerAreaParam
  readonly name: string
}

export interface ShellStateValue {
  readonly taxYear: number
  readonly setTaxYear: (year: number) => void
  readonly funnelPath: FunnelPath
  readonly setFunnelPath: (path: FunnelPath) => void
  readonly pendingPath: FunnelPath | null
  readonly setPendingPath: (path: FunnelPath | null) => void
  readonly partner: PartnerTarget | null
  readonly setPartner: (partner: PartnerTarget | null) => void
  readonly focusedTab: keyof AppTabParamList
  readonly setFocusedTab: (tab: keyof AppTabParamList) => void
  readonly registerTabNavigator: (nav: NavigationHelpers<AppTabParamList> | null) => void
  readonly switchToTab: (tab: keyof AppTabParamList) => void
  readonly openCockpitScreen: <RouteName extends keyof CockpitStackParamList>(
    screen: RouteName,
    ...args: CockpitStackParamList[RouteName] extends undefined ? [] : [params: CockpitStackParamList[RouteName]]
  ) => void
  readonly consumeStartInterview: () => boolean
  readonly onRegister: () => void
  readonly onLogin: () => void
  readonly onSignedOut: () => void
  readonly onOpenPrintout: ((year: number) => void) | undefined
  readonly onOpenConfirmation: ((year: number) => void) | undefined
}

const ShellStateContext = createContext<ShellStateValue | null>(null)

export interface ShellStateProviderProps {
  readonly startInInterview?: boolean
  readonly onRegister: () => void
  readonly onLogin: () => void
  readonly onSignedOut: () => void
  readonly onOpenPrintout?: (year: number) => void
  readonly onOpenConfirmation?: (year: number) => void
  readonly children: ReactNode
}

export function ShellStateProvider({
  startInInterview = false,
  onRegister,
  onLogin,
  onSignedOut,
  onOpenPrintout,
  onOpenConfirmation,
  children,
}: ShellStateProviderProps) {
  const [taxYear, setTaxYearState] = useState(() => rememberedTaxYear(CURRENT_TAX_YEAR, SELECTABLE_TAX_YEARS))
  const [funnelPath, setFunnelPath] = useState<FunnelPath>('angestellte')
  const [pendingPath, setPendingPath] = useState<FunnelPath | null>(null)
  // ADR-0054: Person A records a partner's figures (no own account) without putting the name in the URL.
  const [partner, setPartner] = useState<PartnerTarget | null>(null)
  const [focusedTab, setFocusedTab] = useState<keyof AppTabParamList>('Cockpit')
  const startInterviewPendingRef = useRef(startInInterview)
  const tabNavRef = useRef<NavigationHelpers<AppTabParamList> | null>(null)

  const setTaxYear = useCallback((year: number) => {
    rememberTaxYear(year)
    setTaxYearState(year)
  }, [])

  const registerTabNavigator = useCallback((nav: NavigationHelpers<AppTabParamList> | null) => {
    tabNavRef.current = nav
  }, [])

  const switchToTab = useCallback((tab: keyof AppTabParamList) => {
    tabNavRef.current?.navigate(tab as never)
  }, [])

  const openCockpitScreen = useCallback<ShellStateValue['openCockpitScreen']>((screen, ...args) => {
    const params = args[0]
    tabNavRef.current?.navigate('Cockpit', (params === undefined ? { screen } : { screen, params }) as never)
  }, [])

  const consumeStartInterview = useCallback(() => {
    if (!startInterviewPendingRef.current) return false
    startInterviewPendingRef.current = false
    return true
  }, [])

  const value = useMemo<ShellStateValue>(
    () => ({
      taxYear,
      setTaxYear,
      funnelPath,
      setFunnelPath,
      pendingPath,
      setPendingPath,
      partner,
      setPartner,
      focusedTab,
      setFocusedTab,
      registerTabNavigator,
      switchToTab,
      openCockpitScreen,
      consumeStartInterview,
      onRegister,
      onLogin,
      onSignedOut,
      onOpenPrintout,
      onOpenConfirmation,
    }),
    [
      taxYear,
      setTaxYear,
      funnelPath,
      pendingPath,
      partner,
      focusedTab,
      registerTabNavigator,
      switchToTab,
      openCockpitScreen,
      consumeStartInterview,
      onRegister,
      onLogin,
      onSignedOut,
      onOpenPrintout,
      onOpenConfirmation,
    ],
  )

  return <ShellStateContext.Provider value={value}>{children}</ShellStateContext.Provider>
}

export function useShellState(): ShellStateValue {
  const ctx = useContext(ShellStateContext)
  if (ctx === null) {
    throw new Error('useShellState() must be used inside <ShellStateProvider>.')
  }
  return ctx
}
