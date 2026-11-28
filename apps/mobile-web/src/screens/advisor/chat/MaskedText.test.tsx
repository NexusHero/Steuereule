import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderInApp } from '../../../../test/test-render'
import { MaskedNote, MaskedText } from './MaskedText'

const TEXT = 'Meine IBAN ist DE89 3704, Anna zahlt mit.'
const IBAN = { start: 15, end: 24, as: '[IBAN-GESCHÜTZT]' }
const ANNA = { start: 26, end: 30, as: 'Person B' }

describe('a message with what did not go to the model', () => {
  it('is the plain text where nothing was changed', () => {
    const view = renderInApp(<MaskedText text={TEXT} spans={[]} />)
    expect(view.container.textContent).toBe(TEXT)
    expect(screen.queryByTestId('advisor-masked')).toBeNull()
  })

  it('strikes through what was taken out, where it stands, and keeps the rest', () => {
    const view = renderInApp(<MaskedText text={TEXT} spans={[IBAN]} />)
    const struck = screen.getByTestId('advisor-masked')
    expect(struck.textContent).toBe('DE89 3704')
    // That it is drawn struck through is checked in the browser (owl gate, Row M): jsdom computes no styles.
    expect(struck.getAttribute('aria-label')).toBe('nicht weitergegeben: DE89 3704')
    // A stand-in says nothing the strike-through does not: the text reads as written.
    expect(view.container.textContent).toBe(TEXT)
  })

  it('shows what the model read instead when that is more than a stand-in', () => {
    const view = renderInApp(<MaskedText text={TEXT} spans={[IBAN, ANNA]} />)
    expect(screen.getAllByTestId('advisor-masked').map((node) => node.textContent)).toEqual(['DE89 3704', 'Anna'])
    expect(view.container.textContent).toBe('Meine IBAN ist DE89 3704, Anna → Person B zahlt mit.')
  })
})

describe('the note under such a message', () => {
  it('says what the strike-through means, in the chat and in a spoken conversation', () => {
    const chat = renderInApp(<MaskedNote spans={[IBAN]} />)
    expect(screen.getByTestId('advisor-masked-note').textContent).toBe('Durchgestrichenes ging nicht an das Sprachmodell.')
    chat.unmount()
    renderInApp(<MaskedNote spans={[IBAN]} conversation />)
    expect(screen.getByTestId('advisor-masked-note').textContent).toMatch(/ging nicht an das Sprachmodell der Eule\. Der Sprachdienst hat es zur Erkennung gehört\./)
  })

  it('is absent where nothing was changed', () => {
    renderInApp(<MaskedNote spans={[]} />)
    renderInApp(<MaskedNote spans={undefined} />)
    expect(screen.queryByTestId('advisor-masked-note')).toBeNull()
  })
})
