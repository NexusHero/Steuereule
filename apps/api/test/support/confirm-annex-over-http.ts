interface ShownValue {
  key: string
  version: string
  confirmed: boolean
  person?: 'B'
}

interface Overview {
  annexes: { annex: string; values: ShownValue[] }[]
}

/**
 * Confirms an Anlage over HTTP the way „Prüfen & bestätigen“ does (MCP-4): reads the overview the
 * user is shown and sends back exactly its unconfirmed values with their versions.
 */
export async function confirmAnnexOverHttp(baseUrl: string, cookie: string, taxYear: number, annex: string): Promise<Response> {
  const overview = await fetch(`${baseUrl}/v1/steuerjahre/${taxYear}/bestaetigung`, { headers: { cookie } })
  if (overview.status !== 200) return overview
  const shown = (((await overview.json()) as Overview).annexes.find((a) => a.annex === annex)?.values ?? [])
    .filter((v) => !v.confirmed)
    .map((v) => ({ key: v.key, version: v.version, ...(v.person === undefined ? {} : { person: v.person }) }))
  return fetch(`${baseUrl}/v1/steuerjahre/${taxYear}/bestaetigung/anlagen/${annex}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ values: shown }),
  })
}
