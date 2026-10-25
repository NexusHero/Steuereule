// Shared drive sequences used by more than one real-stack gate script — splash dismissal, an
// out-of-band sign-up — plus the German copy those sequences need.
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
// `completeOnboarding`/`fillOnboardingThroughSummary` were removed with ADR-0045 (value-first
// funnel): a guest AND a returning signed-in account go straight to the app — the onboarding walk
// no longer exists for either of the two callers (registration via the UI is the one remaining
// onboarding path, and no real-stack gate drives it). Dead drive sequences are deleted, not kept
// as no-ops — the same ruling the #283/C3 removal note quotes.

import { fail } from './rate-limit.mjs'

export const FLOW_COPY = {
  splashSkip: 'Weiter zur App',
  loginEmailPlaceholder: 'du@beispiel.de',
  loginPasswordPlaceholder: '••••••••',
  loginSubmit: 'Einloggen',
  // ADR-0045: the onboarding walk is gone for guests/returning accounts; this placeholder is the
  // SAME string the Profil edit form uses for the first name (i18n `profil.firstNamePlaceholder`).
  onboardingFirstNamePlaceholder: 'Kim',
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
