// ADR-0068 §6-9 — does the Berater-Interview (/grill-me) work through the whole return against
// the REAL model? A simulated customer answers every round the way a real one taps: facts by what
// the persona has, decisions by the owl's pick. The app's part (the standing per tax year) is played
// here as the service does it. A case is a finding to look at, not a broken build.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  INTERVIEW_AREA_IDS,
  applyInterviewChanges,
  interviewStanding,
  roundAnswersToMessage,
  type AdvisorHistoryEntry,
  type AdvisorQuestionRound,
  type AdvisorRoundQuestion,
  type AdvisorStreamEvent,
  type AdvisorTurnResult,
  type CaseDigest,
  type InterviewProgress,
} from '@steuereule/core'
import { EnvAiRuntimeConfigService } from '../../src/ki/ai-runtime-config.service.js'
import { LangGraphAdvisorEngine } from '../../src/ki/langgraph-advisor.engine.js'

const KEY = process.env.AI_EVAL_GEMINI_API_KEY?.trim()
const REPORT_DIR = process.env.AI_EVAL_REPORT_DIR ?? '/tmp/ai-eval'
const MAX_ROUNDS = 16

const DIGEST: CaseDigest = {
  taxYear: 2025,
  filingStatus: 'einzel',
  profession: 'IT & Software',
  lstbPersonA: { grossWageEur: 58000, wageTaxEur: 9800, socialSecurityEur: 11300 },
  crossBorder: { isCrossBorderCh: false, grossWageChf: null, withholdingTaxChf: null, pillar3aChf: null, healthInsuranceChf: null, dailySicknessBenefitChf: null, nonReturnDays: null },
  commuteAndWorkdays: { workdays: null, homeOfficeAnswer: null, homeOfficeDays: null, distanceKm: null },
  catalogExpenses: { hasTraining: false, relocationCostsEur: null, donationsEur: null, selfPaidKvPvEur: null, riesterEur: null, doubleHouseholdRentEur: null },
  childrenCount: 0,
  rentalObjectsCount: 0,
  capitalGainEur: null,
  priorYearComparison: { donationsEur: null },
  openOwlHints: [],
  printoutMissingFields: [],
  estimatedRefundEur: null,
}

interface Persona {
  readonly name: string
  /** What the persona types when the owl asks for a number in words. */
  readonly figures: string
  /** What the persona has: a question about it is answered yes, a matching option is ticked. */
  readonly has: readonly RegExp[]
}

const PERSONAS: readonly Persona[] = [
  { name: 'single employee with little besides the job', figures: 'Zahlen: 18 km einfache Strecke, 28 Urlaubstage, 2 Krankheitstage, 40 Homeoffice-Tage.', has: [/arbeitsweg|pendel|fahr|entfernung|kilometer|km/i, /homeoffice/i, /krankenversicherung|kranken- und pflege/i, /arbeitstage/i] },
  {
    name: 'family with two children, craftsmen and a Riester contract',
    figures: 'Zahlen: 25 km einfache Strecke, 30 Urlaubstage, 3 Krankheitstage, Handwerker 400 € Arbeitskosten, Spenden 150 €, Riester 1.200 € Eigenbeitrag, Kita 3.000 €.',
    has: [/kind/i, /kindergeld/i, /betreuung|kita/i, /handwerk|maler|reparatur/i, /riester/i, /verheiratet|ehe/i, /arbeitsweg|pendel|fahr|entfernung|km/i, /spende/i, /krankenversicherung|kranken- und pflege/i, /arbeitstage/i],
  },
]

const NEGATIVE = /^(nein|keine?s?|nichts|trifft nicht zu|habe ich nicht)/i

function answer(question: AdvisorRoundQuestion, persona: Persona): string[] {
  if (question.kind === 'decision') return [question.recommended ?? question.options[0]!]
  const positive = (text: string) => persona.has.some((pattern) => pattern.test(text))
  if (question.multiple) {
    const ticked = question.options.filter((option) => !NEGATIVE.test(option) && positive(option))
    return ticked.length > 0 ? ticked : [question.options.find((option) => NEGATIVE.test(option)) ?? question.options.at(-1)!]
  }
  if (positive(question.text)) return [question.options.find((option) => !NEGATIVE.test(option)) ?? question.options[0]!]
  return [question.options.find((option) => NEGATIVE.test(option)) ?? question.options.at(-1)!]
}

interface Transcript {
  persona: string
  rounds: { asked: AdvisorQuestionRound | null; reply: string; answered: string; changes: unknown }[]
  progress: InterviewProgress
  finished: boolean
}

async function interview(engine: LangGraphAdvisorEngine, persona: Persona): Promise<Transcript> {
  const transcript: Transcript = { persona: persona.name, rounds: [], progress: {}, finished: false }
  const history: AdvisorHistoryEntry[] = []
  let message = 'Frag mich bitte durch meine Steuererklärung 2025.'
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let done: AdvisorTurnResult | null = null
    for await (const ev of engine.streamTurn({ message, digest: DIGEST, history, skill: 'berater-interview', interview: transcript.progress }) as AsyncIterable<AdvisorStreamEvent>) {
      if (ev.event === 'done') done = ev.data as AdvisorTurnResult
    }
    const reply = done?.replyText ?? '(keine Antwort)'
    const asked = done?.meta.questionRound ?? null
    transcript.progress = applyInterviewChanges(transcript.progress, done?.meta.interviewChanges ?? [])
    history.push({ role: 'user', content: message }, { role: 'assistant', content: reply })
    if (!asked) {
      transcript.rounds.push({ asked, reply, answered: '', changes: done?.meta.interviewChanges ?? [] })
      // No round: either the owl summarised at the end, or she stopped too early.
      transcript.finished = interviewStanding(transcript.progress).open.length === 0
      break
    }
    message = roundAnswersToMessage(asked, asked.questions.map((question) => answer(question, persona)))
    // A number asked for in words is typed, as a customer would.
    if (/(km|kilometer|tage|betrag|€|euro|summe)[^?]{0,80}\?/i.test(reply)) message += `\n${persona.figures}`
    transcript.rounds.push({ asked, reply, answered: message, changes: done?.meta.interviewChanges ?? [] })
  }
  return transcript
}

describe.skipIf(!KEY)('the Berater-Interview works through the return (live model, by hand)', () => {
  const engine = new LangGraphAdvisorEngine(
    new EnvAiRuntimeConfigService({ GEMINI_API_KEY: KEY, AI_ADVISOR_PROVIDER: 'google-genai', ...(process.env.AI_EVAL_GEMINI_MODEL ? { AI_ADVISOR_MODEL: process.env.AI_EVAL_GEMINI_MODEL } : {}) }),
  )

  it.each(PERSONAS)(
    '$name',
    async (persona) => {
      const transcript = await interview(engine, persona)
      mkdirSync(REPORT_DIR, { recursive: true })
      writeFileSync(join(REPORT_DIR, `interview-${persona.name.split(' ')[0]}.json`), JSON.stringify(transcript, null, 2))
      const questions = transcript.rounds.flatMap((round) => round.asked?.questions ?? [])
      const standing = interviewStanding(transcript.progress)

      expect.soft(questions.length, 'asks questions at all').toBeGreaterThan(0)
      expect.soft(questions.every((question) => question.options.length >= 2), 'every question has answers to tap').toBe(true)
      expect.soft(questions.filter((question) => question.kind !== 'decision' && question.recommended !== undefined), 'no recommendation on a fact').toEqual([])
      expect.soft(questions.some((question) => question.multiple), 'uses a question with several answers at least once').toBe(true)
      expect.soft(questions.filter((question) => /steuer-?id|identifikationsnummer|iban|geburtsdatum|wie heißt|dein name|adresse/i.test(question.text)).map((q) => q.text), 'never asks for personal data').toEqual([])
      expect.soft(standing.open, `settles every area within ${MAX_ROUNDS} rounds`).toEqual([])
      expect.soft(transcript.finished, 'ends with a summary, not mid-way').toBe(true)
      const last = transcript.rounds.at(-1)?.reply ?? ''
      expect.soft(last, 'the summary names what is settled').toMatch(/erledigt|geklärt|vorbereitet|zusammen/i)
      expect(INTERVIEW_AREA_IDS.length).toBe(10)
    },
    40 * 60 * 1000,
  )
})

describe('interview eval personas', () => {
  it('answer a fact by what they have and a decision by the owl’s pick', () => {
    const family = PERSONAS[1]!
    expect(answer({ text: 'Hattest du 2025 Kinder?', options: ['Ja', 'Nein'], kind: 'fact' }, family)).toEqual(['Ja'])
    expect(answer({ text: 'Hattest du Mieteinnahmen?', options: ['Ja', 'Nein'], kind: 'fact' }, family)).toEqual(['Nein'])
    expect(answer({ text: 'Was davon?', options: ['Handwerker', 'Putzhilfe', 'Nichts davon'], kind: 'fact', multiple: true }, family)).toEqual(['Handwerker'])
    expect(answer({ text: 'Was davon?', options: ['Putzhilfe', 'Gärtner', 'Nichts davon'], kind: 'fact', multiple: true }, family)).toEqual(['Nichts davon'])
    expect(answer({ text: 'Wie veranlagen?', options: ['Zusammen', 'Einzeln'], kind: 'decision', recommended: 'Einzeln' }, family)).toEqual(['Einzeln'])
  })
})
