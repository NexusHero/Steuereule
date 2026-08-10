// Shared drive sequences used by more than one real-stack gate script — splash dismissal, an
// out-of-band sign-up, and the onboarding form fill — plus the German copy those sequences need.
//
// WHY THIS FILE EXISTS (Musti's #331 review, F6). `session/return-visit.mjs` and
// `storage/no-client-persistence.mjs` had each grown a byte-identical (or near-identical) copy of
// `skipSplash`, `signUpOutOfBand`, the onboarding fill sequence, and the `COPY` keys those
// sequences read. `e2e/harness/rate-limit.mjs`'s own header already ruled on exactly this shape
// once (Musti's #300 review, G2) — two copies of a drive sequence are two things that can quietly
// drift apart, and the one that drifts silently is the one that stops testing what it claims to.
// That ruling reads: "a brand-new script growing a second copy instead of importing the first was
// never what the README's 'existing scripts not migrated' note licensed (that note is about not
// retrofitting already-committed scripts reflexively, not about a new file being free to
// duplicate)." `no-client-persistence.mjs` was the second copy the day it landed; this file is the
// one canonical version, imported by both callers as of the same change that introduces it.
//
// `completeOnboarding` and `fillOnboardingThroughSummary` are two different functions, not one
// with a flag: `no-client-persistence.mjs` needs to pause AFTER the summary screen is reached but
// BEFORE the final save submit (its own mid-flow storage checkpoint sits exactly there), while
// `return-visit.mjs` only ever needs to get through onboarding in one call. `completeOnboarding`
// is `fillOnboardingThroughSummary` plus that final submit — the shared prefix lives once, the
// point where a caller needs to stop early is expressed by which function it calls, not by a
// parameter threading a "stop here" flag through the shared code.

import { fail } from './rate-limit.mjs'

export const FLOW_COPY = {
  splashSkip: 'Weiter zur App',
  loginEmailPlaceholder: 'du@beispiel.de',
  loginPasswordPlaceholder: '••••••••',
  loginSubmit: 'Einloggen',
  onboardingFirstNamePlaceholder: 'Kim',
  onboardingLastNamePlaceholder: 'Yilmaz',
  onboardingSteuerIdPlaceholder: '12 345 678 901',
  onboardingWeiter: 'Weiter',
  onboardingSteuerNrLater: 'Hab ich nicht zur Hand — später',
  profilTab: 'Profil',
}

/** Dismisses the splash screen if it's showing (a fresh context always shows it; an already-past
 *  one may not, hence the `count()` guard rather than an unconditional click). */
export async function skipSplash(page, webOrigin) {
  await page.goto(webOrigin, { waitUntil: 'networkidle' })
  const splashSkip = page.getByRole('button', { name: FLOW_COPY.splashSkip })
  if (await splashSkip.count()) await splashSkip.click()
}

/** Registers a real account via the API directly (not through the UI) — every caller needs a
 *  provisioned account before it starts driving the browser, and doing that through the UI on
 *  every call would spend rate-limit budget and page time on a step no row is actually testing. */
export async function signUpOutOfBand(apiOrigin, webOrigin, email, password) {
  const res = await fetch(`${apiOrigin}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: webOrigin },
    body: JSON.stringify({ name: '', email, password }),
  })
  if (!res.ok) fail(`out-of-band sign-up failed for ${email}: ${res.status} ${await res.text()}`)
}

/** Fills the onboarding form through the summary screen (name -> Weiter -> Steuer-ID -> Weiter ->
 *  "später" for the Steuernummer) but does NOT submit the final save. Callers that need to inspect
 *  page/storage state before that submit happens (`no-client-persistence.mjs`'s mid-flow
 *  checkpoint) call this directly; `completeOnboarding` below is this plus the final submit. */
export async function fillOnboardingThroughSummary(page) {
  await page.getByPlaceholder(FLOW_COPY.onboardingFirstNamePlaceholder).fill('Kim')
  await page.getByPlaceholder(FLOW_COPY.onboardingLastNamePlaceholder).fill('Yilmaz')
  await page.getByRole('button', { name: FLOW_COPY.onboardingWeiter }).click()
  await page.getByPlaceholder(FLOW_COPY.onboardingSteuerIdPlaceholder).fill('12345678901')
  await page.getByRole('button', { name: FLOW_COPY.onboardingWeiter }).click()
  await page.getByText(FLOW_COPY.onboardingSteuerNrLater).click()
}

/** Fills onboarding through the summary (above) and submits the final save — the shape every
 *  caller that just needs to GET THROUGH onboarding, without inspecting anything mid-flow, wants. */
export async function completeOnboarding(page) {
  await fillOnboardingThroughSummary(page)
  await page.getByRole('button', { name: FLOW_COPY.onboardingWeiter }).click()
}
