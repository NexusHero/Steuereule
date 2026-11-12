import { describe, expect, it } from 'vitest'
import { checkAdvisorAnswer, type AdvisorAnswerCheckInput } from './advisor-answer-check'

const check = (input: Partial<AdvisorAnswerCheckInput> & { replyText: string }) =>
  checkAdvisorAnswer({ userMessage: '', drafts: [], notStagedCount: 0, computedFigures: [], ...input }).map((n) => n.kind)
const draft = { newValue: '1000', beforeRefundEur: 2000, afterRefundEur: 2341, deltaEur: 341 }

describe('checkAdvisorAnswer', () => {
  it('has nothing to say about an ordinary answer', () => {
    expect(check({ replyText: 'Spenden sind als Sonderausgaben abziehbar [estg-10b]. Ich habe einen Entwurf vorbereitet.', drafts: [draft] })).toEqual([])
  })

  describe('a euro effect the app did not compute', () => {
    it('flags an invented saving', () => {
      const notices = checkAdvisorAnswer({ replyText: 'Das bringt dir etwa 450 € Erstattung.', userMessage: 'Lohnt sich das?', drafts: [], notStagedCount: 0, computedFigures: [] })
      expect(notices).toHaveLength(1)
      expect(notices[0]).toMatchObject({ kind: 'unbacked-amount' })
      expect(notices[0]!.text).toContain('450 €')
    })

    it('accepts the figure of the draft, of a simulation, and what the user said', () => {
      expect(check({ replyText: 'Deine Erstattung steigt um 341 €, von 2.000 € auf 2.341 €.', drafts: [draft] })).toEqual([])
      expect(check({ replyText: 'Du sparst damit 120 € Steuern.', computedFigures: [120] })).toEqual([])
      expect(check({ replyText: 'Bei 1.000 € Spende sinkt deine Steuerlast, die Ersparnis hängt vom Steuersatz ab; 1.000 € sind voll abziehbar.', userMessage: 'Ich habe 1.000 € gespendet' })).toEqual([])
    })

    it('leaves limits and flat rates alone', () => {
      expect(check({ replyText: 'Der Arbeitnehmer-Pauschbetrag beträgt 1.230 €. Pro Homeoffice-Tag gibt es 6 €, höchstens 1.260 € im Jahr.' })).toEqual([])
    })

    it('does not take a rate or a cap of the law for a claim about this user', () => {
      expect(check({ replyText: 'Jeder Homeoffice-Tag bringt dir 6 € pro Tag, das spart Steuern.' })).toEqual([])
      expect(check({ replyText: 'Die Ersparnis ist auf höchstens 1.200 € begrenzt.' })).toEqual([])
      expect(check({ replyText: 'Du sparst bis zu 1.260 € im Jahr.' })).toEqual([])
      expect(check({ replyText: 'Handwerkerleistungen bringen dir eine Ersparnis von maximal 1.200 €.' })).toEqual([])
      // A figure stated as this user's saving is still a claim.
      expect(check({ replyText: 'Damit sparst du 1.000 € Steuern.' })).toEqual(['unbacked-amount'])
    })

    it('reads German thousands', () => {
      expect(check({ replyText: 'Du bekommst 2.341 € zurück erstattet.', drafts: [draft] })).toEqual([])
      expect(check({ replyText: 'Du bekommst 2.431 € zurück erstattet.', drafts: [draft] })).toEqual(['unbacked-amount'])
    })
  })

  describe('claims about writing', () => {
    it('flags „ich habe eingetragen“: the owl never writes', () => {
      expect(check({ replyText: 'Ich habe die 30 Homeoffice-Tage eingetragen.', drafts: [draft] })).toEqual(['claims-write'])
    })

    it('accepts the correct description of the draft flow', () => {
      expect(check({ replyText: 'Ich habe einen Entwurf vorbereitet. Der Wert wird erst eingetragen, wenn du ihn übernimmst.', drafts: [draft] })).toEqual([])
      expect(check({ replyText: 'Ich habe nichts gespeichert.' })).toEqual([])
      expect(check({ replyText: 'Du hast die Spende bereits übernommen.' })).toEqual([])
    })
  })

  describe('claims about a draft', () => {
    it('flags a prepared draft that does not exist', () => {
      expect(check({ replyText: 'Ich habe die Mieteinnahmen für dich vorbereitet.' })).toEqual(['nothing-prepared'])
    })

    it('is silent when there is a draft, or the app already reports the refusal', () => {
      expect(check({ replyText: 'Ich habe die Mieteinnahmen vorbereitet.', drafts: [draft] })).toEqual([])
      expect(check({ replyText: 'Ich habe die Mieteinnahmen vorbereitet.', notStagedCount: 1 })).toEqual([])
      expect(check({ replyText: 'Ich habe noch nichts vorbereitet.' })).toEqual([])
    })
  })

  it('flags a source that is not in the catalogue', () => {
    const notices = checkAdvisorAnswer({ replyText: 'Das steht in [estg-99-9] und [estg-10b].', userMessage: '', drafts: [], notStagedCount: 0, computedFigures: [] })
    expect(notices.map((n) => n.kind)).toEqual(['invented-source'])
    expect(notices[0]!.text).toContain('[estg-99-9]')
    expect(notices[0]!.text).not.toContain('[estg-10b]')
  })

  describe('topics outside the private income tax return', () => {
    it('adds the referral the answer left out', () => {
      expect(check({ userMessage: 'Wie mache ich meine Umsatzsteuer-Voranmeldung?', replyText: 'Du trägst die Umsätze in Zeile 81 ein.' })).toEqual(['out-of-scope'])
    })

    it('is silent when the owl sent the user on itself', () => {
      expect(check({ userMessage: 'Was ist mit Gewerbesteuer?', replyText: 'Dazu darf ich nicht beraten, bitte wende dich an eine Steuerberaterin.' })).toEqual([])
    })
  })
})
