// WEB-40: every navigator guards every route; a mask needs no container of its own to hold the user while a
// save is on its way, and a departure that must not wait (an expired session) passes.
import { useEffect } from 'react'
import { Text } from 'react-native'
import { describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { leaveWithoutGuards } from '../screens/shared/leaveGuard'
import { usePendingMutations } from '../screens/shared/usePendingMutations'
import { guardedRoute, guardedStackRoute } from './guardedRoute'

type Params = { Home: undefined; Printout: undefined }
const Stack = createNativeStackNavigator<Params>()
const ref = createNavigationContainerRef<Params>()

let finishSave: () => void = () => {}

function Home() {
  return <Text>Start</Text>
}

/** A mask as the printout route shows it: no sheet, no provider of its own. */
function BareMask() {
  const { track } = usePendingMutations()
  useEffect(() => {
    track(new Promise<void>((resolve) => (finishSave = resolve)))
  }, [track])
  return <Text>Maske</Text>
}

function renderStack(layout: typeof guardedRoute) {
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <NavigationContainer ref={ref} initialState={{ routes: [{ name: 'Home' }, { name: 'Printout' }] }}>
        <Stack.Navigator screenLayout={layout}>
          <Stack.Screen name="Home" component={Home} />
          <Stack.Screen name="Printout" component={BareMask} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>,
  )
}

describe.each([
  ['guardedRoute', guardedRoute],
  ['guardedStackRoute', guardedStackRoute],
])('%s', (_name, layout) => {
  it('holds the back of a route whose mask has a save on its way, until it settled', async () => {
    renderStack(layout)
    await screen.findByText('Maske')
    act(() => ref.goBack())
    expect(ref.getCurrentRoute()?.name).toBe('Printout')
    await act(async () => finishSave())
    await waitFor(() => expect(ref.getCurrentRoute()?.name).toBe('Home'))
  })

  it('lets a departure through that must not wait', async () => {
    renderStack(layout)
    await screen.findByText('Maske')
    act(() => leaveWithoutGuards(() => ref.reset({ index: 0, routes: [{ name: 'Home' }] })))
    expect(ref.getCurrentRoute()?.name).toBe('Home')
  })
})
