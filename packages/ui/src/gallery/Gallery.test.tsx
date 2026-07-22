import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { Gallery } from './Gallery'
import { renderUi } from '../test-utils'

describe('Gallery', () => {
  it('renders_every_component_section', () => {
    renderUi(<Gallery />)
    // The hero range, a button variant and the provenance chip all present = the gallery mounts.
    expect(screen.getByText('1.227–1.587 €')).toBeTruthy()
    expect(screen.getByText('Berater')).toBeTruthy()
    expect(screen.getByText('2026')).toBeTruthy()
  })
})
