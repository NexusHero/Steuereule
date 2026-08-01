// Task 1a (#238) — router feasibility proof, and nothing else.
//
// The one open question ADR-0023 (Option B) leaves is whether `@react-navigation/native` runs
// at all under *this* app's test harness — Vitest + jsdom, not Metro/`jest-expo`. This module
// answers exactly that, in isolation: one `NavigationContainer`, one `linking` config, two
// throwaway screens that carry no product meaning. It is deliberately not wired into `App.tsx`
// and imports no #238 feature code — that wiring is task 1b, gated on this proof passing.
//
// Do not extend this file with real screens, real copy, or a real route table. If task 1a
// passes, this module is superseded by 1b's actual `Stage` -> `Route` rework at the composition
// root and can be retired then.
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Text, View } from 'react-native'

type ProofStackParamList = {
  ProofScreenA: undefined
  ProofScreenB: undefined
}

const ProofStack = createNativeStackNavigator<ProofStackParamList>()

function ProofScreenA() {
  return (
    <View>
      <Text>proof-screen-a</Text>
    </View>
  )
}

function ProofScreenB() {
  return (
    <View>
      <Text>proof-screen-b</Text>
    </View>
  )
}

/** Maps `/` to A and `/nav-proof` to B — the one URL->screen resolution task 1a exists to prove. */
export const routerFeasibilityProofLinking: LinkingOptions<ProofStackParamList> = {
  prefixes: [],
  config: {
    screens: {
      ProofScreenA: '',
      ProofScreenB: 'nav-proof',
    },
  },
}

export function RouterFeasibilityProof() {
  return (
    <SafeAreaProvider>
      <NavigationContainer linking={routerFeasibilityProofLinking}>
        <ProofStack.Navigator screenOptions={{ headerShown: false }}>
          <ProofStack.Screen name="ProofScreenA" component={ProofScreenA} />
          <ProofStack.Screen name="ProofScreenB" component={ProofScreenB} />
        </ProofStack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}
