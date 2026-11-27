import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { View } from 'react-native'
import { Button } from './Button'
import { Option } from './Option'
import { renderUi } from '../test-utils'

const icon = <View aria-hidden testID="icon" style={{ width: 20, height: 20 }} />

describe('leading icons', () => {
  it('Button: the icon sits before the label, the label stays the name', () => {
    renderUi(<Button variant="ghost" icon={icon}>Bescheid prüfen</Button>)
    const button = screen.getByRole('button', { name: 'Bescheid prüfen' })
    expect(button.firstElementChild).toBe(screen.getByTestId('icon'))
    expect(getComputedStyle(button).flexDirection).toBe('row')
  })

  it('Button: without an icon nothing changes', () => {
    renderUi(<Button>Weiter</Button>)
    expect(screen.getByRole('button', { name: 'Weiter' }).children).toHaveLength(1)
  })

  it('Option: icon and label share a row, the chosen option keeps its check', () => {
    renderUi(<Option selected icon={icon}>Angestellt</Option>)
    const option = screen.getByRole('button', { name: /Angestellt/ })
    const row = screen.getByTestId('icon').parentElement!
    expect(getComputedStyle(row).flexDirection).toBe('row')
    expect(row.textContent).toBe('Angestellt')
    expect(option.getAttribute('aria-pressed')).toBe('true')
    expect(option.textContent).toContain('✓')
  })

  it('Option: without an icon the label renders as before', () => {
    renderUi(<Option>Rente</Option>)
    expect(screen.getByRole('button', { name: 'Rente' }).textContent).toBe('Rente')
  })
})
