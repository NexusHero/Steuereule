// The Strom after WEB-28: a failed load writes nothing, on the basis page, on a mask step and on the partner page;
// a 500 on a page save is not called a conflict (NM-07); the partner page never shows empty fields for a link that
// did not load (NM-15).
import { describe, expect, it } from 'vitest'
import { renderHook, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'
import { StromScreen } from './StromScreen'
import { PartnerPage } from './PartnerPage'
import { useStromSave } from './useStromSave'
import { makeTestQueryClient, renderWithQuery } from '../../test-render'

function renderStrom(slug: string) {
  return renderWithQuery(<StromScreen taxYear={2025} slug={slug} isSignedIn onGo={() => {}} onExit={() => {}} onOpenSubmission={() => {}} onGuestBasisDone={() => {}} />)
}

describe('Strom fails closed', () => {
  it('the basis page shows the load failure and writes nothing', async () => {
    const failing = failEveryRequest()
    renderStrom('basis')
    await expectFailsClosed(failing)
  })

  it('a mask step shows the load failure and writes nothing', async () => {
    const failing = failEveryRequest()
    renderStrom('arbeitsweg')
    await expectFailsClosed(failing)
  })

  it('the partner page shows the load failure, not empty fields, and writes nothing (NM-15)', async () => {
    const failing = failEveryRequest()
    renderWithQuery(<PartnerPage taxYear={2025} onSaved={() => {}} />)
    expect(await screen.findByTestId('strom-partner-ladefehler')).toBeTruthy()
    expect(screen.queryByTestId('strom-partner-vorname')).toBeNull()
    await expectFailsClosed(failing)
  })
})

describe('Strom saves (NM-07)', () => {
  function useSaveHook() {
    const client = makeTestQueryClient()
    return renderHook(() => useStromSave(2025), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    })
  }

  it('a server error is a failure with its reason, not a conflict', async () => {
    server.use(http.post('*/v1/steuerjahre/2025/interview/antworten', () => HttpResponse.json({ message: 'x' }, { status: 500 })))
    const { result } = useSaveHook()
    const saved = await result.current.save([{ questionId: 'job', value: 'Angestellt' }])
    expect(typeof saved === 'object' && saved.kind === 'failed').toBe(true)
  })

  it('a 409 stays a conflict, a lost connection stays network', async () => {
    server.use(http.post('*/v1/steuerjahre/2025/interview/antworten', () => HttpResponse.json({ code: 'ANSWER_UNREACHABLE' }, { status: 409 })))
    const { result } = useSaveHook()
    expect(await result.current.save([{ questionId: 'job', value: 'Angestellt' }])).toBe('conflict')
    server.use(http.post('*/v1/steuerjahre/2025/interview/antworten', () => HttpResponse.error()))
    expect(await result.current.save([{ questionId: 'job', value: 'Angestellt' }])).toBe('network')
  })
})
