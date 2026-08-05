// Reuse, not a new dependency (ADR-0013 §7): `playwright-core` already renders
// headless Chromium in this monorepo (e2e/cross-origin/run.mjs's cross-origin CORS
// smoke gate) — this adds the same library as a direct dependency of the API, because
// unlike that e2e package's CI-only smoke test, PdfRenderer runs at real request time,
// not just in CI/tests. No `pdfkit`/`pdf-lib`/standalone-`puppeteer`-class dependency
// is introduced (the ADR-0013 ruling this reuse satisfies).
//
// The browser is launched once, on module lifecycle (mirroring PrismaService's
// connection pattern — see prisma.service.ts), and a fresh page opened/closed per
// render: cheaper than a cold browser launch per request, while every render still
// gets an isolated page with no state leaking between callers' documents.
//
// Honest infra note (ADR-0013 §7, a tracked follow-up, not a blocker here): Chromium
// is a genuine runtime dependency of PdfRenderer from this point on — the API's
// production image must bundle the Chromium binary (today it's fetched into dev/CI
// caches via `playwright-core install chromium`). This seam keeps the concrete engine
// swappable if bundling Chromium proves too heavy for the deploy target.
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { chromium, type Browser } from 'playwright-core'
import type { PdfRenderer } from './pdf-renderer.js'

@Injectable()
export class PlaywrightPdfRenderer implements PdfRenderer, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlaywrightPdfRenderer.name)
  private browser: Browser | undefined
  private launching: Promise<Browser> | undefined

  async onModuleInit(): Promise<void> {
    // Launched eagerly so the first real request never pays the cold-start cost, but
    // failure here must not crash app boot (e.g. a dev box without the Chromium
    // binary installed yet) — renderPdf() re-attempts the launch lazily instead.
    try {
      this.browser = await this.launch()
    } catch (error) {
      this.logger.warn(
        `Chromium did not launch at boot (PDF export will retry lazily on first use): ${String(error)}`,
      )
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close()
  }

  async renderPdf(html: string): Promise<Buffer> {
    const browser = this.browser ?? (await this.getOrLaunch())
    const page = await browser.newPage()
    try {
      await page.setContent(html, { waitUntil: 'load' })
      return await page.pdf({ format: 'A4', printBackground: true })
    } finally {
      await page.close()
    }
  }

  private async getOrLaunch(): Promise<Browser> {
    if (this.browser) return this.browser
    // `??=` is here to de-duplicate: concurrent renders arriving while a launch is
    // still in flight must join that one launch, not each start their own Chromium.
    // But it caches the PROMISE, not the outcome — so a rejected launch used to stay
    // cached for the life of the process, and every later render re-awaited the same
    // settled rejection and got the identical original error (#285). That turned this
    // method into a one-shot latch: onModuleInit deliberately survives a boot without
    // Chromium and defers to "retry lazily on first use" (see its comment above), and
    // this — the very path meant to recover — was what made the failure permanent.
    //
    // Clearing the latch at the point of failure keeps both halves: in flight, one
    // shared promise; once rejected, gone, so the NEXT call is a real attempt again.
    // Both are pinned in pdf-renderer-launch-lifecycle.test.ts, including the case
    // where they cross — N waiters on a FAILING launch: one shared attempt, the real
    // launch error to every waiter, and their retries sharing ONE new launch rather
    // than one each.
    //
    // Attaching the clear to the promise rather than to the awaiting caller means it
    // runs once per launch instead of once per waiter. Measured, that difference is
    // NOT observable through this class's interface — a per-caller `try/catch` clear
    // passes every case in pdf-renderer-launch-lifecycle.test.ts identically — so it
    // is not a property those tests establish, and this comment does not claim it is.
    // It is still the form to keep: this one has no window in which a late caller
    // could reset a promise another caller's retry had just created, while the
    // per-caller version is safe only by virtue of microtask ordering. That argument
    // is checkable by reading rather than by running, so it lives once, next to the
    // case that provoked it (Musti's review, F1) — not restated here.
    //
    // Deliberately no backoff or attempt cap: renderPdf() is request-bound, so a
    // failed launch surfaces as a failed request and the natural retry is the user
    // clicking again. A timer would add state and a second test dimension for a
    // failure that is in practice either permanent (missing binary — fix the image,
    // #281) or brief.
    this.launching ??= this.launch().catch((error: unknown) => {
      this.launching = undefined
      throw error
    })
    this.browser = await this.launching
    return this.browser
  }

  /** `protected`, not `private`, solely so the launch-lifecycle test can substitute a
   *  scripted launcher (`test/pdf-renderer-launch-lifecycle.test.ts`). That test is
   *  about *caching* — retry after failure, one shared launch under concurrency — which
   *  is real logic in `getOrLaunch()`/`renderPdf()` above and needs no real browser to
   *  exercise; the real-Chromium behaviour keeps its own integration test. One
   *  overridable method is a smaller seam than injecting a launcher through the DI
   *  graph for the same purpose. */
  protected launch(): Promise<Browser> {
    return chromium.launch({ headless: true })
  }
}
