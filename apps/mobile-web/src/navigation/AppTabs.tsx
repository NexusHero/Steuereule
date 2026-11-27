import { guardedRoute } from './guardedRoute'
import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { createBottomTabNavigator, type BottomTabBarProps, type BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import {
  getFocusedRouteNameFromRoute,
  StackActions,
  type NavigationHelpers,
  type TabNavigationState,
} from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, View } from 'react-native'
import { OwlGlyph, SideNav, TabBar, TAB_ICON_PATHS, inkOnFunke, sideNavWidth, tabBarClearance, useBreakpoint, useTheme, type TabItem } from '@steuereule/ui'
import { APP_NS } from '../i18n/resources'
import { TabIcon } from '../icons/TabIcon'
import { OwlMark } from '../marks/OwlMark'
import { useAccountSession } from '../auth/useAccountSession'
import { ErrorState, LoadingState } from '../screens/shared/ScreenState'
import { OwlModeScreen } from '../screens/advisor/OwlModeScreen'
import { ReceiptsScreen } from '../screens/receipts/ReceiptsScreen'
import { CockpitStack } from './CockpitStack'
import { HistoryStack } from './HistoryStack'
import { ProfileStack } from './ProfileStack'
import { useShellState } from './ShellState'
import { isSheetRouteName, type AppTabParamList } from './routes'

type TabId = 'cockpit' | 'eule' | 'belege' | 'verlauf' | 'profil'
type TabRouteName = keyof AppTabParamList

const TAB_ROUTE_FOR_ID: Readonly<Record<TabId, TabRouteName>> = {
  cockpit: 'Cockpit',
  eule: 'Owl',
  belege: 'Receipts',
  verlauf: 'History',
  profil: 'Profile',
}

const TAB_ID_FOR_ROUTE: Readonly<Record<TabRouteName, TabId>> = {
  Cockpit: 'cockpit',
  Owl: 'eule',
  Receipts: 'belege',
  History: 'verlauf',
  Profile: 'profil',
}

const Tab = createBottomTabNavigator<AppTabParamList>()

function isTabBarVisible(state: TabNavigationState<AppTabParamList>): boolean {
  const activeTabRoute = state.routes[state.index]
  if (activeTabRoute?.name === 'Cockpit') {
    const focusedCockpit = getFocusedRouteNameFromRoute(activeTabRoute) ?? 'CockpitHome'
    return !isSheetRouteName(focusedCockpit)
  }
  if (activeTabRoute?.name !== 'Profile') return true
  const focusedProfile = getFocusedRouteNameFromRoute(activeTabRoute) ?? 'ProfileHome'
  return focusedProfile === 'ProfileHome'
}

function TabNavigatorSync({
  state,
  navigation,
  children,
}: {
  readonly state: TabNavigationState<AppTabParamList>
  readonly navigation: NavigationHelpers<AppTabParamList>
  readonly children: ReactNode
}) {
  const { registerTabNavigator, setFocusedTab } = useShellState()
  const activeName = state.routes[state.index]?.name ?? 'Cockpit'

  useEffect(() => {
    registerTabNavigator(navigation)
    return () => registerTabNavigator(null)
  }, [navigation, registerTabNavigator])

  useEffect(() => {
    setFocusedTab(activeName)
  }, [activeName, setFocusedTab])

  return <>{children}</>
}

/**
 * The form of the app's navigation per breakpoint (Graphit): the floating bar on a phone, a narrow
 * rail (icon over label) on a tablet, the full rail with the brand on a desktop.
 */
type NavigationForm = 'bar' | 'compact' | 'wide'
/**
 * The owl is chat-first (#476): beside its own conversation list a full rail would leave the chat
 * 60 % of a desktop window. On the owl's tab the rail therefore stays narrow at every width.
 */
function navigationForm(bp: ReturnType<typeof useBreakpoint>, tab: TabRouteName): NavigationForm {
  if (bp === 's') return 'bar'
  return bp === 'l' && tab !== 'Owl' ? 'wide' : 'compact'
}

function AppNavigation({ state, navigation, insets }: BottomTabBarProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const bp = useBreakpoint()

  if (!isTabBarVisible(state as TabNavigationState<AppTabParamList>)) return null

  const activeRouteName = (state.routes[state.index]?.name ?? 'Cockpit') as TabRouteName
  const form = navigationForm(bp, activeRouteName)
  const rail = form !== 'bar'
  const activeTab = TAB_ID_FOR_ROUTE[activeRouteName]
  // The bar marks the picked tab with a lime pill, the rail with a quiet surface: the icon follows its ground.
  const iconColor = (id: TabId) => (id === activeTab ? (rail ? t.color.tinte : inkOnFunke(t)) : t.color.tinte2)
  const owlGround = activeTab === 'eule' ? (rail ? t.color.linieWeich : t.color.funke) : rail ? t.color.grund : t.color.karte

  const tabs: TabItem[] = [
    { id: 'cockpit', label: tr('tabs.cockpit'), icon: <TabIcon path={TAB_ICON_PATHS.cockpit} color={iconColor('cockpit')} /> },
    {
      id: 'eule',
      label: tr('tabs.eule'),
      icon: <OwlGlyph size={22} ink={iconColor('eule')} ground={owlGround} testID="tab-icon-eule" />,
    },
    { id: 'belege', label: tr('tabs.belege'), icon: <TabIcon path={TAB_ICON_PATHS.belege} color={iconColor('belege')} /> },
    { id: 'verlauf', label: tr('tabs.verlauf'), icon: <TabIcon path={TAB_ICON_PATHS.verlauf} color={iconColor('verlauf')} /> },
    { id: 'profil', label: tr('tabs.profil'), icon: <TabIcon path={TAB_ICON_PATHS.profil} color={iconColor('profil')} /> },
  ]

  function handleChange(id: string) {
    const routeName = TAB_ROUTE_FOR_ID[id as TabId]
    const targetRoute = state.routes.find((r) => r.name === routeName)
    if (!targetRoute) return

    const event = navigation.emit({
      type: 'tabPress',
      target: targetRoute.key,
      canPreventDefault: true,
    })
    if (event.defaultPrevented) return

    const isFocused = state.index === state.routes.indexOf(targetRoute)
    if (isFocused) {
      // Prevent NativeStack's built-in rAF tabPress listener from firing a second delayed POP_TO_TOP.
      event.preventDefault()
      const nested = targetRoute.state
      if (nested?.key && nested.routes.length > 1) {
        navigation.dispatch({ ...StackActions.popToTop(), target: nested.key })
      } else if (targetRoute.name === 'Cockpit') {
        const activeChild = nested?.routes[nested.index ?? 0]?.name ?? 'CockpitHome'
        if (activeChild !== 'CockpitHome') navigation.navigate('Cockpit', { screen: 'CockpitHome' })
      } else if (targetRoute.name === 'Profile') {
        const activeChild = nested?.routes[nested.index ?? 0]?.name ?? 'ProfileHome'
        if (activeChild !== 'ProfileHome') navigation.navigate('Profile', { screen: 'ProfileHome' })
      }
      return
    }
    navigation.navigate(targetRoute.name)
  }

  if (rail) {
    const compact = form === 'compact'
    const brand = (
      // Without the written name the owl alone is the brand: then it is an image with that name
      // (a label on a plain group is not allowed, WCAG 4.1.2).
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.s3 }} {...(compact ? { role: 'img' as const, 'aria-label': `${tr('brand.steuer')}${tr('brand.eule')}` } : {})}>
        <OwlMark size={30} variant="tinte" />
        {compact ? null : <Text style={{ ...t.type.cardTitle, color: t.color.tinte }}>{`${tr('brand.steuer')}${tr('brand.eule')}`}</Text>}
      </View>
    )
    return <SideNav tabs={tabs} active={activeTab} onChange={handleChange} header={brand} compact={compact} insets={insets} testID="app-seitennavigation" />
  }
  return <TabBar tabs={tabs} active={activeTab} onChange={handleChange} bottomInset={insets.bottom} />
}

function OwlRoute({ navigation }: BottomTabScreenProps<AppTabParamList, 'Owl'>) {
  const { taxYear, onRegister, onLogin } = useShellState()
  const { state: sessionState, retry } = useAccountSession()
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  // NR-16: while the session is checked the guest gate must not flash, and a check that failed (offline/5xx)
  // is not "Dafür brauchst du ein Konto" for a signed-in user.
  if (sessionState.status === 'loading') return <LoadingState bp={bp} label={tr('eule.loading')} />
  if (sessionState.status === 'unknown') {
    return (
      <ErrorState
        bp={bp}
        heading={tr('apiFehler.loadHeading')}
        message={tr(sessionState.reason === 'unreachable' ? 'apiFehler.offline' : 'apiFehler.server')}
        retryLabel={tr('apiFehler.retry')}
        onRetry={() => void retry()}
      />
    )
  }
  return (
    <OwlModeScreen
      taxYear={taxYear}
      isGuest={sessionState.status !== 'signed-in'}
      onRegister={onRegister}
      onLogin={onLogin}
      onDone={() => navigation.navigate('Cockpit')}
    />
  )
}

export function AppTabs() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const bp = useBreakpoint()

  return (
    <Tab.Navigator
      initialRouteName="Cockpit"
      screenLayout={guardedRoute}
      layout={({ state, navigation, children }) => (
        <TabNavigatorSync state={state} navigation={navigation}>
          {children}
        </TabNavigatorSync>
      )}
      tabBar={(props) => <AppNavigation {...props} />}
      screenOptions={({ navigation, route }) => {
        const form = navigationForm(bp, route.name)
        const tabState = navigation.getState() as TabNavigationState<AppTabParamList>
        const showsTabBar = isTabBarVisible(tabState)
        return {
          headerShown: false,
          sceneStyle: {
            flex: 1,
            backgroundColor: t.color.grund,
            // The navigation takes its room from the screen: under it as a bar, left of it as a rail.
            paddingBottom: showsTabBar && form === 'bar' ? tabBarClearance(t, insets.bottom) : 0,
            paddingLeft: showsTabBar && form !== 'bar' ? sideNavWidth(form === 'compact', insets.left) : 0,
            // Keep inactive tabs hidden in layout/focus order and jsdom visibility checks (BottomTabView
            // only toggles zIndex and aria-hidden when react-native-screens is inactive on web).
            display: navigation.isFocused() ? 'flex' : 'none',
          },
        }
      }}
    >
      <Tab.Screen name="Cockpit" component={CockpitStack} />
      <Tab.Screen name="Owl" component={OwlRoute} />
      <Tab.Screen name="Receipts" component={ReceiptsScreen} />
      <Tab.Screen name="History" component={HistoryStack} />
      <Tab.Screen name="Profile" component={ProfileStack} />
    </Tab.Navigator>
  )
}
