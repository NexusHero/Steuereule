import { useEffect } from 'react'
import { useCapabilitiesControllerGetCapabilities } from '@steuereule/api-client'
import { setServerRunningTaxYear } from './taxYear'

const RESYNC_MS = 60 * 60 * 1000

/**
 * Reads the running tax year from the server's clock (`GET /v1/capabilities`, OPS-16) and hands it to the
 * tax-year clock. Refetched every hour, so an app left open over New Year moves on. An answer without the
 * field (an older API) leaves the device clock standing in.
 */
export function useServerTaxYearSync(): void {
  const { data } = useCapabilitiesControllerGetCapabilities({ query: { staleTime: RESYNC_MS, refetchInterval: RESYNC_MS, retry: false } })
  const year: unknown = data?.data.runningTaxYear
  useEffect(() => {
    if (typeof year === 'number') setServerRunningTaxYear(year)
  }, [year])
}
