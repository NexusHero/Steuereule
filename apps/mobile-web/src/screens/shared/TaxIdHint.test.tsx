import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithQuery } from '../../../test/test-render'
import { TaxIdHint } from './TaxIdHint'

const CHECK_FAILED = 'Diese Steuer-ID kann so nicht stimmen. Prüf bitte die Ziffern auf dem Brief vom Bundeszentralamt für Steuern.'
const NOT_ELEVEN_DIGITS = 'Eine Steuer-ID besteht aus genau 11 Ziffern, ohne Buchstaben oder andere Zeichen.'

describe('TaxIdHint (#67)', () => {
  it('says a mistyped digit in other words than an entry that is not eleven digits', () => {
    const { unmount } = renderWithQuery(<TaxIdHint value="86095742718" testID="hint" />)
    expect(screen.getByTestId('hint').textContent).toBe(CHECK_FAILED)
    unmount()

    renderWithQuery(<TaxIdHint value="860957427190" testID="hint" />)
    expect(screen.getByTestId('hint').textContent).toBe(NOT_ELEVEN_DIGITS)
  })

  it('says nothing about a valid number, and nothing while it is still being typed', () => {
    const { unmount } = renderWithQuery(<TaxIdHint value="86 095 742 719" testID="hint" />)
    expect(screen.queryByTestId('hint')).toBeNull()
    unmount()

    renderWithQuery(<TaxIdHint value="86 095 742" testID="hint" />)
    expect(screen.queryByTestId('hint')).toBeNull()
  })
})
