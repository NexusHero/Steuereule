// The "nothing leaves the app" check shared by the input gates: every request a page sends to a host
// other than the app's own two origins is recorded, so a gate can fail on the first one.
import { newContextAtBreakpoint, guardAgainst429 } from './browser.mjs'
import { fail } from './rate-limit.mjs'

/** Records the URL of every request to an origin outside `origins` (a Set); `data:` and `blob:` URLs never leave the page. */
export function watchForeignRequests(page, origins) {
  const foreign = []
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (url.protocol === 'data:' || url.protocol === 'blob:') return
    if (!origins.has(url.origin)) foreign.push(req.url())
  })
  return foreign
}

/** Opens a 429-guarded page at the large breakpoint and returns it with the list its foreign requests are recorded in. */
export async function openPageWatchingForeignRequests(browser, apiOrigin, webOrigin) {
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail, '/api/auth/')
  const foreign = watchForeignRequests(page, new Set([new URL(apiOrigin).origin, new URL(webOrigin).origin]))
  return { ctx, page, foreign }
}
