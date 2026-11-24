// WEB-40 / NM-05: removing a route that holds a mask — the sheet's X, the browser's back, „Später weiter“ — waits
// for the mask's pending saves, and stays once when one failed, so the failure is seen instead of lost.
import { useEffect } from 'react'
import { Text } from 'react-native'
import { describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { LeaveGuardProvider } from '../screens/shared/leaveGuard'
import { usePendingMutations } from '../screens/shared/usePendingMutations'
import { useRemovalGuard } from './useRemovalGuard'

type Params = { Home: undefined; Mask: undefined }
const Stack = createNativeStackNavigator<Params>()
const ref = createNavigationContainerRef<Params>()

let settle: { resolve: () => void; reject: () => void } = { resolve: () => {}, reject: () => {} }

function Home() {
  return <Text>Cockpit</Text>
}

function MaskWithPendingSave() {
  const { track, saveError } = usePendingMutations()
  useEffect(() => {
    track(
      new Promise<void>((resolve, reject) => {
        settle = { resolve, reject: () => reject(new Error('lost')) }
      }),
    )
  }, [track])
  return <Text>{saveError === null ? 'Maske' : 'Nicht gespeichert'}</Text>
}

function MaskRoute({ navigation }: NativeStackScreenProps<Params, 'Mask'>) {
  const guard = useRemovalGuard(navigation)
  return (
    <LeaveGuardProvider host={guard}>
      <MaskWithPendingSave />
    </LeaveGuardProvider>
  )
}

function renderStack() {
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <NavigationContainer ref={ref} initialState={{ routes: [{ name: 'Home' }, { name: 'Mask' }] }}>
        <Stack.Navigator>
          <Stack.Screen name="Home" component={Home} />
          <Stack.Screen name="Mask" component={MaskRoute} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>,
  )
}

describe('useRemovalGuard', () => {
  it('leaves only once the pending save succeeded', async () => {
    renderStack()
    await screen.findByText('Maske')
    act(() => ref.goBack())
    expect(ref.getCurrentRoute()?.name).toBe('Mask')
    await act(async () => settle.resolve())
    await waitFor(() => expect(ref.getCurrentRoute()?.name).toBe('Home'))
  })

  it('stays once when the save failed, shows it, and leaves on the second try', async () => {
    renderStack()
    await screen.findByText('Maske')
    act(() => ref.goBack())
    await act(async () => settle.reject())
    expect(await screen.findByText('Nicht gespeichert')).toBeTruthy()
    expect(ref.getCurrentRoute()?.name).toBe('Mask')
    act(() => ref.goBack())
    await waitFor(() => expect(ref.getCurrentRoute()?.name).toBe('Home'))
  })
})
