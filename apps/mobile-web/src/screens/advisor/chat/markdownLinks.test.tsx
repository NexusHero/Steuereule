import { describe, expect, it } from 'vitest'
import { MAX_LINK_QUERY_LENGTH, classifyLink, linkLegalSources, plainTextForCopy, sourceFromLink } from './markdownLinks'

describe('chat Markdown links (#451 slice 1b)', () => {
  it('turns a known citation into a chip link and leaves unknown ones alone', () => {
    expect(linkLegalSources('Siehe [estg-9-1].')).toBe('Siehe [§ 9 Abs. 1 EStG](eulequelle:estg-9-1).')
    expect(linkLegalSources('Siehe [estg-999].')).toBe('Siehe [estg-999].')
    expect(sourceFromLink('eulequelle:estg-9-1')).toBe('estg-9-1')
    expect(sourceFromLink('eulequelle:nope')).toBeNull()
  })

  it('draws a citation the model wrote as code as a chip, and leaves other code alone', () => {
    expect(linkLegalSources('Pauschale (§ 4 Abs. 5 Nr. 6c EStG `[estg-4-5-6c]`) mit')).toBe(
      'Pauschale (§ 4 Abs. 5 Nr. 6c EStG [§ 4 Abs. 5 Nr. 6c EStG](eulequelle:estg-4-5-6c)) mit',
    )
    expect(linkLegalSources('Schreib `x[estg-9-1]` und [estg-9-1].')).toBe('Schreib `x[estg-9-1]` und [§ 9 Abs. 1 EStG](eulequelle:estg-9-1).')
    expect(linkLegalSources('```\n[estg-9-1] im Block\n```')).toBe('```\n[estg-9-1] im Block\n```')
    expect(linkLegalSources('Unbekannt: `[estg-999]`.')).toBe('Unbekannt: `[estg-999]`.')
    expect(plainTextForCopy('Nach `[estg-9-1]`.')).toBe('Nach (§ 9 Abs. 1 EStG).')
  })

  describe('classifyLink', () => {
    it('lets an official source open on tap, subdomains included', () => {
      expect(classifyLink('https://www.gesetze-im-internet.de/estg/__9.html')).toEqual({
        kind: 'trusted',
        url: 'https://www.gesetze-im-internet.de/estg/__9.html',
        host: 'www.gesetze-im-internet.de',
      })
      expect(classifyLink('https://www.elster.de/')).toMatchObject({ kind: 'trusted' })
      expect(classifyLink('https://bundesfinanzministerium.de/x')).toMatchObject({ kind: 'trusted' })
    })

    it('asks first for any other host and names it', () => {
      expect(classifyLink('https://evil.example/collect')).toEqual({ kind: 'confirm', url: 'https://evil.example/collect', host: 'evil.example' })
      expect(classifyLink('mailto:hallo@example.org')).toMatchObject({ kind: 'confirm', host: 'hallo@example.org' })
    })

    it('does not trust look-alike hosts or plain http', () => {
      expect(classifyLink('https://gesetze-im-internet.de.evil.example/')).toMatchObject({ kind: 'confirm', host: 'gesetze-im-internet.de.evil.example' })
      expect(classifyLink('https://evilelster.de/')).toMatchObject({ kind: 'confirm' })
      expect(classifyLink('http://www.elster.de/')).toMatchObject({ kind: 'confirm' })
    })

    it('shows the punycode form of a look-alike host', () => {
      expect(classifyLink('https://gesetze-im-internet.dе/')).toMatchObject({ kind: 'confirm', host: expect.stringContaining('xn--') })
    })

    it('renders other schemes, credentials and relative links as plain text', () => {
      for (const href of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', 'intent://x', '/relative', 'https://user:pw@www.elster.de/', 'https://user@evil.example/']) {
        expect(classifyLink(href)).toEqual({ kind: 'plain' })
      }
    })

    it('renders a link with a long query or fragment as plain text, even to an official host', () => {
      const long = 'a'.repeat(MAX_LINK_QUERY_LENGTH)
      expect(classifyLink(`https://www.elster.de/?q=${long}`)).toEqual({ kind: 'plain' })
      expect(classifyLink(`https://evil.example/#${long}`)).toEqual({ kind: 'plain' })
      expect(classifyLink('https://evil.example/?q=kurz')).toMatchObject({ kind: 'confirm' })
    })
  })

  it('copies citations as readable paragraphs', () => {
    expect(plainTextForCopy('**Ja**, nach [estg-9-1].')).toBe('**Ja**, nach (§ 9 Abs. 1 EStG).')
  })
})
