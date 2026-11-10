// Test stand-in for expo-clipboard (#451 slice 1b): the real module pulls in expo-modules-core,
// which needs the Metro/Expo globals (`__DEV__`) jsdom does not have. Like expo-clipboard's own
// web implementation, it writes through the browser Clipboard API, so tests stub
// `navigator.clipboard` and assert on what was copied.
export async function setStringAsync(text: string): Promise<boolean> {
  if (!globalThis.navigator?.clipboard) return false
  await globalThis.navigator.clipboard.writeText(text)
  return true
}
