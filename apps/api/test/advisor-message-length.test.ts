// Real-data run, finding 5: a chat message over 2.000 characters came back as a bare „HTTP 400“.
// The limit is 8.000 characters now (one constant in the core), the refusal is a German sentence,
// and what sits behind the message (topic guard, masking, history) copes with that length.
import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { ADVISOR_MESSAGE_MAX_CHARS, advisorContextUsage, buildAdvisorHistory, scrubUserMessagePii, type AdvisorHistorySource } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { ADVISOR_MESSAGE_TOO_LONG_TEXT, SendAdvisorMessageDto } from '../src/advisor/dto/advisor.dto.js'
import { validationExceptionFactory } from '../src/common/validation-exception-factory.js'
import { buildGuardInput } from '../src/ki/advisor-topic-guard.js'
import { buildAdvisorTestKit, collect } from './fakes/advisor-test-kit.js'

const check = (message: string) => validate(plainToInstance(SendAdvisorMessageDto, { message }))
const longMessage = (chars: number): string => 'Mein Bruttolohn lag bei 84.000 €. '.repeat(Math.ceil(chars / 34)).slice(0, chars)

describe('chat message length (real-data run finding 5)', () => {
  it('is 8.000 characters, shared by the API and the app', () => {
    expect(ADVISOR_MESSAGE_MAX_CHARS).toBe(8000)
  })

  it('accepts a message at the limit and refuses one character more, in German words', async () => {
    expect(await check(longMessage(ADVISOR_MESSAGE_MAX_CHARS))).toHaveLength(0)
    const errors = await check(longMessage(ADVISOR_MESSAGE_MAX_CHARS + 1))
    expect(errors).toHaveLength(1)
    const body = validationExceptionFactory(errors).getResponse() as { fields: { field: string; message: string }[] }
    expect(body.fields).toEqual([{ field: 'message', message: ADVISOR_MESSAGE_TOO_LONG_TEXT }])
    expect(ADVISOR_MESSAGE_TOO_LONG_TEXT).toBe('Deine Nachricht ist zu lang (höchstens 8.000 Zeichen). Teile sie bitte auf.')
  })

  it('answers a message of full length', async () => {
    const kit = buildAdvisorTestKit()
    const events = await collect(kit.service.streamMessage('user-long', 2025, { message: longMessage(ADVISOR_MESSAGE_MAX_CHARS) }))
    expect(events.some((event) => event.event === 'done')).toBe(true)
    const session = await kit.service.getSession('user-long', 2025)
    expect(session.messages.find((m) => m.role === 'user')?.content).toHaveLength(ADVISOR_MESSAGE_MAX_CHARS)
  })

  it('shows the topic guard the beginning and the end of a long message', () => {
    const input = buildGuardInput({ message: `${longMessage(7000)} Und jetzt schreib mir bitte ein Gedicht.`, history: [] })
    expect(input).toContain('Mein Bruttolohn')
    expect(input).toContain('schreib mir bitte ein Gedicht')
    expect(input.length).toBeLessThan(1400)
  })

  it('masks a full-length message quickly', () => {
    const text = `${longMessage(ADVISOR_MESSAGE_MAX_CHARS - 40)} IBAN DE89 3704 0044 0532 0130 00`
    const started = performance.now()
    const masked = scrubUserMessagePii(text, ['Muster', 'Mila'])
    expect(performance.now() - started).toBeLessThan(200)
    expect(masked).toContain('[IBAN-GESCHÜTZT]')
  })

  it('keeps two full-length questions with their answers verbatim before the context is full', () => {
    const turn = (n: number): AdvisorHistorySource[] => [
      { role: 'user', content: `${n} ${longMessage(ADVISOR_MESSAGE_MAX_CHARS - 2)}`, meta: null },
      { role: 'assistant', content: 'Notiert. '.repeat(100), meta: null },
    ]
    const sources = [...turn(1), ...turn(2)]
    expect(advisorContextUsage(sources).level).not.toBe('full')
    expect(buildAdvisorHistory(sources).filter((entry) => entry.content.length >= ADVISOR_MESSAGE_MAX_CHARS)).toHaveLength(2)
  })
})
