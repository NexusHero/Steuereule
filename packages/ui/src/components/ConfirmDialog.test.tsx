import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { ConfirmDialog } from './ConfirmDialog'
import { renderUi } from '../test-utils'

function dialog(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  renderUi(
    <ConfirmDialog
      title="Kind löschen?"
      body="Lena und alle Angaben zu ihr werden aus 2025 gelöscht."
      confirmLabel="Löschen"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  )
  return { onConfirm, onCancel }
}

describe('ConfirmDialog (WEB-37, WEB-38)', () => {
  it('is a modal alert dialog named by its question and described by what is lost', () => {
    dialog()
    const box = screen.getByRole('alertdialog')
    expect(box.getAttribute('aria-modal')).toBe('true')
    const title = document.getElementById(box.getAttribute('aria-labelledby') ?? '')
    const body = document.getElementById(box.getAttribute('aria-describedby') ?? '')
    expect(title?.textContent).toBe('Kind löschen?')
    expect(body?.textContent).toBe('Lena und alle Angaben zu ihr werden aus 2025 gelöscht.')
  })

  it('starts on the safe choice: the focus is on „Abbrechen“', () => {
    dialog()
    expect(document.activeElement).toBe(screen.getByTestId('confirm-dialog-cancel'))
    expect(screen.getByTestId('confirm-dialog-cancel').textContent).toBe('Abbrechen')
  })

  it('confirms only on the confirm button', () => {
    const { onConfirm, onCancel } = dialog()
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancels on „Abbrechen“, on the backdrop and on Escape', () => {
    const { onConfirm, onCancel } = dialog()
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'))
    fireEvent.click(screen.getByTestId('confirm-dialog-backdrop'))
    fireEvent.keyUp(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(3)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('speaks English when the interface is English', () => {
    const onCancel = vi.fn()
    renderUi(<ConfirmDialog title="Delete?" body="Gone." confirmLabel="Delete" onConfirm={() => {}} onCancel={onCancel} />, { lng: 'en' })
    expect(screen.getByTestId('confirm-dialog-cancel').textContent).toBe('Cancel')
  })
})
