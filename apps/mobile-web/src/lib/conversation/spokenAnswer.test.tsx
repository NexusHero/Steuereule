import { describe, expect, it } from 'vitest'
import { conversationPassages, passagesAfter, speakablePassages } from './spokenAnswer'

describe('an answer in passages for a conversation', () => {
  it('speaks the first sentence alone, then pieces a voice takes whole', () => {
    expect(conversationPassages('Das sind rund 3.030 Euro. Das steht in Paragraf 9. Soll ich das vormerken?')).toEqual([
      'Das sind rund 3.030 Euro.',
      'Das steht in Paragraf 9. Soll ich das vormerken?',
    ])
  })

  it('does not open with a lone "Ja."', () => {
    expect(conversationPassages('Ja. Das ist absetzbar. Mehr dazu gleich.')).toEqual(['Ja. Das ist absetzbar.', 'Mehr dazu gleich.'])
    expect(conversationPassages('Ja.')).toEqual(['Ja.'])
    expect(conversationPassages('')).toEqual([])
  })

  it('cuts an opening sentence that is too long for the voice', () => {
    const long = `${'Wort '.repeat(60).trim()}. Ende.`
    const passages = conversationPassages(long)
    expect(passages.every((passage) => passage.length <= 220)).toBe(true)
    expect(passages.join(' ')).toBe(long)
  })
})

describe('what of a running answer can be spoken', () => {
  it('speaks a sentence as soon as the next one has begun', () => {
    expect(speakablePassages('Das sind rund 3.030 Euro. Soll ich', false, 'de')).toEqual(['Das sind rund 3.030 Euro.'])
    expect(speakablePassages('Das sind rund 3.030 Euro.', false, 'de')).toEqual([])
  })

  it('holds back the last passage while the answer is written, and speaks it once the answer is done', () => {
    const answer = 'Dein Arbeitsweg ist 38 Kilometer lang. Daraus ergeben sich rund 3.030 Euro. Soll ich das'
    const running = speakablePassages(answer, false, 'de')
    const done = speakablePassages(`${answer} vormerken?`, true, 'de')
    expect(running.length).toBe(done.length - 1)
    expect(done.slice(0, running.length)).toEqual(running)
    expect(done.join(' ')).toContain('vormerken?')
  })

  it('says nothing of an answer that has only begun', () => {
    expect(speakablePassages('Dein Arb', false, 'de')).toEqual([])
    expect(speakablePassages('', true, 'de')).toEqual([])
  })

  it('keeps half a citation to itself until it is whole', () => {
    const running = speakablePassages('Das ist absetzbar. Es steht in [estg-9', false, 'de')
    expect(running.join(' ')).not.toContain('[')
    expect(speakablePassages('Das ist absetzbar. Es steht in [estg-9-1].', true, 'de').join(' ')).toContain('Paragraf 9 Absatz 1')
  })
})

describe('which passages are new', () => {
  it('are those after the ones already said', () => {
    expect(passagesAfter(['Eins.'], ['Eins.', 'Zwei.', 'Drei.'])).toEqual(['Zwei.', 'Drei.'])
    expect(passagesAfter([], ['Eins.'])).toEqual(['Eins.'])
    expect(passagesAfter(['Eins.'], ['Eins.'])).toEqual([])
  })

  it('are none when the answer no longer starts with what was said', () => {
    expect(passagesAfter(['Eins.'], ['Anders.', 'Zwei.'])).toEqual([])
    expect(passagesAfter(['Eins.', 'Zwei.'], ['Eins.'])).toEqual([])
  })
})
