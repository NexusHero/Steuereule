// A screen reduced to its seam, for the tests of the app shell's routes. It imports nothing of the shell, so a
// module mock can load it while the shell's own modules are still being mocked.
import { Pressable, Text, View } from 'react-native'

/** What a test presses a stand-in's callback with: `stubArgs.set('cockpit.onOpenStrom', [step])`. */
export const stubArgs = new Map<string, readonly unknown[]>()

/** A screen reduced to its seam: its plain props as text and one button per callback prop. */
const idOf = (name: string, part?: string) => (part === undefined ? `stub-${name}` : `stub-${name}-${part}`)

export function stubScreen(name: string) {
  return function StubScreen(props: Record<string, unknown>) {
    const plain = Object.fromEntries(Object.entries(props).filter(([, value]) => typeof value !== 'function'))
    return (
      <View testID={idOf(name)}>
        <Text testID={idOf(name, 'props')}>{JSON.stringify(plain)}</Text>
        {Object.entries(props)
          .filter(([, value]) => typeof value === 'function')
          .map(([key, value]) => (
            <Pressable key={key} accessibilityRole="button" testID={idOf(name, key)} onPress={() => (value as (...args: unknown[]) => void)(...(stubArgs.get(`${name}.${key}`) ?? []))}>
              <Text>{key}</Text>
            </Pressable>
          ))}
      </View>
    )
  }
}

