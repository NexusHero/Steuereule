import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack'
import { ProfileScreen } from '../screens/ProfileScreen'
import { PrivacyScreen } from '../screens/PrivacyScreen'
import { SecurityScreen } from '../screens/security/SecurityScreen'
import { MasterDataScreen } from '../screens/master-data/MasterDataScreen'
import { useShellState } from './ShellState'
import { RequiresAccount } from './RequiresAccount'
import { renderActiveStackRoute } from './guards'
import type { ProfileStackParamList } from './routes'

const Stack = createNativeStackNavigator<ProfileStackParamList>()

type Props<T extends keyof ProfileStackParamList> = NativeStackScreenProps<ProfileStackParamList, T>

function ProfileHomeRoute({ navigation }: Props<'ProfileHome'>) {
  const { onSignedOut } = useShellState()
  return (
    <ProfileScreen
      onOpenPrivacy={() => navigation.navigate('Privacy')}
      onOpenSecurity={() => navigation.navigate('Security')}
      onOpenMasterData={() => navigation.navigate('ProfileMasterData')}
      onSignedOut={onSignedOut}
    />
  )
}

function PrivacyRoute({ navigation }: Props<'Privacy'>) {
  const { onSignedOut } = useShellState()
  return <PrivacyScreen onBack={() => navigation.navigate('ProfileHome', undefined, { pop: true })} onAccountDeleted={onSignedOut} />
}

function SecurityRoute({ navigation }: Props<'Security'>) {
  return (
    <RequiresAccount>
      <SecurityScreen onBack={() => navigation.navigate('ProfileHome', undefined, { pop: true })} />
    </RequiresAccount>
  )
}

function ProfileMasterDataRoute({ navigation }: Props<'ProfileMasterData'>) {
  return (
    <RequiresAccount>
      <MasterDataScreen onBack={() => navigation.navigate('ProfileHome', undefined, { pop: true })} />
    </RequiresAccount>
  )
}

export function ProfileStack() {
  return (
    <Stack.Navigator initialRouteName="ProfileHome" screenOptions={{ headerShown: false }} screenLayout={renderActiveStackRoute}>
      <Stack.Screen name="ProfileHome" component={ProfileHomeRoute} />
      <Stack.Screen name="Privacy" component={PrivacyRoute} />
      <Stack.Screen name="Security" component={SecurityRoute} />
      <Stack.Screen name="ProfileMasterData" component={ProfileMasterDataRoute} />
    </Stack.Navigator>
  )
}
