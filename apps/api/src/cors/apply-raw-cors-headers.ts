import type { ServerResponse } from 'node:http'
import { resolveCorsOrigins } from './resolve-cors-origins.js'

export function applyRawCorsHeaders(
  requestOrigin: string | string[] | undefined,
  res: ServerResponse,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const origin = Array.isArray(requestOrigin) ? requestOrigin[0] : requestOrigin

  const existingVary = res.getHeader('Vary')
  res.setHeader('Vary', existingVary ? `${existingVary}, Origin` : 'Origin')
  res.setHeader('Access-Control-Allow-Credentials', 'true')

  if (origin && resolveCorsOrigins(env).includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
}
