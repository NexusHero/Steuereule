import { fireEvent, screen } from '@testing-library/react'
import type { DestructiveActionId } from '../src/confirm/destructiveActions'

/** The confirmation dialog of `id`, or null while it is closed (WEB-37, WEB-38). */
export function confirmDialogOf(id: DestructiveActionId): HTMLElement | null {
  return screen.queryByTestId(`rueckfrage-${id}`)
}

/**
 * Answers the open confirmation of `id` with „confirm“. Fails when the dialog is not open: a screen that
 * stopped asking must not pass its tests. A press the screen refuses before asking is asserted with
 * `expect(confirmDialogOf(id)).toBeNull()`.
 */
export function confirmAction(id: DestructiveActionId): void {
  fireEvent.click(screen.getByTestId(`rueckfrage-${id}-confirm`))
}
