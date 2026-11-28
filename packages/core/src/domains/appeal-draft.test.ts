import { describe, expect, it } from 'vitest'
import { APPEAL_DRAFT_BLANKS, appealDraft, type AppealDraftInput } from './appeal-draft'

const INPUT: AppealDraftInput = {
  taxYear: 2024,
  assessmentDate: '2026-11-02',
  today: '2026-11-27',
  positions: [
    { label: 'Homeoffice-Pauschale', declared: 1260, assessed: 1204, explanation: 'Es wurden nur 201 Tage anerkannt.' },
    { label: 'Arbeitsmittel', declared: 520, assessed: 482, explanation: null },
  ],
}

describe('the draft of an objection', () => {
  it('names the Bescheid by year and date and is dated today', () => {
    const letter = appealDraft(INPUT)
    expect(letter).toContain('Einspruch gegen den Einkommensteuerbescheid 2024 vom 02.11.2026')
    expect(letter).toContain('\n27.11.2026\n')
    expect(letter).toContain('gegen den oben genannten Bescheid lege ich Einspruch ein.')
  })

  it('lists every position with both figures and the difference, and quotes the tax office where it explained itself', () => {
    const letter = appealDraft(INPUT)
    expect(letter).toContain('Der Bescheid weicht in folgenden Punkten von meiner Steuererklärung ab:')
    expect(letter).toMatch(/- Homeoffice-Pauschale: erklärt 1\.260\s€, im Bescheid 1\.204\s€ \(Abweichung 56\s€\)\n {2}Erläuterung des Finanzamts: „Es wurden nur 201 Tage anerkannt\.“/)
    expect(letter).toMatch(/- Arbeitsmittel: erklärt 520\s€, im Bescheid 482\s€ \(Abweichung 38\s€\)\n\n/)
  })

  it('speaks of one point when there is one', () => {
    const letter = appealDraft({ ...INPUT, positions: INPUT.positions.slice(0, 1) })
    expect(letter).toContain('Der Bescheid weicht in folgendem Punkt von meiner Steuererklärung ab:')
  })

  it('leaves the name, the addresses, the tax number, the reasons and the signature for the user to fill in', () => {
    const letter = appealDraft(INPUT)
    for (const blank of APPEAL_DRAFT_BLANKS) expect(letter).toContain(blank)
  })

  it('is not written without a position that differs', () => {
    expect(() => appealDraft({ ...INPUT, positions: [] })).toThrow(/at least one position/)
  })
})
