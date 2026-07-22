import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { Pill } from './Pill'
import { renderUi } from '../test-utils'

describe('Pill', () => {
  it('renders_its_label', () => {
    renderUi(<Pill>2026</Pill>)
    expect(screen.getByText('2026')).toBeTruthy()
  })
})
