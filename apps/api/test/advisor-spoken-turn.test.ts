// A spoken message (ADR-0115): the owl is told to answer for the ear, and thinks at its quickest level.
import { describe, expect, it } from 'vitest'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { SendAdvisorMessageDto } from '../src/advisor/dto/advisor.dto.js'
import { describeTurnContext, SPOKEN_HINT } from '../src/ki/advisor-prompt.js'
import type { ResolvedAiSlotConfig } from '../src/ki/ai-runtime-config.service.js'
import { withSpokenPace } from '../src/ki/langgraph-advisor.engine.js'

const CHAT: ResolvedAiSlotConfig = { slot: 'advisor_chat', enabled: true, provider: 'google-genai', model: 'gemini-3.8-flash', apiKey: 'k', thinkingLevel: 'medium', reasoning: 'summary' }

describe('the turn context of a spoken message', () => {
  it('asks for a short answer in sentences, without lists or headings, and one question at most', () => {
    const context = describeTurnContext('commute', false, false, true)
    expect(context).toContain('Aktive Maske: commute')
    expect(context).toContain(SPOKEN_HINT)
    expect(SPOKEN_HINT).toMatch(/höchstens drei kurzen Sätzen/)
    expect(SPOKEN_HINT).toMatch(/Keine Überschriften, Listen, Tabellen/)
    expect(SPOKEN_HINT).toMatch(/höchstens eine Rückfrage/)
  })

  it('leaves a typed message as it was', () => {
    expect(describeTurnContext('commute', false)).toBe('Aktive Maske: commute')
    expect(describeTurnContext('commute', false, false, false)).not.toContain(SPOKEN_HINT)
  })
})

describe('the pace of a spoken message', () => {
  it('thinks at the lowest level and keeps everything else of the slot', () => {
    expect(withSpokenPace(CHAT, true)).toEqual({ ...CHAT, thinkingLevel: 'low' })
  })

  it('leaves a typed message and a switched-off slot alone', () => {
    expect(withSpokenPace(CHAT, false)).toBe(CHAT)
    const off = { ...CHAT, enabled: false }
    expect(withSpokenPace(off, true)).toBe(off)
  })
})

describe('the request of a spoken message', () => {
  it('takes `spoken` as a boolean and refuses anything else', async () => {
    expect(await validate(plainToInstance(SendAdvisorMessageDto, { message: 'Hallo', spoken: true }))).toEqual([])
    expect(await validate(plainToInstance(SendAdvisorMessageDto, { message: 'Hallo' }))).toEqual([])
    expect((await validate(plainToInstance(SendAdvisorMessageDto, { message: 'Hallo', spoken: 'ja' }))).map((error) => error.property)).toEqual(['spoken'])
  })
})
