import { describe, it, expect } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { HerkunftsChip } from './HerkunftsChip'
import { renderUi } from '../test-utils'

const quelle = {
  beleg: 'Jahressteuerbescheinigung Bank',
  regel: 'SCHÄTZ-01 · Stand 2026',
  rechenweg: 'Spanne = offene Angaben × 60 €',
}

describe('HerkunftsChip', () => {
  it('shows_the_german_label_by_default', () => {
    renderUi(<HerkunftsChip quelle={quelle} />)
    expect(screen.getByText('Herkunft')).toBeTruthy()
  })

  it('shows_the_english_label_when_switched', () => {
    renderUi(<HerkunftsChip quelle={quelle} />, { lng: 'en' })
    expect(screen.getByText('Origin')).toBeTruthy()
  })

  it('is_collapsed_until_pressed', () => {
    renderUi(<HerkunftsChip quelle={quelle} />)
    expect(screen.queryByText(quelle.regel)).toBeNull()
  })

  it('reveals_the_origin_on_press', () => {
    renderUi(<HerkunftsChip quelle={quelle} />)
    fireEvent.click(screen.getByText('Herkunft'))
    expect(screen.getByText(quelle.regel)).toBeTruthy()
    expect(screen.getByText(quelle.beleg)).toBeTruthy()
    expect(screen.getByText(quelle.rechenweg)).toBeTruthy()
  })

  it('keeps_the_beleg_tax_term_german_in_english_mode', () => {
    renderUi(<HerkunftsChip quelle={quelle} />, { lng: 'en' })
    fireEvent.click(screen.getByText('Origin'))
    // "Beleg" is a German tax term — kept in both locales (ADR-0006).
    expect(screen.getByText('Beleg:')).toBeTruthy()
    // ...while the generic label is translated.
    expect(screen.getByText('Rule:')).toBeTruthy()
  })

  it('omits_optional_fields_when_absent', () => {
    renderUi(<HerkunftsChip quelle={{ regel: 'NUR-REGEL' }} />)
    fireEvent.click(screen.getByText('Herkunft'))
    expect(screen.getByText('NUR-REGEL')).toBeTruthy()
    expect(screen.queryByText('Beleg:')).toBeNull()
  })
})
