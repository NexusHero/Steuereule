// Browser test 18.11.2026: a Swiss salary draft read „Im Pauschbetrag (1.230 €)“ and „Nicht erfasst → 119580“.
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { useTheme } from '@steuereule/ui'
import type { AdvisorActionProposal } from '@steuereule/core'
import { renderInApp } from '../../../../test/test-render'
import { makeStyles } from '../AdvisorChatPanel.styles'
import { ActionProposalCardView } from './ProposalCards'

// Testing Library collapses the no-break space between amount and currency to a plain space.

const SALARY_DRAFT: AdvisorActionProposal = {
  actionId: 'act-ch-1',
  status: 'pending',
  screen: 'chLohnausweis',
  field: 'bruttolohn-total',
  instance: null,
  label: 'Ziffer 8: Bruttolohn total',
  previousValue: null,
  expectedPreviousValue: null,
  newValue: '119580',
  beforeRefundEur: 0,
  afterRefundEur: 0,
  deltaEur: 0,
  reason: 'Aus dem Lohnausweis gelesen.',
  sourceId: 'estg-9-1',
  paragraph: '§ 9 Abs. 1 EStG',
}

function Card({ action }: { readonly action: AdvisorActionProposal }) {
  const styles = makeStyles(useTheme())
  return <ActionProposalCardView action={action} onSelectSource={vi.fn()} styles={styles} />
}

describe('ActionProposalCardView', () => {
  it('does not call a Swiss wage „im Pauschbetrag“ and shows it in CHF', () => {
    renderInApp(<Card action={SALARY_DRAFT} />)
    expect(screen.queryByTestId('advisor-action-pauschbetrag-badge')).toBeNull()
    expect(screen.getByText('119.580 CHF')).toBeTruthy()
  })

  it('still names the Pauschbetrag for a work expense that changes nothing', () => {
    renderInApp(<Card action={{ ...SALARY_DRAFT, screen: 'commute', field: 'workEquipmentEur', newValue: '480', previousValue: '120' }} />)
    expect(screen.getByTestId('advisor-action-pauschbetrag-badge')).toBeTruthy()
    expect(screen.getByText('480 €')).toBeTruthy()
    expect(screen.getByText(/120 € →/)).toBeTruthy()
  })
})
