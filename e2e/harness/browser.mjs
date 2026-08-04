// Browser-driving instruments shared across every Playwright gate script in `e2e/`.
//
// WHY THIS FILE EXISTS (Salih's platform-engineer mandate, see .claude/agents/salih.md):
// every gate written so far (`e2e/responsive/breakpoint-layout.mjs`, `banner-ds-qa.mjs`,
// `e2e/visibility/visibility-refetch.mjs`) re-derives the same handful of primitives —
// launch/teardown, the 375/768/1280 breakpoint sweep, a computed-style sampler, a 429 guard —
// each with its own copy of the `BREAKPOINTS` array and its own slightly-different comment
// explaining why. That duplication is exactly the risk this file removes: the three arrays
// have already drifted once (`banner-ds-qa.mjs` uses `{375,812}/{768,1024}/{1280,900}`,
// `breakpoint-layout.mjs` uses a bare width with a fixed 900 height) — a future script copying
// either one now inherits whichever inconsistency it copied from. Import from here instead.
//
// This is a genuinely new module — existing scripts are NOT rewired to import it in this pass
// (that is its own, separate, low-risk follow-up; rewriting five already-green CI gates is out
// of scope for the pass that introduces the module they'd import). New scripts (starting with
// `e2e/device/device-authorization.mjs`) use it from day one.
//
// Two instruments below are new, not extractions — no committed script needed them before:
//   - `sampleComputedStyleOverFrames` — proves an animation is actually PROGRESSING across
//     real animation frames, not just that its final computed style is correct. A computed-style
//     read taken once proves nothing about motion; this is what would have caught the inert
//     splash-entrance regression (the animation's CSS was correct, it just never advanced) — a
//     single-sample assertion stays green whether the animation runs once or never runs at all.
//   - `probeColourAtPoint` — reads the actual RENDERED PIXEL at a page coordinate, not the
//     computed style of whatever DOM node happens to sit there. `getComputedStyle` reports what
//     the stylesheet SAYS a fill/colour should be; it says nothing about what actually painted —
//     an SVG gradient stop that never resolved, a stuck CSS transition frozen at an intermediate
//     value, or a z-order accident placing the wrong element on top all produce a "correct"
//     computed style next to a wrong-looking screen. This is what would have caught the
//     solid-green-eye regression: the owl's glasses/iris computed `fill` can be exactly right
//     while the actual painted pixel is a green a designer would immediately reject.
import { chromium } from 'playwright-core'
import { inflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The one canonical breakpoint set (design-system QA checklist, `docs/process/
 * delivery-pipeline.md` § Risk tiers) — every gate sweeps exactly these three widths, never a
 * script-local variant. Heights match `banner-ds-qa.mjs`'s pair (the more recent of the two
 * existing arrays; `breakpoint-layout.mjs`'s bare-900 variant is the one that had drifted).
 */
export const BREAKPOINTS = [
  { name: 's', width: 375, height: 812 },
  { name: 'm', width: 768, height: 1024 },
  { name: 'l', width: 1280, height: 900 },
]

/** Launches a single headless Chromium instance — every gate script's one browser process. */
export async function launchBrowser(options = {}) {
  return chromium.launch({ headless: true, ...options })
}

export async function closeBrowser(browser) {
  await browser.close()
}

/**
 * A fresh, isolated browser CONTEXT at a named breakpoint — never a second page in an existing
 * context. This distinction is load-bearing, not stylistic (Musti's #238 review on the
 * device-authorization gate): `browser.newContext()` gives a genuinely separate cookie jar,
 * exactly the property a two-actor flow (a signed-out desktop, a signed-in phone) needs to
 * prove — two PAGES in one context share a cookie jar, so a test built on two pages would keep
 * passing even if the two "sessions" were actually the same one, proving nothing about the
 * cross-device claim. Reach for `browser.newContext()` (this helper) whenever a script models
 * two distinct real-world devices/browsers; reach for `context.newPage()` only when modelling
 * two tabs of the SAME device sharing one login (as `visibility-refetch.mjs`'s account-scoping
 * tail deliberately does).
 */
export async function newContextAtBreakpoint(browser, breakpointName, options = {}) {
  const bp = BREAKPOINTS.find((candidate) => candidate.name === breakpointName)
  if (!bp) {
    throw new Error(`newContextAtBreakpoint: unknown breakpoint ${JSON.stringify(breakpointName)} — expected one of ${BREAKPOINTS.map((b) => b.name).join(', ')}`)
  }
  return browser.newContext({ viewport: { width: bp.width, height: bp.height }, ...options })
}

/**
 * A context with `prefers-reduced-motion: reduce` forced — Playwright's own native context
 * option (`colorScheme`'s sibling), not a CSS-injection workaround. Use this to prove a
 * component's reduced-motion branch actually SKIPS the animation (a distinct claim from
 * `sampleComputedStyleOverFrames` proving the DEFAULT branch actually MOVES) — an entrance
 * animation that ignores the media query entirely is a real, user-facing accessibility defect
 * a component test can't see (jsdom has no notion of a media query resolving against real
 * browser motion preferences).
 */
export async function newReducedMotionContext(browser, options = {}) {
  return browser.newContext({ reducedMotion: 'reduce', ...options })
}

/**
 * Resizes an already-open page through all three breakpoints, awaiting `fn(bp)` at each one —
 * the "sweep on one already-mounted page" pattern `banner-ds-qa.mjs` established (one auth call
 * for the whole file, not one per breakpoint) generalised so every future gate gets it for
 * free. The 300ms settle wait matches every existing script's own resize-then-wait convention
 * (React-Native-Web's `useWindowDimensions` re-renders asynchronously after a resize event).
 */
export async function sweepBreakpoints(page, fn) {
  for (const bp of BREAKPOINTS) {
    await page.setViewportSize({ width: bp.width, height: bp.height })
    await page.waitForTimeout(300)
    await fn(bp)
  }
}

/**
 * Samples a locator's own computed style across `frameCount` real animation frames (via
 * `requestAnimationFrame`, not a fixed-interval `setTimeout` poll — this is what makes the
 * samples land on actual paint frames rather than an arbitrary wall-clock cadence that could
 * straddle or miss the animation's own steps). Returns the raw array of per-frame snapshots —
 * this function does not itself decide "is this animating"; that is a claim specific to each
 * caller's own animation (a linear translate moves monotonically, a blink toggles between two
 * states, a fade is not monotonic near its ends) and belongs in the caller's own assertion, not
 * hidden inside a shared "isAnimating" heuristic that would silently encode assumptions about
 * shape.
 *
 * `properties` is a list of CSS property names read via `getComputedStyle(el)[prop]` — pass
 * `transform`/`opacity` for a CSS-driven animation, or an inline SVG attribute name (e.g.
 * `fill`) for `element.getAttribute(prop)` reads by prefixing with `attr:` (e.g. `'attr:fill'`).
 */
export async function sampleComputedStyleOverFrames(page, locator, properties, frameCount = 8) {
  const elementHandle = await locator.elementHandle()
  if (!elementHandle) {
    throw new Error('sampleComputedStyleOverFrames: locator resolved to no element — nothing to sample.')
  }
  const samples = await page.evaluate(
    ([el, props, count]) => {
      return new Promise((resolvePromise) => {
        const collected = []
        function tick() {
          const cs = getComputedStyle(el)
          const snapshot = {}
          for (const prop of props) {
            if (prop.startsWith('attr:')) {
              snapshot[prop] = el.getAttribute(prop.slice(5))
            } else {
              snapshot[prop] = cs[prop]
            }
          }
          collected.push(snapshot)
          if (collected.length >= count) {
            resolvePromise(collected)
          } else {
            requestAnimationFrame(tick)
          }
        }
        requestAnimationFrame(tick)
      })
    },
    [elementHandle, properties, frameCount],
  )
  await elementHandle.dispose()
  return samples
}

// --- Minimal PNG pixel decoder (no dependency — `playwright-core` is this workspace's only
// devDependency, ADR per e2e/package.json; adding a PNG library for one pixel read is not worth
// a new dependency). Covers exactly what Chromium's own screenshot encoder produces: 8-bit
// depth, non-interlaced, colour type 2 (RGB) or 6 (RGBA). Throws a clear, named error for
// anything else rather than silently misreading — a probe that can silently return the wrong
// pixel is worse than one that refuses to run.

function paethPredictor(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

function decodePng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!buffer.subarray(0, 8).equals(signature)) {
    throw new Error('decodePng: not a PNG (bad signature) — did the screenshot call fail silently?')
  }

  let offset = 8
  let width
  let height
  let bitDepth
  let colorType
  const idatChunks = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data.readUInt8(8)
      colorType = data.readUInt8(9)
      const interlace = data.readUInt8(12)
      if (bitDepth !== 8) throw new Error(`decodePng: only 8-bit depth is supported, got ${bitDepth}`)
      if (colorType !== 2 && colorType !== 6) throw new Error(`decodePng: only RGB(2)/RGBA(6) colour types are supported, got ${colorType}`)
      if (interlace !== 0) throw new Error('decodePng: interlaced PNGs are not supported')
    } else if (type === 'IDAT') {
      idatChunks.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 8 + length + 4 // length + type + data + crc
  }

  if (!width || !height) throw new Error('decodePng: no IHDR chunk found')

  const channels = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idatChunks))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)

  let rawOffset = 0
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset]
    rawOffset += 1
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rawOffset + x]
      const a = x >= channels ? pixels[y * stride + x - channels] : 0
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const c = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0
      let value
      switch (filterType) {
        case 0: value = rawByte; break
        case 1: value = (rawByte + a) & 0xff; break
        case 2: value = (rawByte + b) & 0xff; break
        case 3: value = (rawByte + Math.floor((a + b) / 2)) & 0xff; break
        case 4: value = (rawByte + paethPredictor(a, b, c)) & 0xff; break
        default: throw new Error(`decodePng: unknown filter type ${filterType} on scanline ${y}`)
      }
      pixels[y * stride + x] = value
    }
    rawOffset += stride
  }

  return { width, height, channels, pixels }
}

/**
 * Reads the actual RENDERED pixel colour at page coordinates `(x, y)` — a real screenshot
 * crop, decoded to RGB(A), not a `getComputedStyle`/`elementFromPoint` read (see this file's
 * header comment for why the distinction matters). Coordinates are page/viewport pixels, the
 * same space `locator.boundingBox()` returns — callers typically probe the centre of a
 * `boundingBox()` rect.
 */
export async function probeColourAtPoint(page, x, y) {
  const buffer = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } })
  const { channels, pixels } = decodePng(buffer)
  return {
    r: pixels[0],
    g: pixels[1],
    b: pixels[2],
    a: channels === 4 ? pixels[3] : 255,
  }
}

/**
 * Canonical screenshot naming/location — `label` should be the assertion's own name (e.g.
 * `owl-eye-idle`), `bp` an optional breakpoint name. Every prior script that saved a debug
 * screenshot invented its own ad hoc filename inline; this is the one place that decides the
 * shape (`<label>[--bp-<name>]-<timestamp>.png`) so failure artefacts from different gates are
 * at least consistently named when collected by CI. Directory defaults to `E2E_SCREENSHOT_DIR`
 * or `/tmp/steuereule-e2e-screenshots` (a runner-writable path in both CI and local dev).
 */
export async function saveNamedScreenshot(page, label, bp) {
  const dir = process.env.E2E_SCREENSHOT_DIR ?? '/tmp/steuereule-e2e-screenshots'
  await mkdir(dir, { recursive: true })
  const suffix = bp ? `--bp-${bp}` : ''
  const fileName = `${label}${suffix}-${Date.now()}.png`
  const filePath = join(dir, fileName)
  await writeFile(filePath, await page.screenshot())
  return filePath
}

/**
 * Fails loudly and immediately on a 429 from a matching path, instead of letting a caller's
 * subsequent `waitFor` time out with no named cause (the pattern every existing gate script
 * re-implements — `visibility-refetch.mjs`'s and `banner-ds-qa.mjs`'s own `guardAgainst429`,
 * kept in sync by hand today). `pathSubstring` defaults to `/api/auth/` (better-auth's own
 * surface); pass e.g. `/v1/device/` for the device-authorization endpoints, which live outside
 * that prefix.
 */
export function guardAgainst429(page, onFail, pathSubstring = '/api/auth/') {
  page.on('response', (response) => {
    if (response.status() === 429 && response.url().includes(pathSubstring)) {
      onFail(`${response.url()} returned 429 — a shared per-path rate-limit bucket was exhausted (see the calling script's rate-limit-budget comment).`)
    }
  })
}
