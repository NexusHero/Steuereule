import { describe, it, expect } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { ProvenanceChip } from './HerkunftsChip'
import { renderUi } from '../test-utils'

const source = {
  receipt: 'Jahressteuerbescheinigung Bank',
  rule: 'SCHÄTZ-01 · Stand 2026',
  calculationPath: 'Spanne = offene Angaben × 60 €',
}

describe('HerkunftsChip', () => {
  it('shows_the_german_label_by_default', () => {
    renderUi(<ProvenanceChip source={source} />)
    expect(screen.getByText('Herkunft')).toBeTruthy()
  })

  it('shows_the_english_label_when_switched', () => {
    renderUi(<ProvenanceChip source={source} />, { lng: 'en' })
    expect(screen.getByText('Origin')).toBeTruthy()
  })

  it('is_collapsed_until_pressed', () => {
    renderUi(<ProvenanceChip source={source} />)
    expect(screen.queryByText(source.rule)).toBeNull()
  })

  it('reveals_the_origin_on_press', () => {
    renderUi(<ProvenanceChip source={source} />)
    fireEvent.click(screen.getByText('Herkunft'))
    expect(screen.getByText(source.rule)).toBeTruthy()
    expect(screen.getByText(source.receipt)).toBeTruthy()
    expect(screen.getByText(source.calculationPath)).toBeTruthy()
  })

  it('keeps_the_beleg_tax_term_german_in_english_mode', () => {
    renderUi(<ProvenanceChip source={source} />, { lng: 'en' })
    fireEvent.click(screen.getByText('Origin'))
    // "Beleg" is a German tax term — kept in both locales (ADR-0006).
    expect(screen.getByText('Beleg:')).toBeTruthy()
    // ...while the generic label is translated.
    expect(screen.getByText('Rule:')).toBeTruthy()
  })

  it('omits_optional_fields_when_absent', () => {
    renderUi(<ProvenanceChip source={{ rule: 'NUR-REGEL' }} />)
    fireEvent.click(screen.getByText('Herkunft'))
    expect(screen.getByText('NUR-REGEL')).toBeTruthy()
    expect(screen.queryByText('Beleg:')).toBeNull()
  })
})
