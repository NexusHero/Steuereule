// The Chromium wait queue and render timeout of PlaywrightPdfRenderer (ADR-0109), against a scripted browser.
import { describe, expect, it } from 'vitest'
import type { Browser } from 'playwright-core'
import { PlaywrightPdfRenderer } from '../src/account/export/pdf-renderer.playwright.js'

class ScriptedRenderer extends PlaywrightPdfRenderer {
  protected override readonly maxConcurrentRenders = 1
  protected override readonly maxQueuedRenders = 1
  protected override readonly queueWaitMs: number
  protected override readonly renderTimeoutMs: number
  constructor(private readonly pdf: () => Promise<Buffer>, options: { queueWaitMs?: number; renderTimeoutMs?: number } = {}) {
    super()
    this.queueWaitMs = options.queueWaitMs ?? 1000
    this.renderTimeoutMs = options.renderTimeoutMs ?? 1000
  }
  protected override hasMemoryHeadroom(): boolean {
    return true
  }
  readonly contexts: Array<{ readonly options: unknown; route?: (route: { request(): { url(): string }; continue(): Promise<void>; abort(code?: string): Promise<void> }) => unknown }> = []
  protected override launch(): Promise<Browser> {
    const page = { setContent: () => Promise.resolve(), pdf: this.pdf, close: () => Promise.resolve() }
    const newContext = (options: unknown) => {
      const record: (typeof this.contexts)[number] = { options }
      this.contexts.push(record)
      return Promise.resolve({
        route: (_pattern: string, handler: NonNullable<typeof record.route>) => {
          record.route = handler
          return Promise.resolve()
        },
        newPage: () => Promise.resolve(page),
        close: () => Promise.resolve(),
      })
    }
    return Promise.resolve({ newContext, close: () => Promise.resolve() } as unknown as Browser)
  }
}

const never = (): Promise<Buffer> => new Promise(() => undefined)

describe('PlaywrightPdfRenderer bounds', () => {
  it('abandons a render that never finishes, and frees its slot', async () => {
    let calls = 0
    const renderer = new ScriptedRenderer(() => (calls++ === 0 ? never() : Promise.resolve(Buffer.from('ok'))), { renderTimeoutMs: 20 })
    await expect(renderer.renderPdf('<p>a</p>')).rejects.toMatchObject({ code: 'EXPORT_RENDER_TIMEOUT' })
    await expect(renderer.renderPdf('<p>b</p>')).resolves.toEqual(Buffer.from('ok'))
  })

  it('turns away an export when the wait queue is full', async () => {
    const renderer = new ScriptedRenderer(never, { renderTimeoutMs: 200, queueWaitMs: 500 })
    const running = renderer.renderPdf('1')
    const waiting = renderer.renderPdf('2')
    await expect(renderer.renderPdf('3')).rejects.toMatchObject({ code: 'EXPORT_BUSY', details: { retryAfterSeconds: 30 } })
    await expect(running).rejects.toMatchObject({ code: 'EXPORT_RENDER_TIMEOUT' })
    await expect(waiting).rejects.toMatchObject({ code: 'EXPORT_RENDER_TIMEOUT' })
  })

  it('stops waiting for a slot after the queue wait', async () => {
    const renderer = new ScriptedRenderer(never, { renderTimeoutMs: 500, queueWaitMs: 20 })
    const running = renderer.renderPdf('1')
    await expect(renderer.renderPdf('2')).rejects.toMatchObject({ code: 'EXPORT_BUSY' })
    await expect(running).rejects.toMatchObject({ code: 'EXPORT_RENDER_TIMEOUT' })
  })

  it('renders with JavaScript off and lets no request but inline data: and blob: through (API-7)', async () => {
    const renderer = new ScriptedRenderer(() => Promise.resolve(Buffer.from('ok')))
    await renderer.renderPdf('<p>a</p>')
    const [context] = renderer.contexts
    expect(context?.options).toMatchObject({ javaScriptEnabled: false })
    const decide = async (url: string) => {
      let outcome = ''
      await context!.route!({ request: () => ({ url: () => url }), continue: async () => void (outcome = 'continue'), abort: async () => void (outcome = 'abort') })
      return outcome
    }
    expect(await decide('https://attacker.example/x.png')).toBe('abort')
    expect(await decide('file:///etc/passwd')).toBe('abort')
    expect(await decide('data:image/png;base64,AAAA')).toBe('continue')
    expect(await decide('blob:null/1234')).toBe('continue')
  })
})
