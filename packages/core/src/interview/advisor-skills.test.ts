import { describe, expect, it } from 'vitest'
import { matchingSkillCommands, parseSkillCommand } from './advisor-skills'

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
