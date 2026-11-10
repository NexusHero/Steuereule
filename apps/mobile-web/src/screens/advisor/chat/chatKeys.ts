/**
 * Keyboard and layout rules for every chat input (#451 decision 3): on a computer Enter sends and
 * Shift+Enter breaks the line; on a phone Enter always breaks the line and only the button sends.
 */

export type ChatInputPlatform = 'desktop' | 'touch'
export type ChatKeyAction = 'send' | 'newline' | 'stop' | 'none'

export interface ChatKeyEvent {
  readonly key: string
  readonly shiftKey?: boolean | undefined
  readonly isComposing?: boolean | undefined
}

export const COMPOSER_MAX_LINES = 5

export function chatKeyAction(event: ChatKeyEvent, platform: ChatInputPlatform): ChatKeyAction {
  if (event.key === 'Escape') return 'stop'
  if (event.key !== 'Enter') return 'none'
  if (event.isComposing) return 'none'
  if (platform === 'touch' || event.shiftKey) return 'newline'
  return 'send'
}

/** A phone or tablet (coarse pointer, no hover) behaves like a touch keyboard, even in the browser. */
export function detectChatInputPlatform(os: string): ChatInputPlatform {
  if (os !== 'web') return 'touch'
  const mql = typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia : null
  if (mql === null) return 'desktop'
  return mql('(hover: none) and (pointer: coarse)').matches ? 'touch' : 'desktop'
}

/** The input grows with its content up to five lines, then scrolls inside itself. */
export function clampComposerHeight(contentHeight: number, lineHeight: number): number {
  return Math.min(Math.max(contentHeight, lineHeight), lineHeight * COMPOSER_MAX_LINES)
}

export interface ScrollMetrics {
  readonly offsetY: number
  readonly viewportHeight: number
  readonly contentHeight: number
}

/** Auto-scroll follows the growing answer only while the reader is already at the bottom. */
export function isNearBottom(metrics: ScrollMetrics, threshold = 48): boolean {
  return metrics.contentHeight - (metrics.offsetY + metrics.viewportHeight) <= threshold
}
