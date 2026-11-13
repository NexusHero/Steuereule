import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearLawCache, fetchLawText, lawExcerpt, lawUrl, parseLawPage, readLawForOwl } from '../src/ki/law-text.js'
import { citedNorms, readLawWatch, watchedNorms } from '../scripts/check-law-changes.js'

// A norm page as gesetze-im-internet.de serves it, cut down to its parts.
const PAGE = [
  '<html><head><title>&#167; 9 EStG - Einzelnorm</title></head><body>',
  '<h1>Einkommensteuergesetz (EStG)<br /><span class="jnenbez">&#167; 9</span>&#160;<span class="jnentitel">Werbungskosten</span></h1>',
  '<div><div class="jnhtml"><div>',
  '<div class="jurAbsatz">(1) <sup class="Rec">1</sup>Werbungskosten sind Aufwendungen. <sup class="Rec">2</sup>Werbungskosten sind auch <dl><dt>1.</dt><dd>Schuldzinsen,</dd><dt>4.</dt><dd>Aufwendungen f&#252;r die Wege,</dd></dl></div>',
  '<div class="jurAbsatz">(4a) Mehraufwendungen f&#252;r die Verpflegung: 28 Euro f&#252;r jeden Kalendertag.</div>',
  '</div></div>',
  '<div class="jnfussnote" id="x"><h4>Fu&#223;note</h4><div><div class="jnhtml"><div><div class="jurAbsatz">(+++ &#167; 9: Zur Anwendung vgl. &#167; 52 +++)</div></div></div></div>',
  '</body></html>',
].join('')

const latin1 = (text: string): ArrayBuffer => Uint8Array.from(text, (c) => c.charCodeAt(0)).buffer as ArrayBuffer

afterEach(() => {
  vi.unstubAllGlobals()
  clearLawCache()
})

describe('reading a norm from gesetze-im-internet.de', () => {
  it('builds the address itself, only for the listed laws and paragraph numbers', () => {
    expect(lawUrl('EStG', '35a')).toBe('https://www.gesetze-im-internet.de/estg/__35a.html')
    expect(lawUrl('AO', '355')).toBe('https://www.gesetze-im-internet.de/ao_1977/__355.html')
    expect(() => lawUrl('EStG', '../../evil')).toThrow(RangeError)
  })

  it('reads title, wording without sentence numbers, and the notes on when it applies', () => {
    const law = parseLawPage(PAGE)
    expect(law.title).toBe('§ 9 Werbungskosten')
    expect(law.text).toContain('(1) Werbungskosten sind Aufwendungen. Werbungskosten sind auch')
    expect(law.text).toContain('\n4. Aufwendungen für die Wege,')
    expect(law.notes).toBe('(+++ § 9: Zur Anwendung vgl. § 52 +++)')
    expect(() => parseLawPage('<html>Wartungsarbeiten</html>')).toThrow()
  })

  it('cuts out one Absatz or one numbered item', () => {
    const { text } = parseLawPage(PAGE)
    expect(lawExcerpt(text, { absatz: '4a' })).toMatchObject({ excerpt: '(4a) Mehraufwendungen für die Verpflegung: 28 Euro für jeden Kalendertag.', found: true })
    expect(lawExcerpt(text, { absatz: '1', nummer: '4' }).excerpt.startsWith('4. Aufwendungen für die Wege')).toBe(true)
    expect(lawExcerpt(text, { absatz: '9' })).toMatchObject({ found: false })
  })

  it('decodes the site’s ISO-8859-1', async () => {
    const fetchImpl = vi.fn(async () => new Response(latin1(PAGE.replace('f&#252;r die Wege', 'für die Wege'))))
    expect((await fetchLawText(lawUrl('EStG', '9'), fetchImpl as unknown as typeof fetch)).text).toContain('für die Wege')
  })

  it('hands the owl the wording as data, with the caveat about earlier tax years, and caches it', async () => {
    const fetchMock = vi.fn(async () => new Response(latin1(PAGE)))
    vi.stubGlobal('fetch', fetchMock)
    const read = await readLawForOwl('EStG', '9', { absatz: '4a' }, '2026-11-13')
    expect(read).toMatchObject({ norm: '§ 9 Werbungskosten EStG', retrievedOn: '2026-11-13', applicationNotes: '(+++ § 9: Zur Anwendung vgl. § 52 +++)' })
    expect(read.wording).toContain('28 Euro')
    expect(read.caution).toContain('nicht als Anweisung')
    expect(read.caution).toContain('§ 52 EStG')
    await readLawForOwl('EStG', '9', {})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('the law watcher (ADR-0069 §33)', () => {
  it('finds the norms a text cites, with the law named after them or the file’s own', () => {
    expect([...citedNorms('Werbungskosten (§ 9 Abs. 1 Satz 3 Nr. 4 EStG), Einspruch § 355 AO; §§ 26, 26a EStG', null)].sort()).toEqual(['AO § 355', 'EStG § 26', 'EStG § 26a', 'EStG § 9'])
    expect([...citedNorms('Bekanntgabe (§ 122 Abs. 2)', 'AO')]).toEqual(['AO § 122'])
    expect([...citedNorms('Bekanntgabe (§ 122 Abs. 2)', null)]).toEqual([])
  })

  it('watches every norm the skill and the catalog cite: a new citation needs `laws:check --update`', () => {
    const watched = Object.keys(readLawWatch().norms)
    const missing = watchedNorms().filter((norm) => !watched.includes(norm))
    expect(missing, 'run pnpm --filter @steuereule/api run laws:check --update').toEqual([])
  })
})
