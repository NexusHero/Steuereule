// Account + API helpers shared by the #450 P4 gates (confirmation, sheets, errors, interview
// combinations): provision a verified account out of band, drive the API as that user, and sign the
// browser in through the real login form. Same rate-limit discipline as hub-acceptance.mjs
// (better-auth counts per path in a rolling 10 s window).
import { request as playwrightRequest } from 'playwright-core'
import { fail, waitForBucketHeadroom } from './rate-limit.mjs'
import { skipSplash, signUpOutOfBand, submitLogin } from './flows.mjs'

export const PASSWORD = 'Sicheres-Passwort-1!'
const AUTH_BUCKET = { windowMs: 10_000, max: 3, shared: true }

/** Creates a verified account and returns `{ email, api }` with `api` signed in. */
export async function createAccount({ apiOrigin, webOrigin, sql, tag }) {
  const email = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1000)}@beispiel.de`
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-up/email', tag)
  await signUpOutOfBand(apiOrigin, webOrigin, email, PASSWORD)
  sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)
  const api = await playwrightRequest.newContext({ baseURL: apiOrigin, extraHTTPHeaders: { origin: webOrigin } })
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', tag)
  const res = await api.post('/api/auth/sign-in/email', { data: { email, password: PASSWORD } })
  if (!res.ok()) fail(`sign-in failed (${res.status()})`)
  return { email, api }
}

export async function call(api, method, path, data) {
  const res = await api.fetch(path, { method, ...(data === undefined ? {} : { data }) })
  if (!res.ok()) fail(`${method} ${path} answered ${res.status()}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

/** Answers interview steps one after the other (dependent answers must not be sent in parallel). */
export async function answer(api, year, pairs) {
  for (const [questionId, value] of pairs) await call(api, 'POST', `/v1/steuerjahre/${year}/interview/antworten`, { questionId, value })
}

export async function putLstb(api, year, gross, wageTax, social) {
  for (const [field, value] of [['bruttoarbeitslohn', gross], ['lohnsteuer', wageTax], ['sozialversicherung', social]]) {
    await call(api, 'PUT', `/v1/steuerjahre/${year}/lstb/${field}`, { kind: 'erfasst', value })
  }
}

/** Signs the page in through the login form and waits for `/app`. */
export async function browserLogin(page, webOrigin, email, tag) {
  await skipSplash(page, webOrigin)
  await waitForBucketHeadroom(AUTH_BUCKET, 'sign-in/email', tag)
  await submitLogin(page, email, PASSWORD)
  await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 })
}

/** Polls until `read()` equals `expected`; fails with `message` otherwise. */
export async function until(read, expected, message, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  let value = null
  while (Date.now() < deadline) {
    value = await read()
    if (value === expected) return
    await new Promise((r) => setTimeout(r, 250))
  }
  fail(`${message}, got ${JSON.stringify(value)}`)
}
