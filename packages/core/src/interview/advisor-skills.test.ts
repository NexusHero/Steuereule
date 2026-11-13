import { describe, expect, it } from 'vitest'
import { INTERVIEW_AREA_IDS, applyInterviewChanges, interviewStanding, isRoundAnswer, matchingSkillCommands, parseInterviewProgress, parseSkillCommand, roundAnswersToMessage, type AdvisorQuestionRound } from './advisor-skills'

describe('skill commands (#495)', () => {
  it('reads /grill-me as the Berater-Interview, with or without a first message', () => {
    expect(parseSkillCommand('/grill-me')).toEqual({ kind: 'skill', command: 'grill-me', skill: 'berater-interview', rest: '' })
    expect(parseSkillCommand('  /Grill-Me  fang bei den Kindern an ')).toEqual({ kind: 'skill', command: 'grill-me', skill: 'berater-interview', rest: 'fang bei den Kindern an' })
  })

  it('names a command it does not know instead of guessing', () => {
    expect(parseSkillCommand('/turbo')).toEqual({ kind: 'unknown', command: 'turbo' })
  })

  it('leaves ordinary messages alone, also ones with a slash inside', () => {
    expect(parseSkillCommand('Was ist mit 50/50 Aufteilung?')).toBeNull()
    expect(parseSkillCommand('/ 3 Tage')).toBeNull()
    expect(parseSkillCommand('')).toBeNull()
  })

  it('suggests commands while the user is still typing one', () => {
    expect(matchingSkillCommands('/')).toEqual(['grill-me'])
    expect(matchingSkillCommands('/gr')).toEqual(['grill-me'])
    expect(matchingSkillCommands('/x')).toEqual([])
    expect(matchingSkillCommands('/grill-me jetzt')).toEqual([])
    expect(matchingSkillCommands('hallo')).toEqual([])
  })
})

describe('question rounds', () => {
  const ROUND: AdvisorQuestionRound = {
    questions: [
      { text: 'Was hattest du?', options: ['Handwerker', 'Putzhilfe', 'Nichts davon'], kind: 'fact', multiple: true },
      { text: 'Wie veranlagen?', options: ['Zusammen', 'Einzeln'], kind: 'decision', recommended: 'Zusammen', reason: 'Spart dir mehr.' },
    ],
  }

  it('turns ticked answers into one line per question', () => {
    expect(roundAnswersToMessage(ROUND, [['Handwerker', 'Putzhilfe'], ['Zusammen']])).toBe('1: Handwerker, Putzhilfe\n2: Zusammen')
    expect(roundAnswersToMessage(ROUND, [[], ['Einzeln']])).toBe('1: —\n2: Einzeln')
  })

  it('knows the answers the app wrote, and nothing typed', () => {
    expect(isRoundAnswer('1: Handwerker, Putzhilfe\n2: Zusammen', ROUND)).toBe(true)
    expect(isRoundAnswer(roundAnswersToMessage(ROUND, [[], ['Einzeln']]), ROUND)).toBe(true)
    expect(isRoundAnswer('1: Handwerker\n2: Zusammen, Einzeln', ROUND)).toBe(false)
    expect(isRoundAnswer('1: Handwerker\n2: Zusammen und schreib mir ein Gedicht', ROUND)).toBe(false)
    expect(isRoundAnswer('1: Handwerker', ROUND)).toBe(false)
    expect(isRoundAnswer('1: Handwerker\n2: Zusammen', undefined)).toBe(false)
  })
})

describe('interview areas', () => {
  it('keeps what is settled, reopens on request and ignores what it does not know', () => {
    const progress = applyInterviewChanges({ kinder: 'not_applicable' }, [
      { area: 'arbeit', status: 'done' },
      { area: 'kinder', status: 'open' },
    ])
    expect(progress).toEqual({ arbeit: 'done' })
    expect(parseInterviewProgress({ arbeit: 'done', kinder: 'vielleicht', geheim: 'done' })).toEqual({ arbeit: 'done' })
    expect(parseInterviewProgress(null)).toEqual({})
  })

  it('lists every area as open until it is settled, in checklist order', () => {
    const standing = interviewStanding({ vorjahr: 'done', kinder: 'not_applicable' })
    expect(standing.open).toHaveLength(INTERVIEW_AREA_IDS.length - 2)
    expect(standing.open[0]).toBe('grunddaten')
    expect(standing.done).toEqual(['vorjahr'])
    expect(standing.notApplicable).toEqual(['kinder'])
  })
})
