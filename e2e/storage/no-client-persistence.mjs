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
// holds anything NEW relative to a truly fresh page load, this file will see it, no matter when
// during the page's life it was written.
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
// *** THE CHECK ITSELF (rewritten, Musti's #331 review, F1-F4) ***
//
// Storage is read and enumerated (every key, not a boolean) at FIVE checkpoints: baseline (fresh
// page, before sign-in), mid-Onboarding (summary reached, before the final save submit — catches
// a write during typing, not only after landing), after the Onboarding save, Profil view (before
// any edit — the checkpoint most likely to catch a "hydrate a client cache from the GET" defect),
// and after the Profil save. ALL FIVE are asserted, not just dumped:
//   - `baseline` is compared against a truly empty dump. Nothing in this app writes to client
//     storage at all today (grep the source before doubting that — `OnboardingScreen.tsx`,
//     `ProfilScreen.tsx`, `SplashScreen.tsx` each say so in their own header comments, and none of
//     the three actually calls `setItem`), so ANY key present before sign-in is itself the
//     finding — there is no legitimate baseline write for this app to have to tolerate.
//   - every checkpoint AFTER baseline is compared against `baseline` (not against a needle list):
//     any key present now that wasn't at baseline, or any key whose VALUE changed since baseline,
//     is a finding, named with the flow, the store, the key, and both the before/after value. This
//     is what actually backs the PASS line's claim ("left storage exactly as it started") — a
//     needle list only catches the specific strings someone thought to list, which #331's own
//     review caught missing 'Yilmaz' from Flow 2's list; a before/after diff catches anything.
//
// A LIMIT, stated rather than left implicit (Musti's #331 review, F5): this is a SAMPLING gate —
// it reads storage at five points in time, it does not observe every write as it happens. A write
// made and then removed BETWEEN two checkpoints (e.g. the Steuer-ID sitting in localStorage for
// the ~200ms a field is being typed into, then cleared before the next dump) would not appear in
// any dump here. The fix for that is NOT wrapping `Storage.prototype.setItem` via an init script —
// ADR-0028 rules against aiming a check at the mechanism upstream of a hazard instead of at the
// hazard itself, and ADR-0008's hazard is profile data AT REST in client storage, which sampling
// the store (the actual hazard) is the correct target for. This is a decided, accepted limit, not
// an unnoticed hole.
//
// Wired into ci.yml's "Browser gates" job, after return-visit.mjs (least risk to an already-green
// step; no ordering dependency — this script issues its own sign-up/sign-in against the shared
// no-trusted-ip bucket and paces itself via the same waitForBucketHeadroom every other script in
// this job already uses).
//
// Exits non-zero on the first failed assertion or any storage finding — merge gate, not a report.

import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail, readBucketByExactKey, waitForBucketHeadroom } from '../harness/rate-limit.mjs'
import { FLOW_COPY, skipSplash, signUpOutOfBand, fillOnboardingThroughSummary } from '../harness/flows.mjs'

const AUTH_BUCKET = { windowMs: 10_000, max: 3 } // better-auth's own built-in rule
const TEST_PASSWORD = 'Sicheres-Passwort-1!'

// German copy (app boots in `de`, ADR-0006), lifted from apps/mobile-web/src/i18n/resources.ts —
// the same lifted-not-imported convention every other e2e script in this directory follows. The
// splash/login/onboarding/profil-tab keys live in `FLOW_COPY` (`../harness/flows.mjs`, Musti's
// #331 review, F6) alongside the drive sequences (`skipSplash`, `signUpOutOfBand`,
// `fillOnboardingThroughSummary`) that read them — spread in here so `COPY.xyz` keeps working for
// every call site below; only this file's own Profil-screen strings are added locally.
const COPY = {
  ...FLOW_COPY,
  profilEdit: 'Bearbeiten',
  profilSave: 'Speichern',
  profilSaved: 'Gespeichert.',
  // A separate key from `onboardingLastNamePlaceholder` even though the VALUE is identical
  // ('Yilmaz', apps/mobile-web/src/i18n/resources.ts:273) — Musti's #331 review, F7: naming this
  // field after the OTHER screen's copy needed four lines of comment to explain why that was
  // still correct, which is the tell that the name was doing the work a name should do instead.
  profilLastNamePlaceholder: 'Yilmaz',
}

function waitForRateLimit(bucket, config, label) {
  return waitForBucketHeadroom(bucket, config, label, 'no-client-persistence')
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

const EMPTY_DUMP = { localStorage: {}, sessionStorage: {} }

/**
 * The genuine no-writes check ADR-0008 asks for (Musti's #331 review, F1/F4 — replaces the
 * earlier needle-substring approach, whose coverage was only ever as good as the list of strings
 * someone remembered to include). Compares `dump` against `reference` (either the true empty set,
 * for `baseline`, or `baseline` itself, for every checkpoint after it) and reports every key that
 * is NEW since the reference, or whose VALUE CHANGED since the reference — either is a write this
 * flow made, regardless of what that write's value happens to contain. A key present in both with
 * an unchanged value is a pre-existing artifact this flow did not touch and is not reported (it
 * still appears in the console dump above each call, for a human to look at if they want to).
 */
function findWritesSinceReference(dump, reference, flowLabel) {
  const hits = []
  for (const storeName of ['localStorage', 'sessionStorage']) {
    const before = reference[storeName]
    const now = dump[storeName]
    for (const [key, value] of Object.entries(now)) {
      if (!(key in before)) {
        hits.push({ flow: flowLabel, store: storeName, key, value, reason: 'new key' })
      } else if (before[key] !== value) {
        // Defensive, not load-bearing: `before` is always `baseline` here (or `EMPTY_DUMP` for the
        // baseline call itself), and `baseline` is asserted against `EMPTY_DUMP` above — so a key
        // can only land in this branch on a run whose baseline check has already failed. It cannot
        // by itself turn a green run red. What it's worth keeping FOR: on that already-red run, a
        // baseline-present key that keeps changing (e.g. `probe=1` at baseline, `probe=2` by the
        // Profil checkpoint) is a real, distinct defect signal — a CONTINUOUS write through the
        // flow, not the one-time import-time write the baseline hit alone would suggest. Drop this
        // branch and that later mutation reports nothing at all (no arm matches a same-key,
        // different-value pair once `key in before` is already true) — the reader sees one hit and
        // concludes the wrong shape of bug. This branch is the only thing that distinguishes them
        // (#331 review, F9).
        hits.push({ flow: flowLabel, store: storeName, key, value, reason: `value changed (was "${before[key]}")` })
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
    findings.push(...findWritesSinceReference(baseline, EMPTY_DUMP, 'baseline (fresh page load, before sign-in)'))

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

    await fillOnboardingThroughSummary(page)

    const midFlow = await dumpStorage(page)
    console.log(`[no-client-persistence] mid-flow checkpoint (Onboarding summary reached, before the final save submit) — ${describeDump(midFlow)}`)
    findings.push(...findWritesSinceReference(midFlow, baseline, 'mid-flow (before Onboarding save submit)'))

    await page.getByRole('button', { name: COPY.onboardingWeiter }).click()
    await page.waitForURL((u) => u.pathname === '/app', { timeout: 15_000 }).catch(() => {
      fail('Flow 1: the Onboarding final save submit never reached /app within 15s.')
    })

    const afterOnboardingSave = await dumpStorage(page)
    console.log(`[no-client-persistence] Flow 1 — Onboarding through save, fresh account — ${describeDump(afterOnboardingSave)}`)
    findings.push(...findWritesSinceReference(afterOnboardingSave, baseline, 'Flow 1 (after Onboarding save)'))

    // --- Flow 2: Profil view -> edit -> save, same now-provisioned account ---
    await page.getByRole('tab', { name: COPY.profilTab }).click()
    await page.getByText('Kim Yilmaz', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
      fail('Flow 2: Profil view never rendered the just-saved "Kim Yilmaz" within 10s.')
    })

    const profilView = await dumpStorage(page)
    console.log(`[no-client-persistence] Flow 2 checkpoint (Profil view, before edit) — ${describeDump(profilView)}`)
    findings.push(...findWritesSinceReference(profilView, baseline, 'Flow 2 (Profil view, before edit)'))

    await page.getByText(COPY.profilEdit).click()
    // Real Playwright has no `getByDisplayValue` (that is a Testing-Library API, not this
    // library's), so the field is located the same honest way the rest of this script locates
    // every other input: by its own placeholder.
    await page.getByPlaceholder(COPY.profilLastNamePlaceholder).fill('Yilmaz-Geändert')
    await page.getByText(COPY.profilSave).click()
    await page.getByText(COPY.profilSaved, { exact: true }).waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
      fail('Flow 2: Profil save never showed the "Gespeichert." confirmation within 10s.')
    })

    const afterProfilSave = await dumpStorage(page)
    console.log(`[no-client-persistence] Flow 2 — Profil view -> edit -> save — ${describeDump(afterProfilSave)}`)
    findings.push(...findWritesSinceReference(afterProfilSave, baseline, 'Flow 2 (after Profil save)'))

    await ctx.close()

    if (findings.length > 0) {
      const lines = findings
        .map((f) => `${f.flow}: ${f.store}["${f.key}"] = "${f.value}" (${f.reason})`)
        .join('\n  ')
      fail(
        `T1 DEFECT — client storage was written to during a real-browser round trip (ADR-0008):\n  ${lines}\n` +
          'Report this to Musti for routing (frontend, Kaan) — do NOT patch this script to tolerate it.',
      )
    }

    console.log(
      '[no-client-persistence] PASS — real Chromium, real seeded stack: Onboarding-through-save (fresh account, ' +
        'empty-state path) and Profil view->edit->save both leave localStorage AND sessionStorage exactly as they ' +
        'started (no new key, no changed value, relative to the pre-sign-in baseline) at every one of the five ' +
        'checkpoints enumerated above. This closes, by observation, the one bound #323\'s own fix disclosed: ' +
        "vi.stubGlobal's per-test, post-import installation cannot see a write at module-import time — a real " +
        'page load has no such gap, and the baseline checkpoint above is itself asserted, not just printed.',
    )
  } finally {
    await closeBrowser(browser)
  }
}

main().catch((error) => {
  console.error('[no-client-persistence] FAIL —', error?.message ?? error)
  process.exit(1)
})
