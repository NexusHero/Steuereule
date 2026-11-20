import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useTheme } from '@steuereule/ui'
import type { AdvisorActionProposal, AdvisorTwoPathsProposal } from '@steuereule/core'
import { renderInApp } from '../../../test-render'
import { makeStyles } from '../AdvisorChatPanel.styles'
import { ActionProposalCardView, ScannedCertificateCardView, TwoPathsCardView } from './ProposalCards'

const draft = (extra: Partial<AdvisorActionProposal> = {}): AdvisorActionProposal => ({
  actionId: 'act-1',
  status: 'pending',
  screen: 'interview',
  field: 'spenden',
  instance: null,
  label: 'Spenden',
  previousValue: '50',
  expectedPreviousValue: null,
  newValue: '200',
  beforeRefundEur: 100,
  afterRefundEur: 160,
  deltaEur: 60,
  reason: 'Quittung vom Roten Kreuz.',
  sourceId: 'estg-10b',
  paragraph: '§ 10b EStG',
  ...extra,
})

type Handler = (actionId: string) => Promise<void> | void
interface CardProps {
  readonly action: AdvisorActionProposal
  readonly onApply?: Handler
  readonly onUndo?: Handler
  readonly onDismiss?: Handler
  readonly onInspectMask?: (screen: string, field?: string) => void
  readonly receiptLinked?: boolean
  readonly partnerName?: string
  readonly ownName?: string
  readonly jointReturn?: boolean
  readonly onSelectSource?: () => void
}

function Card({ onSelectSource = vi.fn(), ...props }: CardProps) {
  const styles = makeStyles(useTheme())
  return <ActionProposalCardView {...(props as Parameters<typeof ActionProposalCardView>[0])} onSelectSource={onSelectSource} styles={styles} />
}

describe('the effect on the tax, as the card says it', () => {
  it('names an effect that cannot be computed yet, with its hint', () => {
    renderInApp(<Card action={draft({ effect: 'not-computable', effectHint: 'Es fehlt das Jahreseinkommen.' })} />)
    expect(screen.getByTestId('advisor-action-effect-open')).toBeDefined()
    expect(screen.getByTestId('advisor-action-effect-hint').textContent).toBe('Es fehlt das Jahreseinkommen.')
  })

  it('names a computed effect that costs the user money, and one that changes nothing', () => {
    const negative = renderInApp(<Card action={draft({ effect: 'computed', deltaEur: -45 })} />)
    expect(screen.getByTestId('advisor-action-delta-negative').textContent).toContain('45')
    negative.unmount()
    renderInApp(<Card action={draft({ effect: 'computed', deltaEur: 0 })} />)
    expect(screen.getByTestId('advisor-action-effect-none')).toBeDefined()
  })

  it('shows a plus for a draft that raises the effect and nothing for one without effect', () => {
    const plus = renderInApp(<Card action={draft({ deltaEur: 60 })} />)
    expect(screen.getByTestId('advisor-action-delta').textContent).toContain('60')
    plus.unmount()
    renderInApp(<Card action={draft({ deltaEur: 0 })} />)
    expect(screen.queryByTestId('advisor-action-delta')).toBeNull()
    expect(screen.queryByTestId('advisor-action-pauschbetrag-badge')).toBeNull()
  })

  it('shows "nicht erfasst" when there was no earlier value', () => {
    renderInApp(<Card action={draft({ previousValue: null })} />)
    expect(screen.getByText(/Nicht erfasst/)).toBeDefined()
  })
})

describe('whose value the card writes', () => {
  it('names the spouse for a draft for Person B, and falls back to "Person B" without a name', () => {
    const named = renderInApp(<Card action={draft({ person: 'B' })} partnerName=" Mira " />)
    expect(screen.getByTestId('advisor-action-person').textContent).toContain('Mira')
    named.unmount()
    renderInApp(<Card action={draft({ person: 'B' })} />)
    expect(screen.getByTestId('advisor-action-person').textContent).toContain('Person B')
  })

  it('names the user on a spouse mask of a joint return, by name or as "dich"', () => {
    const named = renderInApp(<Card action={draft({ screen: 'lstb' })} jointReturn ownName="Jan" />)
    expect(screen.getByTestId('advisor-action-person').textContent).toContain('Jan')
    named.unmount()
    renderInApp(<Card action={draft({ screen: 'lstb' })} jointReturn />)
    expect(screen.getByTestId('advisor-action-person').textContent).toContain('dich')
  })

  it('says nothing about a person outside a joint return', () => {
    renderInApp(<Card action={draft({ screen: 'lstb' })} />)
    expect(screen.queryByTestId('advisor-action-person')).toBeNull()
  })
})

describe('the links on the card', () => {
  it('marks a draft that comes with a receipt', () => {
    renderInApp(<Card action={draft()} receiptLinked />)
    expect(screen.getByTestId('advisor-action-receipt-badge')).toBeDefined()
  })

  it('opens the mask from the form line and from the button, and the legal source on its pill', () => {
    const onInspectMask = vi.fn()
    const onSelectSource = vi.fn()
    renderInApp(<Card action={draft()} onInspectMask={onInspectMask} onSelectSource={onSelectSource} />)
    fireEvent.click(screen.getByTestId('advisor-action-form-line'))
    fireEvent.click(screen.getByTestId('advisor-action-inspect-mask-btn'))
    expect(onInspectMask).toHaveBeenNthCalledWith(1, 'interview', 'spenden')
    expect(onInspectMask).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByText(/§ 10b/))
    expect(onSelectSource).toHaveBeenCalledOnce()
  })

  it('has no button to the mask where none is wired', () => {
    renderInApp(<Card action={draft()} />)
    expect(screen.queryByTestId('advisor-action-inspect-mask-btn')).toBeNull()
  })
})

describe('applying, dismissing and undoing', () => {
  it('applies a pending draft once, however often it is pressed while it is working', async () => {
    let finish: () => void = () => {}
    const onApply = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    renderInApp(<Card action={draft()} onApply={onApply} />)
    fireEvent.click(screen.getByTestId('advisor-action-apply-btn'))
    fireEvent.click(screen.getByTestId('advisor-action-apply-btn'))
    expect(onApply).toHaveBeenCalledTimes(1)
    finish()
    await waitFor(() => expect(screen.getByTestId('advisor-action-apply-btn').getAttribute('aria-disabled')).not.toBe('true'))
  })

  it('offers "erneut übernehmen" for an undone draft', () => {
    renderInApp(<Card action={draft({ status: 'undone' })} onApply={vi.fn()} />)
    expect(screen.getByTestId('advisor-action-apply-btn').textContent).toContain('Erneut')
  })

  it('dismisses a pending draft, and shows the badge once it is dismissed', async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined)
    const pending = renderInApp(<Card action={draft()} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByTestId('advisor-action-dismiss-btn'))
    await waitFor(() => expect(onDismiss).toHaveBeenCalledWith('act-1'))
    pending.unmount()
    renderInApp(<Card action={draft({ status: 'dismissed' })} onDismiss={onDismiss} />)
    expect(screen.getByTestId('advisor-action-dismissed-badge')).toBeDefined()
    expect(screen.queryByTestId('advisor-action-dismiss-btn')).toBeNull()
  })

  it('shows a replaced draft as replaced', () => {
    renderInApp(<Card action={draft({ status: 'superseded' })} />)
    expect(screen.getByTestId('advisor-action-superseded-badge')).toBeDefined()
  })

  it('undoes an applied draft, and shows no undo where none is wired', async () => {
    const onUndo = vi.fn().mockResolvedValue(undefined)
    const wired = renderInApp(<Card action={draft({ status: 'applied' })} onUndo={onUndo} />)
    expect(screen.getByTestId('advisor-action-applied-badge')).toBeDefined()
    fireEvent.click(screen.getByTestId('advisor-action-undo-btn'))
    await waitFor(() => expect(onUndo).toHaveBeenCalledWith('act-1'))
    wired.unmount()
    renderInApp(<Card action={draft({ status: 'applied' })} />)
    expect(screen.queryByTestId('advisor-action-undo-btn')).toBeNull()
  })

  it('does nothing when the handlers are missing', () => {
    renderInApp(<Card action={draft()} />)
    expect(() => fireEvent.click(screen.getByTestId('advisor-action-apply-btn'))).not.toThrow()
  })
})

describe('two paths and the scanned certificate', () => {
  const twoPaths: AdvisorTwoPathsProposal = {
    title: 'Zwei Wege',
    sourceId: 'estg-4-5-6c',
    safePath: draft({ actionId: 'p-safe' }),
    maxPath: { ...draft({ actionId: 'p-max' }), evidenceHint: 'Nachweis nötig' } as AdvisorTwoPathsProposal['maxPath'],
  }

  it('marks the path that comes with a receipt', () => {
    function Paths() {
      return <TwoPathsCardView twoPaths={twoPaths} onSelectSource={vi.fn()} styles={makeStyles(useTheme())} receiptLinkedActionIds={new Set(['p-max'])} />
    }
    renderInApp(<Paths />)
    expect(screen.getByTestId('advisor-path-max-receipt-badge')).toBeDefined()
    expect(screen.queryByTestId('advisor-path-safe-receipt-badge')).toBeNull()
  })

  const row = (field: string, extra: Partial<AdvisorActionProposal> = {}) => draft({ actionId: `s-${field}`, screen: 'lstb', field, label: field, newValue: '1000', ...extra })

  function Scan(props: { actions: AdvisorActionProposal[]; onInspectMask?: (screen: string) => void }) {
    return <ScannedCertificateCardView actions={props.actions} onInspectMask={props.onInspectMask as never} styles={makeStyles(useTheme())} />
  }

  it('lists what was read, flags what needs a look, and leads to the review', () => {
    const onInspectMask = vi.fn()
    renderInApp(
      <Scan
        actions={[row('bruttoarbeitslohn', { confidenceStatus: 'pruefen' }), row('lohnsteuer', { newValue: '' }), row('soli', { confidenceStatus: 'ok' })]}
        onInspectMask={onInspectMask}
      />,
    )
    expect(screen.getByTestId('advisor-lstb-scan-status-bruttoarbeitslohn').textContent).toBe('bitte prüfen')
    expect(screen.getByTestId('advisor-lstb-scan-status-soli').textContent).toBe('sicher gelesen')
    expect(screen.getByTestId('advisor-lstb-scan-row-lohnsteuer').textContent).toContain('nicht gelesen')
    fireEvent.click(screen.getByTestId('advisor-lstb-scan-review'))
    expect(onInspectMask).toHaveBeenCalledWith('lstb')
  })

  it('says a certificate was taken over once nothing is pending, and offers no review without a mask', () => {
    const done = renderInApp(<Scan actions={[row('lohnsteuer', { status: 'applied' })]} onInspectMask={vi.fn()} />)
    expect(screen.getByTestId('advisor-lstb-scan-applied')).toBeDefined()
    done.unmount()
    renderInApp(<Scan actions={[row('lohnsteuer')]} />)
    expect(screen.queryByTestId('advisor-lstb-scan-review')).toBeNull()
  })

  it('points at the question "zusätzlich oder ersetzen" when a value is recorded already, and hides the added rows', () => {
    renderInApp(<Scan actions={[row('lohnsteuer', { combination: 'add' }), row('soli', { combination: 'replace' })]} onInspectMask={vi.fn()} />)
    expect(screen.getByTestId('advisor-lstb-scan-kombination')).toBeDefined()
    expect(screen.queryByTestId('advisor-lstb-scan-row-lohnsteuer')).toBeNull()
    expect(screen.getByTestId('advisor-lstb-scan-row-soli')).toBeDefined()
  })
})

describe('a draft that changes while its button is still working', () => {
  /** The screen's owner marks the draft as it was answered, while the request is still open. */
  function Owned({ first, handler }: { readonly first: AdvisorActionProposal['status']; readonly handler: 'apply' | 'dismiss' | 'undo' }) {
    const [status, setStatus] = useState<AdvisorActionProposal['status']>(first)
    const settle = (next: AdvisorActionProposal['status']) => () => new Promise<void>((resolve) => {
      setStatus(next)
      setTimeout(resolve, 0)
    })
    const handlers = {
      apply: { onApply: settle('applied') },
      dismiss: { onDismiss: settle('dismissed') },
      undo: { onUndo: settle('undone') },
    }[handler]
    return <Card action={draft({ status })} {...handlers} onDismiss={handlers.onDismiss ?? settle('dismissed')} />
  }

  it.each([
    ['apply', 'pending', 'advisor-action-apply-btn', 'advisor-action-applied-badge'],
    ['dismiss', 'pending', 'advisor-action-dismiss-btn', 'advisor-action-dismissed-badge'],
    ['undo', 'applied', 'advisor-action-undo-btn', 'advisor-action-apply-btn'],
  ] as const)('shows the new state of the draft after %s, not a stale busy one', async (handler, first, button, expected) => {
    renderInApp(<Owned first={first} handler={handler} />)
    fireEvent.click(screen.getByTestId(button))
    expect(await screen.findByTestId(expected)).toBeDefined()
    await waitFor(() => expect(screen.getByTestId(expected).getAttribute('aria-disabled')).not.toBe('true'))
  })

  it('ignores a second press of dismiss and undo while the first is working', async () => {
    let finish: () => void = () => {}
    const onDismiss = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    const onUndo = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    const dismiss = renderInApp(<Card action={draft()} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByTestId('advisor-action-dismiss-btn'))
    fireEvent.click(screen.getByTestId('advisor-action-dismiss-btn'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    finish()
    dismiss.unmount()
    renderInApp(<Card action={draft({ status: 'applied' })} onUndo={onUndo} />)
    fireEvent.click(screen.getByTestId('advisor-action-undo-btn'))
    fireEvent.click(screen.getByTestId('advisor-action-undo-btn'))
    expect(onUndo).toHaveBeenCalledTimes(1)
    finish()
  })

  it('keeps the busy mark of a newer press when an older request ends late', async () => {
    const releases: Array<() => void> = []
    const hold = () => new Promise<void>((resolve) => releases.push(resolve))
    function Late() {
      const [status, setStatus] = useState<AdvisorActionProposal['status']>('pending')
      return (
        <Card
          action={draft({ status })}
          onApply={() => {
            setStatus('applied')
            return hold()
          }}
          onUndo={() => hold()}
        />
      )
    }
    renderInApp(<Late />)
    fireEvent.click(screen.getByTestId('advisor-action-apply-btn'))
    const undo = await screen.findByTestId('advisor-action-undo-btn')
    fireEvent.click(undo)
    // The older apply ends first; the undo is still working and keeps its button disabled.
    releases[0]!()
    await waitFor(() => expect(screen.getByTestId('advisor-action-undo-btn').getAttribute('aria-disabled')).toBe('true'))
    releases[1]!()
    await waitFor(() => expect(screen.getByTestId('advisor-action-undo-btn').getAttribute('aria-disabled')).not.toBe('true'))
  })
})
