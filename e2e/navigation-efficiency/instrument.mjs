// Counts what a person would do (#450 Teil 2A): clicks and keystrokes through a Proxy around
// Playwright's Page / Locator, screen changes from URL changes and sheets that open, and the
// browser's own Event Timing for the slowest interaction (an INP stand-in).
//
//   const meter = createMeter()
//   const page = await meter.wrapPage(await ctx.newPage())   // or meter.wrapBrowser(browser) for scripts
//   meter.reset(); …drive…; const sample = meter.read()
//
// What counts:
//   click, dblclick, check, uncheck, tap, selectOption, setInputFiles → 1 interaction each
//   fill(text) / type(text) → one keystroke per character (what a person types)
//   press / keyboard.press → 1 keystroke;  page.reload() / goBack() / goForward() → 1 interaction
//   page.goto() is NOT counted (it stands for "opens the app / a link", the task's start)
// Screens: every newly mounted screen container (a full screen or a sheet). URLs are not used: the
// app before #443 kept one URL for every screen.

const LOCATOR_FACTORIES = new Set(['locator', 'getByRole', 'getByTestId', 'getByText', 'getByLabel', 'getByPlaceholder', 'getByTitle', 'getByAltText', 'first', 'last', 'nth', 'filter', 'and', 'or'])
const CLICKS = new Set(['click', 'dblclick', 'check', 'uncheck', 'tap', 'selectOption', 'setInputFiles', 'setChecked'])

/** Installed in every page: counts dialogs that appear and keeps the slowest event timing. */
/** Installed in every page; reports to the Node side through exposed bindings, so the numbers
 *  survive navigations and closed pages. */
const PAGE_PROBE = `(() => {
  if (window.__navMeterInstalled) return
  window.__navMeterInstalled = true
  const seen = new WeakSet()
  // A new screen is a newly mounted screen container (every screen of both app generations has one).
  const scan = () => document.querySelectorAll('[data-testid="screen-container"]').forEach((d) => { if (!seen.has(d)) { seen.add(d); window.__navMeterDialog?.() } })
  new MutationObserver(scan).observe(document, { childList: true, subtree: true })
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (e.interactionId) window.__navMeterEvent?.(e.duration) })
      .observe({ type: 'event', durationThreshold: 16, buffered: true })
  } catch {}
})()`

export function createMeter() {
  const state = { clicks: 0, keys: 0, dialogs: 0, maxEventMs: 0, startedAt: Date.now(), steps: [], emails: [] }

  const wrapLocator = (locator, label) =>
    new Proxy(locator, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver)
        if (typeof value !== 'function') return value
        if (LOCATOR_FACTORIES.has(prop)) return (...args) => wrapLocator(value.apply(target, args), label)
        if (CLICKS.has(prop)) return (...args) => { state.clicks++; state.steps.push(`click ${label}`); return value.apply(target, args) }
        if (prop === 'fill' || prop === 'type' || prop === 'pressSequentially') {
          return (text, ...rest) => {
            state.keys += String(text ?? '').length
            state.steps.push(`type ${String(text).length} ${label}`)
            if (/^[^\s@]+@beispiel\.de$/.test(String(text))) state.emails.push(String(text))
            return value.call(target, text, ...rest)
          }
        }
        if (prop === 'press') return (...args) => { state.keys++; return value.apply(target, args) }
        return value.bind(target)
      },
    })

  const wrapPage = async (page) => {
    await page.exposeFunction('__navMeterDialog', () => { state.dialogs++ }).catch(() => {})
    await page.exposeFunction('__navMeterEvent', (ms) => { state.maxEventMs = Math.max(state.maxEventMs, ms) }).catch(() => {})
    await page.addInitScript(PAGE_PROBE)
    await page.evaluate(PAGE_PROBE).catch(() => {})
    const keyboard = new Proxy(page.keyboard, {
      get(target, prop) {
        const value = Reflect.get(target, prop)
        if (prop === 'press') return (...args) => { state.keys++; return value.apply(target, args) }
        if (prop === 'type' || prop === 'insertText') return (text, ...rest) => { state.keys += String(text).length; return value.call(target, text, ...rest) }
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    return new Proxy(page, {
      get(target, prop, receiver) {
        if (prop === 'keyboard') return keyboard
        if (prop === '__unwrapped') return target
        const value = Reflect.get(target, prop, receiver)
        if (typeof value !== 'function') return value
        if (LOCATOR_FACTORIES.has(prop)) return (...args) => wrapLocator(value.apply(target, args), String(args[0]).slice(0, 60))
        if (prop === 'reload' || prop === 'goBack' || prop === 'goForward') return (...args) => { state.clicks++; return value.apply(target, args) }
        return value.bind(target)
      },
    })
  }

  /** For scripts that create their own contexts and pages (the scenario scripts). */
  const wrapBrowser = (browser) =>
    new Proxy(browser, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver)
        if (prop !== 'newContext') return typeof value === 'function' ? value.bind(target) : value
        return async (...args) => {
          const ctx = await value.apply(target, args)
          return new Proxy(ctx, {
            get(c, p, r) {
              const v = Reflect.get(c, p, r)
              if (p === 'newPage') return async (...a) => wrapPage(await v.apply(c, a))
              return typeof v === 'function' ? v.bind(c) : v
            },
          })
        }
      },
    })

  return {
    wrapPage,
    wrapBrowser,
    reset() {
      Object.assign(state, { clicks: 0, keys: 0, dialogs: 0, maxEventMs: 0, steps: [], startedAt: Date.now() })
    },
    read() {
      return {
        interactions: state.clicks + state.keys,
        clicks: state.clicks,
        keys: state.keys,
        screens: state.dialogs,
        ms: Date.now() - state.startedAt,
        slowestInteractionMs: Math.round(state.maxEventMs),
      }
    },
    steps: () => [...state.steps],
    lastEmail: () => state.emails.at(-1) ?? null,
  }
}
