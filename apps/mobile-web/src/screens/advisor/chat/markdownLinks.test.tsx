import { describe, expect, it } from 'vitest'
import { linkLegalSources, plainTextForCopy, safeLinkTarget, sourceFromLink } from './markdownLinks'

describe('chat Markdown links (#451 slice 1b)', () => {
  it('turns a known citation into a chip link and leaves unknown ones alone', () => {
    expect(linkLegalSources('Siehe [estg-9-1].')).toBe('Siehe [§ 9 Abs. 1 EStG](eulequelle:estg-9-1).')
    expect(linkLegalSources('Siehe [estg-999].')).toBe('Siehe [estg-999].')
    expect(sourceFromLink('eulequelle:estg-9-1')).toBe('estg-9-1')
    expect(sourceFromLink('eulequelle:nope')).toBeNull()
  })

  it('opens only http, https and mailto links', () => {
    expect(safeLinkTarget('https://www.gesetze-im-internet.de/estg/__9.html')).toBe('https://www.gesetze-im-internet.de/estg/__9.html')
    expect(safeLinkTarget('mailto:hallo@example.org')).toBe('mailto:hallo@example.org')
    expect(safeLinkTarget('javascript:alert(1)')).toBeNull()
    expect(safeLinkTarget(' JavaScript:alert(1)')).toBeNull()
    expect(safeLinkTarget('data:text/html,<script>')).toBeNull()
    expect(safeLinkTarget('/relative')).toBeNull()
  })

  it('copies citations as readable paragraphs', () => {
    expect(plainTextForCopy('**Ja**, nach [estg-9-1].')).toBe('**Ja**, nach (§ 9 Abs. 1 EStG).')
  })
})
