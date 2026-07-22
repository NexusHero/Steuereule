import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { AiChip } from './AiChip'
import { renderUi } from '../test-utils'

describe('AiChip', () => {
  it('renders_label_and_owl_mark', () => {
    renderUi(<AiChip>Berater</AiChip>)
    expect(screen.getByText('Berater')).toBeTruthy()
    // The "B" owl dot marks KI output — violet is AI-only.
    expect(screen.getByText('B')).toBeTruthy()
  })
})
