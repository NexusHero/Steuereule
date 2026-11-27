import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { SideNav } from './SideNav'
import { TabBar, type TabItem } from './TabBar'
import { renderUi } from '../test-utils'

const TABS: TabItem[] = [
  { id: 'cockpit', label: 'Cockpit' },
  { id: 'eule', label: 'Eule', badge: 'neue Antwort' },
]

// A tab can say that something waits behind it (an answer that arrived while the user was elsewhere).
// The mark is a dot for the eye and words for assistive tech: the tab's name becomes "Eule, neue Antwort".
describe.each([
  ['the floating bar', () => <TabBar tabs={TABS} active="cockpit" onChange={() => {}} />],
  ['the side rail', () => <SideNav tabs={TABS} active="cockpit" onChange={() => {}} />],
  ['the narrow side rail', () => <SideNav tabs={TABS} active="cockpit" onChange={() => {}} compact />],
])('a tab badge in %s', (_name, ui) => {
  it('names what waits, as part of the tab’s name', () => {
    renderUi(ui())
    expect(screen.getByRole('tab', { name: 'Eule, neue Antwort' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Cockpit' })).toBeTruthy()
  })

  it('draws one dot, on the tab that has the badge', () => {
    renderUi(ui())
    const dots = screen.getAllByTestId('tab-badge')
    expect(dots).toHaveLength(1)
    expect(screen.getByRole('tab', { name: 'Eule, neue Antwort' }).contains(dots[0]!)).toBe(true)
    expect(dots[0]!.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('a tab without a badge', () => {
  it('reads as its label alone', () => {
    renderUi(<TabBar tabs={[{ id: 'eule', label: 'Eule' }]} active="eule" onChange={() => {}} />)
    expect(screen.getByRole('tab').textContent).toBe('Eule')
    expect(screen.queryByTestId('tab-badge')).toBeNull()
  })
})
