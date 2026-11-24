import { describe, expect, it } from 'vitest'
import { MAX_LINK_QUERY_LENGTH, classifyLink, linkLegalSources, plainTextForCopy, sourceFromLink } from './markdownLinks'

describe('chat Markdown links (#451 slice 1b)', () => {
  it('turns a known citation into a chip link and leaves unknown ones alone', () => {
    expect(linkLegalSources('Siehe [estg-9-1].')).toBe('Siehe [§ 9 Abs. 1 EStG](eulequelle:estg-9-1).')
    expect(linkLegalSources('Siehe [estg-999].')).toBe('Siehe [estg-999].')
    expect(sourceFromLink('eulequelle:estg-9-1')).toBe('estg-9-1')
    expect(sourceFromLink('eulequelle:nope')).toBeNull()
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
