import { describe, expect, it } from 'vitest'
import { apiErrorText } from './apiErrorText'

describe('apiErrorText: what the API refused, in words', () => {
  it('reads the message of a domain error', () => {
    expect(apiErrorText({ code: 'ADVISOR_DAILY_LIMIT_EXCEEDED', message: 'Du hast dein Tageskontingent erreicht.' })).toBe('Du hast dein Tageskontingent erreicht.')
  })

  it('reads what the validation says about the chat message', () => {
    const body = { statusCode: 400, error: 'Bad Request', fields: [{ field: 'message', message: 'Deine Nachricht ist zu lang (höchstens 8.000 Zeichen). Teile sie bitte auf.' }] }
    expect(apiErrorText(body)).toBe('Deine Nachricht ist zu lang (höchstens 8.000 Zeichen). Teile sie bitte auf.')
  })

  it('has no words for a technical field or an empty body, so the caller says its own', () => {
    expect(apiErrorText({ statusCode: 400, fields: [{ field: 'activeScreen', message: 'activeScreen must be one of the following values: …' }] })).toBeNull()
    expect(apiErrorText(null)).toBeNull()
    expect(apiErrorText('Bad Request')).toBeNull()
    expect(apiErrorText({ message: ['a', 'b'] })).toBeNull()
  })
})
