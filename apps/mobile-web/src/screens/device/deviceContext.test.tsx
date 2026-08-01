import { describe, it, expect } from 'vitest'
import { parseUserAgent, resolveRegionName } from './deviceContext'

describe('parseUserAgent', () => {
  it('reads Chrome on Windows', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    expect(parseUserAgent(ua)).toEqual({ browser: 'Chrome', os: 'Windows' })
  })

  it('reads Safari on macOS — distinguished from Chrome despite both carrying "Safari/"', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
    expect(parseUserAgent(ua)).toEqual({ browser: 'Safari', os: 'macOS' })
  })

  it('reads Edge on Windows — not misread as Chrome, whose token Edge also carries', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'
    expect(parseUserAgent(ua)).toEqual({ browser: 'Edge', os: 'Windows' })
  })

  it('reads Firefox on Android', () => {
    const ua = 'Mozilla/5.0 (Android 14; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0'
    expect(parseUserAgent(ua)).toEqual({ browser: 'Firefox', os: 'Android' })
  })

  it('reads Chrome on iOS — not misread as Safari, whose engine token it also carries', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1'
    expect(parseUserAgent(ua)).toEqual({ browser: 'Chrome', os: 'iOS' })
  })

  it('degrades honestly for null — never fabricates a device', () => {
    expect(parseUserAgent(null)).toEqual({ browser: null, os: null })
  })

  it('degrades honestly for an unrecognised string — never guesses', () => {
    expect(parseUserAgent('some-internal-http-client/1.0')).toEqual({ browser: null, os: null })
  })

  // Two genuinely different inputs must render two genuinely different outputs — a
  // hard-coded label would pass every single-input test above just as well.
  it('renders different labels for different requests, not one static pair', () => {
    const windowsChrome = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    )
    const macSafari = parseUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    )
    expect(windowsChrome).not.toEqual(macSafari)
  })
})

describe('resolveRegionName', () => {
  // The two branches AC-3/AC-5 both require, proven here at the shared function level —
  // each screen's own test still exercises its own rendering path independently (this
  // file proves the formatter; the screen tests prove the screen renders what it's given).
  it('resolves a real country code to its localized name — the resolved branch', () => {
    expect(resolveRegionName('DE', 'de')).toBe('Deutschland')
    expect(resolveRegionName('DE', 'en')).toBe('Germany')
  })

  it('renders null for the "unknown" sentinel — never a guess', () => {
    expect(resolveRegionName('unknown', 'de')).toBeNull()
  })

  it('renders null for a missing region', () => {
    expect(resolveRegionName(null, 'de')).toBeNull()
  })

  it('renders null for a code Intl.DisplayNames does not recognise, rather than echoing it back as a name', () => {
    // 'ZZ' is CLDR's own "unknown region" reserved code and actually resolves to a real
    // name ("Unbekannte Region"/"Unknown Region") — 'XX' is genuinely unassigned and is
    // exactly the case Intl.DisplayNames's spec'd fallback echoes back unchanged, which
    // is the behaviour this guard exists to catch (confirmed directly against Node's ICU
    // before writing this assertion, not assumed).
    expect(resolveRegionName('XX', 'de')).toBeNull()
  })

  it('resolves two different codes to two different names, not one static value', () => {
    expect(resolveRegionName('DE', 'en')).not.toBe(resolveRegionName('FR', 'en'))
  })

  it('renders null rather than throwing when handed a malformed locale', () => {
    // This app only ever calls with i18n's own 'de'/'en', but the guard is real, not
    // decorative — removing the try/catch turns this into a thrown RangeError instead of
    // the honest null every other unresolved case above already returns.
    expect(resolveRegionName('DE', 'not-a-real-locale-tag-!!')).toBeNull()
  })
})
