import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { Text } from 'react-native'
import { Card } from './Card'
import { renderUi } from '../test-utils'

describe('Card', () => {
  it.each(['default', 'nacht', 'ai'] as const)('renders_children_in_%s_variant', (variant) => {
    renderUi(
      <Card variant={variant}>
        <Text>Voraussichtliche Erstattung</Text>
      </Card>,
    )
    expect(screen.getByText('Voraussichtliche Erstattung')).toBeTruthy()
  })

  it('renders_in_dark_mode', () => {
    renderUi(
      <Card variant="nacht">
        <Text>Nacht</Text>
      </Card>,
      { mode: 'dark' },
    )
    expect(screen.getByText('Nacht')).toBeTruthy()
  })
})
