import { describe, expect, it } from 'vitest'
import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { AdvisorActionProposal, AdvisorChatMessageView, AdvisorTwoPathsProposal } from '@steuereule/core'
import { server } from '../../test-msw-server'
import { extractAppliedDrafts, extractPendingDrafts, hasPersonScreenDraft, updateActionStatusInMessage } from './owlDrafts'
import { useDraftOwners } from './useDraftOwners'
import { renderHookWithQuery } from '../../test-render'

const draft = (actionId: string, extra: Partial<AdvisorActionProposal> = {}): AdvisorActionProposal => ({
  actionId,
  status: 'pending',
  screen: 'interview',
  field: 'spenden',
  instance: null,
  label: `Entwurf ${actionId}`,
  previousValue: null,
  newValue: '100',
  beforeRefundEur: 0,
  afterRefundEur: 0,
  deltaEur: 0,
  reason: '',
  sourceId: 'estg-10b',
  ...extra,
})

/** The cautious path of a comparison also says what proof the bold one needs. */
const maxPath = (actionId: string, extra: Partial<AdvisorActionProposal> = {}) => ({ ...draft(actionId, extra), evidenceHint: 'Nachweis nötig' })

const message = (id: string, meta: AdvisorChatMessageView['meta']): AdvisorChatMessageView => ({
  id,
  role: 'assistant',
  content: 'Antwort',
  meta,
  createdAt: '2026-11-14T10:00:00.000Z',
  status: 'complete',
})

describe('reading drafts out of the conversation', () => {
  it('finds single, several and compared drafts once each, by status', () => {
    const messages = [
      message('m1', { action: draft('a1') }),
      message('m2', { actions: [draft('a2'), draft('a1'), draft('a3', { status: 'applied' })] }),
      message('m3', { twoPaths: { title: 'Zwei Wege', sourceId: 'estg-4-5-6c', safePath: draft('p1'), maxPath: maxPath('p2', { status: 'applied' }) } }),
      message('m4', null),
    ]
    expect(extractPendingDrafts(messages).map((d) => d.actionId)).toEqual(['a1', 'a2', 'p1'])
    expect(extractAppliedDrafts(messages).map((d) => d.actionId)).toEqual(['a3', 'p2'])
  })

  it('leaves the drafts of a scanned certificate to its own review', () => {
    const scan = message('m1', { actions: [draft('s1')], lstbScan: { fields: [] } } as unknown as AdvisorChatMessageView['meta'])
    expect(extractPendingDrafts([scan])).toEqual([])
  })

  it('knows when a draft belongs on a mask that exists once per spouse', () => {
    expect(hasPersonScreenDraft(undefined)).toBe(false)
    expect(hasPersonScreenDraft([message('m1', { action: draft('a1') })])).toBe(false)
    expect(hasPersonScreenDraft([message('m1', { action: draft('a1', { screen: 'lstb' }) })])).toBe(true)
    expect(hasPersonScreenDraft([message('m1', { actions: [draft('a1'), draft('a2', { person: 'B' })] })])).toBe(true)
    expect(
      hasPersonScreenDraft([message('m1', { twoPaths: { title: 'x', sourceId: 'estg-4-5-6c', safePath: draft('p1'), maxPath: maxPath('p2', { screen: 'rente' }) } })]),
    ).toBe(true)
  })
})

describe('marking a draft after a click', () => {
  const two: AdvisorTwoPathsProposal = { title: 'Zwei Wege', sourceId: 'estg-4-5-6c', safePath: draft('p1'), maxPath: maxPath('p2') }

  it('marks a single draft, one of several, and either path of a comparison', () => {
    const single = updateActionStatusInMessage(message('m1', { action: draft('a1') }), 'a1', 'applied')
    expect(single.meta?.action?.status).toBe('applied')

    const several = updateActionStatusInMessage(message('m2', { actions: [draft('a1'), draft('a2')] }), 'a2', 'dismissed')
    expect(several.meta?.actions?.map((a) => a.status)).toEqual(['pending', 'dismissed'])

    const safe = updateActionStatusInMessage(message('m3', { twoPaths: two }), 'p1', 'applied')
    expect(safe.meta?.twoPaths?.safePath.status).toBe('applied')
    expect(safe.meta?.twoPaths?.maxPath.status).toBe('pending')
    const max = updateActionStatusInMessage(message('m3', { twoPaths: two }), 'p2', 'applied')
    expect(max.meta?.twoPaths?.maxPath.status).toBe('applied')
    expect(max.meta?.twoPaths?.safePath.status).toBe('pending')
  })

  it('returns the very same message when it holds no such draft', () => {
    const plain = message('m1', null)
    expect(updateActionStatusInMessage(plain, 'a1', 'applied')).toBe(plain)
    const other = message('m2', { action: draft('a9') })
    expect(updateActionStatusInMessage(other, 'a1', 'applied')).toBe(other)
    const comparison = message('m3', { twoPaths: two })
    expect(updateActionStatusInMessage(comparison, 'zzz', 'applied')).toBe(comparison)
  })
})

describe('useDraftOwners', () => {
  it('asks nobody while no draft needs a name', () => {
    const { result } = renderHookWithQuery(() => useDraftOwners(2026, [message('m1', { action: draft('a1') })]))
    expect(result.current).toEqual({ partnerName: undefined, ownName: undefined, jointReturn: false })
  })

  it('names both spouses of a joint return once a draft for one of them is on screen', async () => {
    server.use(
      http.get('*/v1/steuerjahre/:jahr/kopplung', () =>
        HttpResponse.json({ filingType: 'zusammen', personB: { firstName: ' Mira ' } }, { status: 200 }),
      ),
      http.get('*/v1/profile', () => HttpResponse.json({ firstName: ' Jan ', lastName: null, steuerId: null, steuernummer: null }, { status: 200 })),
    )
    const messages = [message('m1', { action: draft('a1', { screen: 'lstb', person: 'B' }) })]
    const { result } = renderHookWithQuery(() => useDraftOwners(2026, messages))
    await waitFor(() => expect(result.current).toEqual({ partnerName: 'Mira', ownName: 'Jan', jointReturn: true }))
  })

  it('is no joint return when the spouse is missing, and a blank name counts as none', async () => {
    server.use(
      http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json({ filingType: 'zusammen', personB: null }, { status: 200 })),
    )
    const messages = [message('m1', { action: draft('a1', { screen: 'lstb' }) })]
    const { result } = renderHookWithQuery(() => useDraftOwners(2026, messages))
    await waitFor(() => expect(result.current.jointReturn).toBe(false))
    expect(result.current.partnerName).toBeUndefined()
  })
})
