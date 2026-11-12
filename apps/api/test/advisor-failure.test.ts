import { describe, expect, it } from 'vitest'
import { classifyModelFailure } from '../src/ki/advisor-failure.js'

const google = (status: string, text: string) =>
  new Error(`[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse: [${status}] ${text}`)

describe('classifyModelFailure (#486)', () => {
  it.each([
    ['an invalid key', google('400 Bad Request', 'API key not valid. Please pass a valid API key.'), 'not-configured', 'Gemini · HTTP 400'],
    ['a key without permission', google('403 Forbidden', 'Permission denied'), 'not-configured', 'Gemini · HTTP 403'],
    ['an unknown model', google('404 Not Found', 'models/gemini-x is not found'), 'not-configured', 'Gemini · HTTP 404'],
    ['an exhausted quota', google('429 Too Many Requests', 'Resource has been exhausted (e.g. check quota).'), 'quota', 'Gemini · HTTP 429'],
    ['an overloaded model', google('503 Service Unavailable', 'The model is overloaded. Please try again later.'), 'unavailable', 'Gemini · HTTP 503'],
    ['a server error', google('500 Internal Server Error', 'Internal error'), 'unavailable', 'Gemini · HTTP 500'],
    ['a refused answer', new Error('[GoogleGenerativeAI Error]: Candidate was blocked due to SAFETY'), 'blocked', 'Gemini'],
    ['a broken stream', new Error('[GoogleGenerativeAI Error]: Error reading from the stream'), 'network', 'Gemini'],
    ['a dropped connection', new TypeError('fetch failed'), 'network', 'Gemini'],
    ['something unforeseen', new Error('kaboom'), 'unknown', 'Gemini'],
  ])('sorts %s', (_label, error, reason, detail) => {
    expect(classifyModelFailure(error, 'error', 'google-genai')).toEqual({ reason, detail })
  })

  it('knows a timeout from how the turn ended, whatever the error says', () => {
    expect(classifyModelFailure(new Error('Error reading from the stream'), 'timeout', 'google-genai')).toEqual({ reason: 'timeout', detail: 'Gemini' })
  })

  it('reads the status other providers put on the error itself', () => {
    expect(classifyModelFailure(Object.assign(new Error('rate_limit_error'), { status: 429 }), 'error', 'anthropic')).toEqual({ reason: 'quota', detail: 'Claude · HTTP 429' })
    expect(classifyModelFailure(Object.assign(new Error('invalid x-api-key'), { status: 401 }), 'error', 'anthropic')).toEqual({ reason: 'not-configured', detail: 'Claude · HTTP 401' })
  })

  it('never lets the message text out as detail', () => {
    const { detail } = classifyModelFailure(google('400 Bad Request', 'API key not valid: AIzaSyFAKEKEYFAKEKEYFAKEKEY0000000000'), 'error', 'google-genai')
    expect(detail).toBe('Gemini · HTTP 400')
  })
})
