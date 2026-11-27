import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Option, ThemeProvider } from '@steuereule/ui'
import { interviewOptionIcon } from './optionIcons'

describe('interview option icons', () => {
  it.each(['Angestellt', 'Selbstständig', 'Beides', 'Rente'])('"%s" has an icon: where the money came from is recognised at a glance', (value) => {
    expect(interviewOptionIcon('job', value, false)).toBeDefined()
  })

  it.each([['ausland', 'Nein'], ['kinder', '1 Kind'], ['familienstand', 'Ledig'], ['job', 'Unbekannt']])('%s / "%s" has none: no picture everyone reads the same way', (id, value) => {
    expect(interviewOptionIcon(id, value, false)).toBeUndefined()
  })

  it('the icon is decoration: the option keeps its word as its name', () => {
    const { getByRole } = render(
      <ThemeProvider mode="light">
        <Option icon={interviewOptionIcon('job', 'Angestellt', false)}>Angestellt</Option>
      </ThemeProvider>,
    )
    const option = getByRole('button', { name: 'Angestellt' })
    expect(option.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
})
