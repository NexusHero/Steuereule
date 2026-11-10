import * as Clipboard from 'expo-clipboard'

/** Copies text on web (Clipboard API) and native alike; false when the platform refuses. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    return await Clipboard.setStringAsync(text)
  } catch {
    return false
  }
}
