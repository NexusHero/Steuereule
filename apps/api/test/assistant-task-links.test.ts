import { describe, expect, it } from 'vitest'
import { containsLink } from '../src/assistant-task/assistant-task.service.js'
import { isEmailAddress } from '../src/config/production-config.js'

describe('containsLink (MCP-12), linear on assistant-written text', () => {
  it.each([
    'https://example.com',
    'ftp://host',
    'siehe www.beispiel.de',
    'ruf 192.168.0.1 auf',
    'auf beispiel.eu nachsehen',
    'info.xyz',
    'erledigt.Bitte',
    'xn--bcher-kva.example',
    'xn--bcher-kva.xn--p1ai',
  ])('finds a link in %j', (text) => {
    expect(containsLink(text)).toBe(true)
  })

  it.each(['Bitte Lohnsteuerbescheinigung hochladen', 'Betrag 1.234,56 prüfen', 'Fertig.', 'v1.2', ''])('finds none in %j', (text) => {
    expect(containsLink(text)).toBe(false)
  })

  it('answers a long hostile run without a match (the shape that backtracked before)', () => {
    expect(containsLink('a'.repeat(20_000) + '!')).toBe(false)
    expect(containsLink('a1'.repeat(10_000) + '!')).toBe(false)
  })
})

describe('isEmailAddress (EMAIL_FROM)', () => {
  it.each(['noreply@steuereule.example', 'a.b@mail.example.de'])('accepts %j', (value) => {
    expect(isEmailAddress(value)).toBe(true)
  })

  it.each(['', '@example.de', 'noreply', 'a@b', 'a@b.', 'a@.de', 'a@@b.de', 'a b@c.de', 'a@b@c.de'])('refuses %j', (value) => {
    expect(isEmailAddress(value)).toBe(false)
  })
})
