import { describe, expect, it } from 'vitest'
import { textToRepeatAfterConsent } from './consentRetry'

describe('what the chat sends again once the user allowed personal data (ADR-0091)', () => {
  it('repeats the stored question when nothing in it was masked', () => {
    expect(textToRepeatAfterConsent('Unsere Tochter kam im Mai 2021 zur Welt.', null)).toBe('Unsere Tochter kam im Mai 2021 zur Welt.')
  })

  it('repeats what the user typed when the stored question is its masked form', () => {
    const typed = 'Mila Muster, Steuer-ID 12 345 678 901, geboren am 09.03.2021'
    expect(textToRepeatAfterConsent('[MANDANT] [MANDANT], Steuer-ID [STEUER-ID-GESCHÜTZT], geboren am 09.03.2021', typed)).toBe(typed)
  })

  it('has nothing to repeat when the masked question is not the one typed last, or was typed in an earlier session', () => {
    expect(textToRepeatAfterConsent('Meine IBAN ist [IBAN-GESCHÜTZT]', 'Lohnt sich mein Arbeitsweg?')).toBeNull()
    expect(textToRepeatAfterConsent('Meine IBAN ist [IBAN-GESCHÜTZT]', null)).toBeNull()
  })
})
