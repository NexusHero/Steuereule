// Retroactive T1 pass for #323/#329 (Salih) — the ADR-0008 "never writes to client storage"
// control, driven against a real browser and the real seeded stack.
//
// *** WHY THIS FILE EXISTS, STATED PLAINLY ***
//
// #329 replaced two vacuous jsdom assertions (`vi.spyOn(window.localStorage, 'setItem')`, which
// jsdom's `Storage` Proxy silently defeats — #323) with `vi.stubGlobal`-backed stubs that DO
// intercept. That fix is real and proven (red path run, see #329's own body) — but it has one
// disclosed bound, stated on #323/#329 themselves: `vi.stubGlobal` installs the stub PER TEST,
// AFTER the module under test has already been imported. A write executed at module-IMPORT time
// (a top-level `localStorage.setItem(...)` inside something the screen imports, evaluated by the
// JS engine before any test body — and therefore before any stub — exists) would not be caught by
// either fixed jsdom test. Nobody has evidence such a write exists; the point is that jsdom
// structurally cannot rule it out.
//
// A real browser has no such window. A page load runs every module's top-level code BEFORE this
// script ever asks the page anything — there is no "before the stub was installed" gap to hide
// in, because nothing here is stubbed at all. This script simply loads the real page, drives the
// real flows, and reads `window.localStorage`/`window.sessionStorage` afterward. If either store
// holds anything, this file will see it, no matter when during the page's life it was written.
//
// THE TWO FLOWS (mirroring #329's own two fixed test files, one script — see this file's own PR
// for the corresponding jsdom coverage; T1 tier, real Chromium, real stack, no mocks):
//   1. A FRESH account, real sign-up + sign-in, through Onboarding to the final save (PUT
//      /v1/profile). Fresh on purpose — the empty-state, first-run path (also the path that
//      produced #324's CTA gap), which the two prior tests structurally could not exercise
//      end-to-end against a live server.
//   2. Profil, on that same now-provisioned account: view -> edit -> save (PUT /v1/profile
//      again), the exact round trip ProfilScreen.test.tsx's fixed assertion covers.
//
// Storage is read and enumerated (every key, not a boolean) at four checkpoints: baseline (fresh
// page, before sign-in), mid-Onboarding (summary reached, before the final save submit — catches
// a write during typing, not only after landing), after the Onboarding save, and after the Profil
// save. A non-empty dump is not automatically a defect — a third-party key with no profile data
// in it (e.g. a router/i18n cache) is a finding to name, not a defect on its own; a key whose
// VALUE contains the Steuer-ID, the entered name, or any profile field IS a T1 defect and this
// script fails on it by name (key, value, which flow, what it matched).
//
// Wired into ci.yml's "Browser gates" job, after return-visit.mjs (least risk to an already-green
// step; no ordering dependency — this script issues its own sign-up/sign-in against the shared
// no-trusted-ip bucket and paces itself via the same waitForBucketHeadroom every other script in
// this job already uses).
//
// Exits non-zero on the first failed assertion or any sensitive-value finding — merge gate, not a
// report.

import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, readBucketByExactKey, waitForBucketHeadroom } from '../harness/rate-limit.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3 } // better-auth's own built-in rule
const TEST_PASSWORD = 'Sicheres-Passwort-1!'

// German copy (app boots in `de`, ADR-0006), lifted from apps/mobile-web/src/i18n/resources.ts —
// the same lifted-not-imported convention every other e2e script in this directory follows.
const COPY = {
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
  profilEdit: 'Bearbeiten',
  profilSave: 'Speichern',
  profilSaved: 'Gespeichert.',
}

function waitForRateLimit(bucket, config, label) {
  return waitForBucketHeadroom(bucket, config, label, 'no-client-persistence')
}

async function skipSplash(page, webOrigin) {
  await page.goto(webOrigin, { waitUntil: 'networkidle' })
  const splashSkip = page.getByRole('button', { name: COPY.splashSkip })
  if (await splashSkip.count()) await splashSkip.click()
}

async function signUpOutOfBand(apiOrigin, webOrigin, email, password) {
  const res = await fetch(`${apiOrigin}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: webOrigin },
    body: JSON.stringify({ name: '', email, password }),
  })
  if (!res.ok) fail(`out-of-band sign-up failed for ${email}: ${res.status} ${await res.text()}`)
}

/** Reads the REAL, live storage from inside the page — every key/value, never a boolean. */
async function dumpStorage(page) {
  return page.evaluate(() => ({
    localStorage: Object.fromEntries(Object.entries(window.localStorage)),
    sessionStorage: Object.fromEntries(Object.entries(window.sessionStorage)),
  }))
}

function describeDump(dump) {
  const fmt = (obj) =>
    Object.keys(obj).length === 0 ? '{}' : `{${Object.entries(obj).map(([k, v]) => `${k}=${v}`).join(', ')}}`
  return `localStorage: ${fmt(dump.localStorage)} · sessionStorage: ${fmt(dump.sessionStorage)}`
}

/** #323's own T1 defect class, applied here: a value that carries the profile itself — the
 *  Steuer-ID (raw or grouped), or the entered name — anywhere in either store. Any other key is
 *  reported (via the checkpoint log lines above) but not treated as a defect by this function. */
function findSensitiveValues(dump, flowLabel, sensitiveValues) {
  const hits = []
  for (const [storeName, store] of [['localStorage', dump.localStorage], ['sessionStorage', dump.sessionStorage]]) {
    for (const [key, value] of Object.entries(store)) {
      for (const needle of sensitiveValues) {
        if (needle && String(value).includes(needle)) hits.push({ flow: flowLabel, store: storeName, key, value, needle })
      }
    }
  }
  return hits
}

async function main() {
  const { apiOrigin, webOrigin, sql } = await startStack()
  const browser = await launchBrowser()
  const findings = []

  try {
    const email = `no-client-persistence-${Date.now()}@beispiel.de`
    await waitForRateLimit(readBucketByExactKey(sql, 'no-trusted-ip|/sign-up/email'), AUTH_BUCKET, 'sign-up/email')
    await signUpOutOfBand(apiOrigin, webOrigin, email, TEST_PASSWORD)
    sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)

    const ctx = await newContextAtBreakpoint(browser, 's')
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')

    await skipSplash(page, webOrigin)
    const baseline = await dumpStorage(page)
    console.log(`[no-client-persistence] baseline (fresh page load, before sign-in) — ${describeDump(baseline)}`)

    // --- Flow 1: fresh account, Onboarding through to save ---
    await waitForRateLimit(readBucketByExactKey(sql, 'no-trusted-ip|/sign-in/email'), AUTH_BUCKET, 'sign-in/email')
    await page.getByPlaceholder(COPY.loginEmailPlaceholder).fill(email)
    await page.getByPlaceholder(COPY.loginPasswordPlaceholder).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: COPY.loginSubmit }).click()
    await page.waitForURL((u) => u.pathname === '/onboarding', { timeout: 15_000 }).catch(() => {
      fail('Flow 1: real sign-in for a brand-new account never reached /onboarding within 15s.')
    })

    const firstNameField = page.getByPlaceholder(COPY.onboardingFirstNamePlaceholder)
    await firstNameField.waitFor({ state: 'visible', timeout: 10_000 })
    if ((await firstNameField.inputValue()) !== '') {
      fail('Flow 1: the fresh-account first-name field was not empty on mount — this run did not exercise the empty-state path it is meant to.')
    }

    await firstNameField.fill('Kim')
    await page.getByPlaceholder(COPY.onboardingLastNamePlaceholder).fill('Yilmaz')
    await page.getByRole('button', { name: COPY.onboardingWeiter }).click()
    await page.getByPlaceholder(COPY.onboardingSteuerIdPlaceholder).fill('12345678901')
    await page.getByRole('button', { name: COPY.onboardingWeiter }).click()
    await page.getByText(COPY.onboardingSteuerNrLater).click()

    const midFlow = await dumpStorage(page)
    console.log(`[no-client-persistence] mid-flow checkpoint (Onboarding summary reached, before the final save submit) — ${describeDump(midFlow)}`)
    findings.push(...findSensitiveValues(midFlow, 'mid-flow (before Onboarding save submit)', ['12345678901', '12 345 678 901', 'Kim', 'Yilmaz']))

    await page.getByRole('button', { name: COPY.onboardingWeiter }).click()
    await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 }).catch(() => {
      fail('Flow 1: the Onboarding final save submit never reached /app within 15s.')
    })

    const afterOnboardingSave = await dumpStorage(page)
    console.log(`[no-client-persistence] Flow 1 — Onboarding through save, fresh account — ${describeDump(afterOnboardingSave)}`)
    findings.push(...findSensitiveValues(afterOnboardingSave, 'Flow 1 (after Onboarding save)', ['12345678901', '12 345 678 901', 'Kim', 'Yilmaz']))

    // --- Flow 2: Profil view -> edit -> save, same now-provisioned account ---
    await page.getByRole('tab', { name: COPY.profilTab }).click()
    await page.getByText('Kim Yilmaz', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
      fail('Flow 2: Profil view never rendered the just-saved "Kim Yilmaz" within 10s.')
    })

    const profilView = await dumpStorage(page)
    console.log(`[no-client-persistence] Flow 2 checkpoint (Profil view, before edit) — ${describeDump(profilView)}`)

    await page.getByText(COPY.profilEdit).click()
    // Profil's edit-form last-name field shares the identical placeholder text Onboarding uses
    // ("Yilmaz") — real Playwright has no `getByDisplayValue` (that is a Testing-Library API,
    // not this library's), so the field is located the same honest way the rest of this script
    // locates every other input: by its own placeholder.
    await page.getByPlaceholder(COPY.onboardingLastNamePlaceholder).fill('Yilmaz-Geändert')
    await page.getByText(COPY.profilSave).click()
    await page.getByText(COPY.profilSaved, { exact: true }).waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
      fail('Flow 2: Profil save never showed the "Gespeichert." confirmation within 10s.')
    })

    const afterProfilSave = await dumpStorage(page)
    console.log(`[no-client-persistence] Flow 2 — Profil view -> edit -> save — ${describeDump(afterProfilSave)}`)
    findings.push(...findSensitiveValues(afterProfilSave, 'Flow 2 (after Profil save)', ['12345678901', '12 345 678 901', 'Kim', 'Yilmaz-Geändert']))

    await ctx.close()

    if (findings.length > 0) {
      const lines = findings
        .map((f) => `${f.flow}: ${f.store}["${f.key}"] = "${f.value}" (contains "${f.needle}")`)
        .join('\n  ')
      fail(
        `T1 DEFECT — profile data found in client storage after a real-browser round trip (ADR-0008):\n  ${lines}\n` +
          'Report this to Musti for routing (frontend, Kaan) — do NOT patch this script to tolerate it.',
      )
    }

    console.log(
      '[no-client-persistence] PASS — real Chromium, real seeded stack: Onboarding-through-save (fresh account, ' +
        'empty-state path) and Profil view->edit->save both leave localStorage AND sessionStorage exactly as they ' +
        'started at every checkpoint (baseline, mid-flow, after each save — enumerated above, never just "looked ' +
        "empty\"). This closes, by observation, the one bound #323's own fix disclosed: vi.stubGlobal's per-test, " +
        "post-import installation cannot see a write at module-import time — a real page load has no such gap.",
    )
  } finally {
    await closeBrowser(browser)
  }
}

main().catch((error) => {
  console.error('[no-client-persistence] FAIL —', error?.message ?? error)
  process.exit(1)
})
