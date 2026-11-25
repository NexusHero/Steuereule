import { fireEvent, screen } from '@testing-library/react'
import type { DestructiveActionId } from './destructiveActions'

/** The confirmation dialog of `id`, or null while it is closed (WEB-37, WEB-38). */
export function confirmDialogOf(id: DestructiveActionId): HTMLElement | null {
  return screen.queryByTestId(`rueckfrage-${id}`)
}

/**
 * Answers the confirmation of `id` with „confirm“ when it is open. A press the screen refused before asking
 * (an unreadable date, a disabled button) opens no dialog, so there is nothing to answer.
 */
export function confirmAction(id: DestructiveActionId): void {
  const button = screen.queryByTestId(`rueckfrage-${id}-confirm`)
  if (button !== null) fireEvent.click(button)
}
