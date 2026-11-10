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
import { OwlGlyph, TabBar, TAB_ICON_PATHS, tabBarClearance, useTheme, type TabItem } from '@steuereule/ui'
import { APP_NS } from '../i18n/resources'
import { TabIcon } from '../icons/TabIcon'
import { useAccountSession } from '../auth/useAccountSession'
import { OwlModeScreen } from '../screens/advisor/OwlModeScreen'
import { ReceiptsScreen } from '../screens/receipts/ReceiptsScreen'
import { CockpitStack } from './CockpitStack'
import { ProfileStack } from './ProfileStack'
import { useShellState } from './ShellState'
import type { AppTabParamList } from './routes'

type TabId = 'cockpit' | 'eule' | 'belege' | 'profil'
type TabRouteName = keyof AppTabParamList

const TAB_ROUTE_FOR_ID: Readonly<Record<TabId, TabRouteName>> = {
  cockpit: 'Cockpit',
  eule: 'Owl',
  belege: 'Receipts',
  profil: 'Profile',
}

const TAB_ID_FOR_ROUTE: Readonly<Record<TabRouteName, TabId>> = {
  Cockpit: 'cockpit',
  Owl: 'eule',
  Receipts: 'belege',
  Profile: 'profil',
}

const Tab = createBottomTabNavigator<AppTabParamList>()

function isTabBarVisible(state: TabNavigationState<AppTabParamList>): boolean {
  const activeTabRoute = state.routes[state.index]
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

function FloatingTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)

  if (!isTabBarVisible(state as TabNavigationState<AppTabParamList>)) return null

  const activeRouteName = (state.routes[state.index]?.name ?? 'Cockpit') as TabRouteName
  const activeTab = TAB_ID_FOR_ROUTE[activeRouteName]
  const iconColor = (id: TabId) => (id === activeTab ? t.color.tinte : t.color.tinte2)

  const tabs: TabItem[] = [
    { id: 'cockpit', label: tr('tabs.cockpit'), icon: <TabIcon path={TAB_ICON_PATHS.cockpit} color={iconColor('cockpit')} /> },
    {
      id: 'eule',
      label: tr('tabs.eule'),
      icon: <OwlGlyph size={22} ink={iconColor('eule')} ground={activeTab === 'eule' ? t.color.funke : t.color.karte} testID="tab-icon-eule" />,
    },
    { id: 'belege', label: tr('tabs.belege'), icon: <TabIcon path={TAB_ICON_PATHS.belege} color={iconColor('belege')} /> },
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

  return <TabBar tabs={tabs} active={activeTab} onChange={handleChange} bottomInset={insets.bottom} />
}

function OwlRoute({ navigation }: BottomTabScreenProps<AppTabParamList, 'Owl'>) {
  const { taxYear, onRegister, onLogin } = useShellState()
  const { state: sessionState } = useAccountSession()
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

  return (
    <Tab.Navigator
      initialRouteName="Cockpit"
      layout={({ state, navigation, children }) => (
        <TabNavigatorSync state={state} navigation={navigation}>
          {children}
        </TabNavigatorSync>
      )}
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={({ navigation }) => {
        const tabState = navigation.getState() as TabNavigationState<AppTabParamList>
        const showsTabBar = isTabBarVisible(tabState)
        return {
          headerShown: false,
          sceneStyle: {
            flex: 1,
            backgroundColor: t.color.grund,
            paddingBottom: showsTabBar ? tabBarClearance(t, insets.bottom) : 0,
            display: navigation.isFocused() ? 'flex' : 'none',
          },
        }
      }}
    >
      <Tab.Screen name="Cockpit" component={CockpitStack} />
      <Tab.Screen name="Owl" component={OwlRoute} />
      <Tab.Screen name="Receipts" component={ReceiptsScreen} />
      <Tab.Screen name="Profile" component={ProfileStack} />
    </Tab.Navigator>
  )
}
