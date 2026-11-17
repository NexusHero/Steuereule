import { describe, expect, it } from 'vitest'
import { needsPersonalDataConsentOffer, type ConsentOfferInput } from './advisor-consent-offer'

const base: ConsentOfferInput = { consent: false, maskedPersonalData: false, consentRequested: false, message: 'Lohnt sich mein Arbeitsweg?', reply: 'Ja, ab dem ersten Kilometer.', hasChildRecord: false, hasPersonB: false }
const offer = (over: Partial<ConsentOfferInput>) => needsPersonalDataConsentOffer({ ...base, ...over })

describe('when the answer carries the consent card (ADR-0091)', () => {
  it('never with the consent given', () => {
    expect(offer({ consent: true, maskedPersonalData: true, consentRequested: true, message: 'Meine Tochter Mila', reply: 'Erteile die Einwilligung.' })).toBe(false)
  })

  it('not for a question without personal data', () => {
    expect(offer({})).toBe(false)
  })

  it('when the masking took something out of the message', () => {
    expect(offer({ maskedPersonalData: true })).toBe(true)
  })

  it('when the owl asked for it, by tool or by a refused draft', () => {
    expect(offer({ consentRequested: true })).toBe(true)
  })

  it('when the answer points the user to the consent, whatever the model called', () => {
    expect(offer({ reply: 'Du kannst mir unter dieser Antwort die Einwilligung geben.' })).toBe(true)
    expect(offer({ reply: 'Dafür müsstest du einwilligen.' })).toBe(true)
    expect(offer({ reply: 'You can give your consent below this answer.' })).toBe(true)
    expect(offer({ reply: 'Du kannst mir einmalig erlauben, persönliche Daten zu verarbeiten.' })).toBe(true)
  })

  it('when the user names a child and none is recorded yet', () => {
    expect(offer({ message: 'Wir haben eine Tochter, geboren im Mai 2021.' })).toBe(true)
    expect(offer({ message: 'Unser Sohn geht in die Kita.' })).toBe(true)
    expect(offer({ message: 'Kindergeld haben wir für unser Kind bekommen.' })).toBe(true)
    expect(offer({ message: 'We have a daughter.' })).toBe(true)
  })

  it('not for a child that is already recorded, and not for „keine Kinder“', () => {
    expect(offer({ message: 'Unser Sohn geht in die Kita.', hasChildRecord: true })).toBe(false)
    expect(offer({ message: 'Wir haben keine Kinder.' })).toBe(false)
    expect(offer({ message: 'Ich bin ledig, ohne Kind.' })).toBe(false)
  })

  it('when the user names a spouse and there is no Person B yet', () => {
    expect(offer({ message: 'Meine Frau arbeitet in Basel.' })).toBe(true)
    expect(offer({ message: 'Wir sind verheiratet und wollen die Zusammenveranlagung.' })).toBe(true)
    expect(offer({ message: 'Meine Frau arbeitet in Basel.', hasPersonB: true })).toBe(false)
    expect(offer({ message: 'Ich bin nicht verheiratet.' })).toBe(false)
  })

  it('when the user says in the chat that they consent', () => {
    expect(offer({ message: 'Ja, ich erteile die Einwilligung.', reply: 'Gut.' })).toBe(true)
    expect(offer({ message: 'Ich erlaube dir, meine persönlichen Daten zu verarbeiten.', reply: 'Gut.' })).toBe(true)
  })

  it('when the user writes a birth date or an address', () => {
    expect(offer({ message: 'Geboren am 09.03.2021.' })).toBe(true)
    expect(offer({ message: 'Ich wohne in der Musterstraße 12 in 79539 Lörrach.' })).toBe(true)
    expect(offer({ message: 'Die Betreuung lief vom 01.01.2025 bis 31.12.2025.' })).toBe(false)
  })
})
