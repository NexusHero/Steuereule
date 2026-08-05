// The launch-caching lifecycle of PlaywrightPdfRenderer (#285), against a scripted
// launcher rather than real Chromium — this is a caching bug, not a browser bug, so it
// belongs in the plain no-DB/no-browser tier where it runs on every push. The
// real-Chromium behaviour keeps its own `pdf-renderer.playwright.integration.test.ts`.
//
// What these four pin down is one property with two halves that pull against each
// other, and a fix that only gets one of them is not a fix:
//
//   1. A failed launch must NOT latch. `renderPdf()`'s whole reason for launching
//      lazily is the renderer's deliberate choice to survive a boot without Chromium
//      (see the class's own onModuleInit comment) — that only pays off if "lazily on
//      first use" means on EACH use. Caching the rejected promise turned it into a
//      one-shot latch: the path that exists to recover from the boot failure was the
//      path that made it permanent.
//   2. A launch in flight must still be SHARED. Clearing the latch by simply not
//      caching would trade the latch for a thundering herd — every concurrent export
//      starting its own Chromium.
//   3. A successful launch must stay cached, which is the property the original `??=`
//      got right and a fix must not undo.
//   4. The two above must hold AT THE SAME TIME — N waiters on a *failing* launch
//      (Musti's review, F1). Cases 1 and 2 each touch one side: case 1 is failure with
//      a single caller, case 2 is concurrency on a launch that succeeds. Their
//      intersection is where a fix of this shape typically breaks: one shared attempt
//      must still deliver the REAL failure to every waiter, and the retries that
//      follow must share one new launch rather than opening the very herd `??=` exists
//      to prevent. Note what it does not settle — whether the clear runs once per
//      launch or once per waiting caller is NOT observable here; see the note inside
//      that case for why this file cannot decide it, and why the choice is still not
//      arbitrary.
import { describe, expect, it } from 'vitest'
import type { Browser } from 'playwright-core'
import { PlaywrightPdfRenderer } from '../src/account/export/pdf-renderer.playwright.js'

/** Stands in for exactly the slice of playwright's `Browser` that `renderPdf()` uses:
 *  open a page, set content, produce bytes, close. Nothing here is under test — it
 *  exists so `renderPdf()` can run to completion without a real browser. */
function stubBrowser(): Browser {
  const page = {
    setContent: (): Promise<void> => Promise.resolve(),
    pdf: (): Promise<Buffer> => Promise.resolve(Buffer.from('%PDF-1.4 stub')),
    close: (): Promise<void> => Promise.resolve(),
  }
  return {
    newPage: (): Promise<typeof page> => Promise.resolve(page),
    close: (): Promise<void> => Promise.resolve(),
  } as unknown as Browser
}

/** The real renderer with only its Chromium launch replaced — `getOrLaunch()`,
 *  `renderPdf()` and the caching under test are the production code, untouched.
 *  `launchCalls` is what makes both halves of the property observable: too few means a
 *  latch, too many means a herd. */
class ScriptedLaunchRenderer extends PlaywrightPdfRenderer {
  launchCalls = 0

  constructor(private readonly launcher: (call: number) => Promise<Browser>) {
    super()
  }

  protected override launch(): Promise<Browser> {
    this.launchCalls += 1
    return this.launcher(this.launchCalls)
  }
}

const HTML = '<html><body>Export</body></html>'

describe('PlaywrightPdfRenderer — launch caching lifecycle (#285)', () => {
  it('re-attempts the launch after a failed one, instead of replaying the first error for the life of the process', async () => {
    // First launch fails the way a container missing its Chromium layer fails; by the
    // second call the cause is gone (layer mounted, memory pressure passed, binary
    // installed). The renderer must find that out, which means actually trying again.
    const renderer = new ScriptedLaunchRenderer((call) =>
      call === 1
        ? Promise.reject(new Error("browserType.launch: Executable doesn't exist at /root/.cache/ms-playwright/..."))
        : Promise.resolve(stubBrowser()),
    )

    await expect(renderer.renderPdf(HTML)).rejects.toThrow(/Executable doesn't exist/)

    const pdf = await renderer.renderPdf(HTML)

    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    expect(renderer.launchCalls).toBe(2)
  })

  it('shares ONE in-flight launch between concurrent renders — clearing the latch must not become a thundering herd', async () => {
    let release: (browser: Browser) => void = () => {}
    const inFlight = new Promise<Browser>((resolve) => {
      release = resolve
    })
    const renderer = new ScriptedLaunchRenderer(() => inFlight)

    // Both started before either can finish: the launch is still pending, so the
    // second call has nothing cached to return and must join the first one's attempt.
    const first = renderer.renderPdf(HTML)
    const second = renderer.renderPdf(HTML)

    expect(renderer.launchCalls).toBe(1)

    release(stubBrowser())

    expect((await first).subarray(0, 5).toString('ascii')).toBe('%PDF-')
    expect((await second).subarray(0, 5).toString('ascii')).toBe('%PDF-')
    expect(renderer.launchCalls).toBe(1)
  })

  it('N waiters on a FAILING launch share that one attempt, all receive the failure, and their retries share one new launch', async () => {
    // The crossing point of cases 1 and 2 (Musti's review, F1). Every count below is an
    // exact number and every list assertion is preceded by a length assertion, so this
    // case cannot pass on an empty collection — `.every()` on `[]` is `true`, which is
    // precisely how a case like this passes while proving nothing.
    let failLaunch: (error: Error) => void = () => {}
    const pendingFailure = new Promise<Browser>((_resolve, reject) => {
      failLaunch = reject
    })
    const renderer = new ScriptedLaunchRenderer((call) =>
      call === 1 ? pendingFailure : Promise.resolve(stubBrowser()),
    )

    // Five renders arrive while the launch is still in flight — they must join it, not
    // start five Chromiums, exactly as in case 2. The difference is how it ends.
    const waiters = [renderer.renderPdf(HTML), renderer.renderPdf(HTML), renderer.renderPdf(HTML), renderer.renderPdf(HTML), renderer.renderPdf(HTML)]
    expect(renderer.launchCalls).toBe(1)

    failLaunch(new Error('browserType.launch: Failed to launch'))
    const settled = await Promise.allSettled(waiters)

    expect(settled).toHaveLength(5)
    expect(settled.map((result) => result.status)).toEqual(['rejected', 'rejected', 'rejected', 'rejected', 'rejected'])
    // The real launch error reaches every waiter — not a generic rejection, and not a
    // different error introduced by the clearing itself.
    for (const result of settled) {
      expect(result.status === 'rejected' && String(result.reason)).toContain('Failed to launch')
    }
    // The clear ran, but it did not relaunch: clearing is not retrying.
    expect(renderer.launchCalls).toBe(1)

    // And the retry after that failure is itself de-duplicated — three concurrent
    // renders get ONE new launch (2 total), not one each (4 total).
    //
    // What this does NOT distinguish, so nobody reads more into it than it proves: the
    // per-waiting-caller variant (a `try/catch` around the await, clearing there)
    // passes every case in this file identically — measured, independently, twice.
    // The two forms are equivalent in observable behaviour, which is precisely why the
    // reason to prefer the one in `getOrLaunch()` belongs in a comment rather than in
    // another case: it is checkable by reading, not by running. That per-caller clear
    // is safe only because Node drains every continuation of the same rejected promise
    // as microtasks before the next task runs, so no new caller can interleave between
    // waiter 1's catch and waiter 2's. If one ever could, waiter 2 would reset the
    // promise waiter 1's retry had just created — an orphaned in-flight launch nobody
    // awaits or closes, plus a second Chromium nobody asked for. Clearing at the
    // source has no such window at all: it happens once, before a new promise can
    // exist. This form's safety is structural; the other's rests on a scheduling
    // argument (Musti's review, F1).
    const retries = [renderer.renderPdf(HTML), renderer.renderPdf(HTML), renderer.renderPdf(HTML)]
    expect(renderer.launchCalls).toBe(2)

    const pdfs = await Promise.all(retries)

    expect(pdfs).toHaveLength(3)
    for (const pdf of pdfs) {
      expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    }
    expect(renderer.launchCalls).toBe(2)
  })

  it('keeps a successful launch cached — a second render reuses the same browser', async () => {
    const renderer = new ScriptedLaunchRenderer(() => Promise.resolve(stubBrowser()))

    await renderer.renderPdf(HTML)
    await renderer.renderPdf(HTML)

    expect(renderer.launchCalls).toBe(1)
  })
})
