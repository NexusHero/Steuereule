/**
 * Puts text on the clipboard where the platform has one (the web). Native has no
 * `navigator.clipboard`, and a refused write is a rejected promise, not a throw: in both cases
 * nothing happens, and the text stays on screen to copy by hand.
 */
export async function copyText(text: string): Promise<void> {
  await globalThis.navigator?.clipboard?.writeText(text).catch(() => undefined)
}
