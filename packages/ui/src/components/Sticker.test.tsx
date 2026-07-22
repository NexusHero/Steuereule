import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { Sticker } from './Sticker'
import { renderUi } from '../test-utils'

describe('Sticker', () => {
  it('renders_a_delta', () => {
    renderUi(<Sticker>+122 €</Sticker>)
    expect(screen.getByText('+122 €')).toBeTruthy()
  })
})
