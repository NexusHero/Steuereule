import { describe, expect, it } from 'vitest'
import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { getCapabilitiesControllerGetCapabilitiesQueryKey } from '@steuereule/api-client'
import { makeTestQueryClient, renderHookWithQuery } from '../../../test/test-render'
import { server } from '../../../test/test-msw-server'
import { apiServerVoice } from './serverVoice'
import { useOwlVoice, useOwlVoiceOfDeployment } from './useOwlVoice'

const capabilities = (eulenStimme: boolean) => http.get('*/v1/capabilities', () => HttpResponse.json({ selbststaendig: false, runningTaxYear: 2026, eulenStimme }))

describe('the owl\'s voice of this deployment', () => {
  it('is the server voice where the capabilities name one', async () => {
    server.use(capabilities(true))
    const { result } = renderHookWithQuery(() => useOwlVoiceOfDeployment())
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toBe(apiServerVoice))
  })

  it('is none where the deployment has no voice', async () => {
    server.use(capabilities(false))
    const client = makeTestQueryClient()
    const { result } = renderHookWithQuery(() => useOwlVoiceOfDeployment(), { client })
    await waitFor(() => expect(client.getQueryData(getCapabilitiesControllerGetCapabilitiesQueryKey())).toBeDefined())
    expect(result.current).toBeNull()
  })

  it('is none when the capabilities cannot be read', async () => {
    server.use(http.get('*/v1/capabilities', () => HttpResponse.json({}, { status: 500 })))
    const client = makeTestQueryClient()
    const { result } = renderHookWithQuery(() => useOwlVoiceOfDeployment(), { client })
    await waitFor(() => expect(client.getQueryState(getCapabilitiesControllerGetCapabilitiesQueryKey())?.status).toBe('error'))
    expect(result.current).toBeNull()
  })

  it('is known at once from the cache', () => {
    const client = makeTestQueryClient()
    client.setQueryData(getCapabilitiesControllerGetCapabilitiesQueryKey(), { data: { selbststaendig: false, runningTaxYear: 2026, eulenStimme: true }, status: 200 })
    expect(renderHookWithQuery(() => useOwlVoiceOfDeployment(), { client }).result.current).toBe(apiServerVoice)
  })

  it('a screen without a provider reads with the device', () => {
    expect(renderHookWithQuery(() => useOwlVoice()).result.current).toBeNull()
  })
})
