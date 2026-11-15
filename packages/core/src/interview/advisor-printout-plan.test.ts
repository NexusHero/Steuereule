import { describe, expect, it } from 'vitest'
import {
  asksWhatIsMissing,
  describePrintoutPlanForPrompt,
  nextPrintoutGapQuestions,
  planPrintoutGaps,
  printoutGapFollowUp,
  printoutGapKey,
  printoutGapReads,
  type PrintoutGapContext,
  type PrintoutGapPlan,
} from './advisor-printout-plan'

const single: PrintoutGapContext = { joint: false, personB: null, children: [], rentals: [], personalDataConsent: true }
const couple: PrintoutGapContext = { joint: true, personB: { recordable: true }, children: ['Kind 1', 'Kind 2'], rentals: [], personalDataConsent: true }

const keysOf = (plan: PrintoutGapPlan) => plan.questions.map((q) => q.key)

describe('printoutGapReads — what the plan reads to know what is empty', () => {
  it('reads B’s cross-border answers and Lohnausweis fields for grenzgaengerPersonB', () => {
    const reads = printoutGapReads(['grenzgaengerPersonB'], couple).map(printoutGapKey)
    expect(reads).toContain('B|interview.ch-wohnsitz')
    expect(reads).toContain('B|interview.ch-nichtrueckkehrtage')
    expect(reads).toContain('B|chLohnausweis.quellensteuer')
    expect(reads).toContain('B|chLohnausweis.nGreSonderfaelle')
    expect(reads.some((key) => key.startsWith('A|'))).toBe(false)
  })

  it('reads every child’s fields for kinder, and the Swiss allowances of both', () => {
    const reads = printoutGapReads(['kinder'], couple).map(printoutGapKey)
    for (const handle of ['Kind 1', 'Kind 2']) {
      for (const field of ['taxId', 'kinship', 'kinshipB', 'familyBenefitsOffice', 'domesticResidenceAllYear', 'otherParent', 'swissFamilyAllowancePayer']) {
        expect(reads).toContain(`A|kind:${handle}.${field}`)
      }
    }
    expect(reads).toContain('A|chLohnausweis.familienzulagenChf')
    expect(reads).toContain('B|chLohnausweis.familienzulagenChf')
  })

  it('reads nothing for codes without fields, and nothing twice', () => {
    expect(printoutGapReads(['anlageKapKrypto', 'zuLang.est1a.name', 'name'], single)).toEqual([])
    const reads = printoutGapReads(['grenzgaenger', 'kinder', 'kinder'], { ...single, children: ['Kind 1'] }).map(printoutGapKey)
    expect(new Set(reads).size).toBe(reads.length)
  })
})

describe('planPrintoutGaps — the questions that close each gap', () => {
  it('asks Weber for the depot kind and the owner of a joint return’s depot (kapital)', () => {
    const plan = planPrintoutGaps(['kapital'], { ...couple, children: [] }, {
      'A|interview.kap-depot': null,
      'A|kapital.inhaber': null,
      'A|kapital.kapitalertraege': '50000',
      'A|kapital.sparerPauschbetrag': '2000',
      'A|kapital.kapitalertragsteuer': '12000',
      'A|kapital.solidaritaetszuschlag': '660',
      'A|kapital.kirchensteuer': '0',
    })
    expect(keysOf(plan)).toEqual(['A|interview.kap-depot', 'A|kapital.inhaber'])
    expect(plan.questions.every((q) => q.owlMayDraft)).toBe(true)
    expect(plan.unplanned).toEqual([])
  })

  it('asks for the missing capital amounts of a German broker, even as 0, but not the owner of a single return', () => {
    const plan = planPrintoutGaps(['kapital'], single, { 'A|interview.kap-depot': 'Deutscher Broker', 'A|kapital.kapitalertraege': '800', 'A|kapital.sparerPauschbetrag': '800' })
    expect(keysOf(plan)).toEqual(['A|kapital.kapitalertragsteuer', 'A|kapital.solidaritaetszuschlag', 'A|kapital.kirchensteuer'])
    const foreign = planPrintoutGaps(['kapital'], single, { 'A|interview.kap-depot': 'Ausländischer Broker', 'A|kapital.kapitalertraege': '800' })
    expect(keysOf(foreign)).toEqual(['A|kapital.sparerPauschbetrag'])
  })

  it('asks Sommer for Person B’s own Grenzgänger answers and the N-Gre facts of both', () => {
    const filled = (person: 'A' | 'B') => ({
      [`${person}|chLohnausweis.bruttolohn-total`]: '54000',
      [`${person}|chLohnausweis.ahv-beitraege`]: '3456',
      [`${person}|chLohnausweis.quellensteuer`]: '2430',
      [`${person}|chLohnausweis.familienzulagenChf`]: '0',
      [`${person}|chLohnausweis.pkArbeitnehmerChf`]: '2100',
      [`${person}|chLohnausweis.pkArbeitgeberChf`]: '2100',
      [`${person}|chLohnausweis.arbeitgeberName`]: 'AG',
      [`${person}|chLohnausweis.arbeitgeberStrasse`]: 'Weg 2',
      [`${person}|chLohnausweis.arbeitgeberPlzOrt`]: '4058 Basel',
      [`${person}|chLohnausweis.wechselkurs`]: '1.065',
      [`${person}|chLohnausweis.krankentaggeldArbeitgeberProzent`]: '100',
      [`${person}|chLohnausweis.krankentaggeldArbeitgeberChf`]: '182',
      [`${person}|chLohnausweis.nbuvArbeitgeberProzent`]: '100',
      [`${person}|chLohnausweis.nbuvArbeitgeberChf`]: '215',
    })
    const plan = planPrintoutGaps(['grenzgaenger', 'grenzgaengerPersonB'], couple, {
      ...filled('A'),
      ...filled('B'),
      'A|interview.ch-wohnsitz': 'Deutschland',
      'A|interview.ch-nichtrueckkehrtage': '0',
    })
    expect(keysOf(plan)).toEqual([
      'A|chLohnausweis.krankentaggeldChf',
      'A|chLohnausweis.nGreSonderfaelle',
      'B|interview.ch-wohnsitz',
      'B|interview.ch-nichtrueckkehrtage',
      'B|chLohnausweis.krankentaggeldChf',
      'B|chLohnausweis.nGreSonderfaelle',
    ])
    const wohnsitzB = plan.questions.find((q) => q.key === 'B|interview.ch-wohnsitz')!
    expect(wohnsitzB).toMatchObject({ person: 'B', subject: 'Person B', owlMayDraft: true })
    expect(wohnsitzB.mask).toMatch(/Person B/)
  })

  it('clarifies who pays a premium the way the printout does', () => {
    const base = { 'A|chLohnausweis.krankentaggeldChf': '120', 'A|chLohnausweis.nbuvArbeitgeberProzent': '50' }
    expect(keysOf(planPrintoutGaps(['grenzgaenger'], single, base))).toContain('A|chLohnausweis.krankentaggeldArbeitgeberProzent')
    const full = planPrintoutGaps(['grenzgaenger'], single, { ...base, 'A|chLohnausweis.krankentaggeldArbeitgeberProzent': '100', 'A|chLohnausweis.nbuvArbeitgeberProzent': '100' })
    expect(keysOf(full)).toContain('A|chLohnausweis.krankentaggeldArbeitgeberChf')
    expect(keysOf(full)).toContain('A|chLohnausweis.nbuvArbeitgeberChf')
    expect(keysOf(full)).not.toContain('A|chLohnausweis.krankentaggeldArbeitgeberProzent')
    const zero = planPrintoutGaps(['grenzgaenger'], single, { 'A|chLohnausweis.krankentaggeldChf': '0' })
    expect(keysOf(zero)).not.toContain('A|chLohnausweis.krankentaggeldArbeitgeberProzent')
  })

  it('does not ask for the non-return days of someone living in Switzerland', () => {
    const plan = planPrintoutGaps(['grenzgaenger'], single, { 'A|interview.ch-wohnsitz': 'Schweiz' })
    expect(keysOf(plan)).not.toContain('A|interview.ch-nichtrueckkehrtage')
  })

  it('asks a couple’s children for kinship to both, the Familienkasse, residence and the Kinderzulage payer', () => {
    const plan = planPrintoutGaps(['kinder'], couple, {
      'A|kind:Kind 1.taxId': '31000015838',
      'A|kind:Kind 1.kinship': null,
      'A|kind:Kind 1.kinshipB': null,
      'A|kind:Kind 2.taxId': '31000023757',
      'A|kind:Kind 2.kinship': '1',
      'A|kind:Kind 2.kinshipB': '1',
      'A|kind:Kind 2.familyBenefitsOffice': 'Familienkasse BW West',
      'A|kind:Kind 2.domesticResidenceAllYear': 'true',
      'A|chLohnausweis.familienzulagenChf': '5160',
    })
    expect(keysOf(plan)).toEqual([
      'A|kind:Kind 1.kinship',
      'A|kind:Kind 1.kinshipB',
      'A|kind:Kind 1.familyBenefitsOffice',
      'A|kind:Kind 1.domesticResidenceAllYear',
      'A|kind:Kind 1.swissFamilyAllowancePayer',
      'A|kind:Kind 2.swissFamilyAllowancePayer',
    ])
    expect(plan.questions[0]).toMatchObject({ subject: 'Kind 1', record: 'Kind 1', required: true })
    expect(plan.questions.at(-1)).toMatchObject({ required: false })
  })

  it('asks a single parent for the other parent and the Kindergeld flags (Richter)', () => {
    const ctx = { ...single, children: ['Kind 1'] }
    const base = {
      'A|kind:Kind 1.taxId': '91234567890',
      'A|kind:Kind 1.kinship': '1',
      'A|kind:Kind 1.familyBenefitsOffice': null,
      'A|kind:Kind 1.domesticResidenceAllYear': null,
    }
    expect(keysOf(planPrintoutGaps(['kinder'], ctx, base))).toEqual([
      'A|kind:Kind 1.familyBenefitsOffice',
      'A|kind:Kind 1.domesticResidenceAllYear',
      'A|kind:Kind 1.otherParent',
      'A|kind:Kind 1.registeredWithMeAllYear',
      'A|kind:Kind 1.childBenefitToMeAllYear',
    ])
    const inland = keysOf(planPrintoutGaps(['kinder'], ctx, { ...base, 'A|kind:Kind 1.otherParent': 'Inland', 'A|kind:Kind 1.otherParentName': 'X' }))
    expect(inland).toEqual(expect.arrayContaining(['A|kind:Kind 1.otherParentBirthDate', 'A|kind:Kind 1.otherParentKind', 'A|kind:Kind 1.otherParentAddress']))
    expect(inland).not.toContain('A|kind:Kind 1.otherParentName')
    const died = keysOf(planPrintoutGaps(['kinder'], ctx, { ...base, 'A|kind:Kind 1.otherParent': 'Verstorben' }))
    expect(died).toContain('A|kind:Kind 1.otherParentDiedOn')
    expect(died).not.toContain('A|kind:Kind 1.otherParentAddress')
    expect(keysOf(planPrintoutGaps(['kinder'], ctx, { ...base, 'A|kind:Kind 1.otherParent': 'Unbekannt' }))).not.toContain('A|kind:Kind 1.otherParentName')
  })

  it('asks a child living abroad nothing the printout could use', () => {
    const plan = planPrintoutGaps(['kinder'], { ...couple, children: ['Kind 1'] }, {
      'A|kind:Kind 1.taxId': '1',
      'A|kind:Kind 1.kinship': '1',
      'A|kind:Kind 1.kinshipB': '1',
      'A|kind:Kind 1.familyBenefitsOffice': 'FK',
      'A|kind:Kind 1.domesticResidenceAllYear': 'false',
    })
    expect(plan.questions).toEqual([])
  })

  it('asks for the children themselves when none is recorded, and needs the consent for it', () => {
    const plan = planPrintoutGaps(['kinder'], single, {})
    expect(plan.questions).toHaveLength(1)
    expect(plan.questions[0]).toMatchObject({ screen: 'kind', field: 'firstName', record: 'neu', owlMayDraft: true })
    const closed = planPrintoutGaps(['kinder'], { ...single, personalDataConsent: false }, {})
    expect(closed.questions[0]).toMatchObject({ owlMayDraft: false, mask: 'Kinder' })
  })

  it('without consent keeps personal fields for the mask, and figures for the owl (ADR-0091)', () => {
    const plan = planPrintoutGaps(['religion', 'steuerId', 'kinder'], { ...single, personalDataConsent: false, children: ['Kind 1'] }, { 'A|kind:Kind 1.kinship': null })
    const byKey = Object.fromEntries(plan.questions.map((q) => [q.key, q]))
    expect(byKey['A|stammdaten.religion']).toMatchObject({ owlMayDraft: false, mask: 'Stammdaten' })
    expect(byKey['A|profil.steuerId']).toMatchObject({ owlMayDraft: false, mask: 'Profil' })
    expect(byKey['A|kind:Kind 1.taxId']).toMatchObject({ owlMayDraft: false })
    expect(byKey['A|kind:Kind 1.kinship']).toMatchObject({ owlMayDraft: true })
  })

  it('asks Person B’s identity, with religion and occupation, and sends B with an own account to her account', () => {
    const plan = planPrintoutGaps(['personB'], couple, { 'B|profil.firstName': 'N', 'B|profil.lastName': 'S', 'B|profil.steuerId': '1' })
    expect(keysOf(plan)).toEqual(['B|stammdaten.geburtsdatum', 'B|stammdaten.religion', 'B|stammdaten.beruf'])
    const own = planPrintoutGaps(['personB'], { ...couple, personB: { recordable: false } }, {})
    expect(own.questions.every((q) => !q.owlMayDraft && /eigenen Konto/.test(q.mask))).toBe(true)
    const noB = planPrintoutGaps(['personB', 'ehegatte'], { ...single, joint: true }, {})
    expect(keysOf(noB)).toEqual(['A|kopplung.filingType'])
  })

  it('names the master data of A by the code, and rental gaps by the object', () => {
    const plan = planPrintoutGaps(['name', 'vorname', 'geburtsdatum', 'iban', 'vermietung'], { ...single, rentals: ['Objekt 1'] }, {
      'A|vermietung:Objekt 1.mieteinnahmen': '14400',
      'A|vermietung:Objekt 1.werbungskosten': 'unklar',
      'A|vermietung:Objekt 1.anschaffungskosten': '280000',
      'A|vermietung:Objekt 1.baujahr': '1995',
    })
    expect(keysOf(plan)).toEqual([
      'A|profil.lastName',
      'A|profil.firstName',
      'A|stammdaten.geburtsdatum',
      'A|stammdaten.iban',
      'A|vermietung:Objekt 1.werbungskosten',
      'A|vermietung:Objekt 1.strasse',
      'A|vermietung:Objekt 1.hausnummer',
      'A|vermietung:Objekt 1.plz',
      'A|vermietung:Objekt 1.city',
      'A|vermietung:Objekt 1.depreciationAsLastYear',
    ])
    expect(plan.questions.find((q) => q.record === 'Objekt 1')?.subject).toBe('Objekt 1')
  })

  it('asks Riester’s kind and, when direct, last year’s income', () => {
    expect(keysOf(planPrintoutGaps(['riester'], single, {}))).toEqual(['A|interview.riester-art'])
    expect(keysOf(planPrintoutGaps(['riester'], single, { 'A|interview.riester-art': 'Unmittelbar' }))).toEqual(['A|interview.riester-einnahmen-vorjahr'])
  })

  it('leaves codes without a field to the words of the printout check', () => {
    const plan = planPrintoutGaps(['anlageKapKrypto', 'unbestaetigt.personB', 'zuLang.est1a.name', 'anlageNDhf'], single, {})
    expect(plan.questions).toEqual([])
    expect(plan.unplanned).toEqual(['anlageKapKrypto', 'unbestaetigt.personB', 'zuLang.est1a.name', 'anlageNDhf'])
  })
})

describe('nextPrintoutGapQuestions — few per turn, grouped', () => {
  const plan = planPrintoutGaps(['grenzgaengerPersonB', 'kinder'], couple, { 'B|interview.ch-wohnsitz': 'Deutschland', 'A|kind:Kind 1.kinship': null })

  it('takes whole groups in order while they fit', () => {
    const next = nextPrintoutGapQuestions(plan, 4)
    expect(next.length).toBeLessThanOrEqual(4)
    expect(new Set(next.map((q) => q.subject)).size).toBe(1)
    expect(next[0]!.subject).toBe('Person B')
  })

  it('takes a second group when the first is small', () => {
    const small = planPrintoutGaps(['kapital', 'kinder'], { ...couple, children: ['Kind 1'] }, {
      'A|interview.kap-depot': 'Deutscher Broker',
      'A|kapital.kapitalertraege': '1',
      'A|kapital.sparerPauschbetrag': '1',
      'A|kapital.kapitalertragsteuer': '1',
      'A|kapital.solidaritaetszuschlag': '1',
      'A|kapital.kirchensteuer': '1',
      'A|kind:Kind 1.taxId': '1',
      'A|kind:Kind 1.familyBenefitsOffice': 'FK',
      'A|kind:Kind 1.domesticResidenceAllYear': 'true',
    })
    expect(nextPrintoutGapQuestions(small, 4).map((q) => q.subject)).toEqual(['Du', 'Kind 1', 'Kind 1'])
  })

  it('returns nothing for an empty plan', () => {
    expect(nextPrintoutGapQuestions({ questions: [], unplanned: [] })).toEqual([])
  })
})

describe('describePrintoutPlanForPrompt', () => {
  it('lists every question with its target and whether the owl may draft it', () => {
    const plan = planPrintoutGaps(['grenzgaengerPersonB', 'religion'], { ...couple, personalDataConsent: false }, {})
    const text = describePrintoutPlanForPrompt(plan).join('\n')
    expect(text).toMatch(/Ausdruck-Checkliste/)
    expect(text).toContain('`interview.ch-wohnsitz` (person „B“)')
    expect(text).toMatch(/Maske „Stammdaten“/)
    expect(text).toMatch(/Entwurf/)
  })

  it('names a record and says nothing is open when the plan is empty', () => {
    const plan = planPrintoutGaps(['kinder'], { ...single, children: ['Kind 1'] }, { 'A|kind:Kind 1.kinship': null })
    expect(describePrintoutPlanForPrompt(plan).join('\n')).toContain('(instance „Kind 1“)')
    expect(describePrintoutPlanForPrompt({ questions: [], unplanned: [] })).toEqual([])
  })
})

describe('asksWhatIsMissing', () => {
  it.each([
    'Fehlt jetzt noch etwas, damit meine Erklärung vollständig ist?',
    'fehlt noch was?',
    'Was fehlt noch für den Ausdruck?',
    'Ist alles vollständig?',
    'Is anything missing?',
    "What's still missing?",
    'Kann ich jetzt drucken?',
  ])('recognises „%s“', (message) => expect(asksWhatIsMissing(message)).toBe(true))

  it.each(['Ich fahre 15 km zur Arbeit.', 'Meine Frau heißt Sabine.'])('ignores „%s“', (message) => expect(asksWhatIsMissing(message)).toBe(false))
})

describe('printoutGapFollowUp — the deterministic question when the model leaves it out', () => {
  const plan = planPrintoutGaps(['kapital', 'grenzgaengerPersonB'], { ...couple, children: [] }, { 'A|interview.kap-depot': null, 'A|kapital.inhaber': null })
  const asked = { plan, message: 'Fehlt noch etwas?', reply: 'Alles sieht gut aus.', previousDraftsApplied: false, stagedKeys: [] }

  it('asks the next open questions when the user asks what is missing and the model did not', () => {
    const result = printoutGapFollowUp(asked)!
    expect(result.asked).toEqual(['A|interview.kap-depot', 'A|kapital.inhaber'])
    expect(result.text).toMatch(/Damit der Ausdruck vollständig ist/)
    expect(result.text).toMatch(/Broker/)
    expect(result.text).toMatch(/bereite ich die Einträge vor/)
  })

  it('adds nothing for questions the model asked itself, but still records them', () => {
    const result = printoutGapFollowUp({ ...asked, reply: 'Liegt das Depot bei einem deutschen Broker, und gehört es euch gemeinsam?' })!
    expect(result.text).toBe('')
    expect(result.asked).toEqual(['A|interview.kap-depot', 'A|kapital.inhaber'])
  })

  it('skips what the model drafted in this turn', () => {
    const result = printoutGapFollowUp({ ...asked, stagedKeys: ['A|interview.kap-depot', 'A|kapital.inhaber'] })!
    expect(result.asked[0]).toBe('B|interview.ch-wohnsitz')
  })

  it('asks after drafts were applied and the turn is otherwise quiet, but not twice the same', () => {
    const quiet = { ...asked, message: 'Danke!', reply: 'Gern geschehen.', previousDraftsApplied: true }
    expect(printoutGapFollowUp(quiet)?.text).toMatch(/Broker/)
    expect(printoutGapFollowUp({ ...quiet, previousAsked: ['A|interview.kap-depot', 'A|kapital.inhaber'] })).toBeNull()
    expect(printoutGapFollowUp({ ...quiet, reply: 'Hast du noch Belege?' })).toBeNull()
    expect(printoutGapFollowUp({ ...quiet, previousDraftsApplied: false })).toBeNull()
  })

  it('says where the user enters what the owl may not prepare', () => {
    const closed = planPrintoutGaps(['religion'], { ...single, personalDataConsent: false }, {})
    const result = printoutGapFollowUp({ ...asked, plan: closed })!
    expect(result.text).toMatch(/Maske „Stammdaten“/)
    expect(result.text).not.toMatch(/bereite ich die Einträge vor/)
  })

  it('labels a child by name when the app knows it', () => {
    const kids = planPrintoutGaps(['kinder'], { ...single, children: ['Kind 1'] }, { 'A|kind:Kind 1.taxId': '1', 'A|kind:Kind 1.kinship': '1', 'A|kind:Kind 1.domesticResidenceAllYear': 'true', 'A|kind:Kind 1.otherParent': 'Unbekannt' })
    const result = printoutGapFollowUp({ ...asked, plan: kids, subjectLabels: { 'Kind 1': 'Felix' } })!
    expect(result.text).toMatch(/Kind 1 \(Felix\)/)
  })

  it('has nothing to say for an empty plan', () => {
    expect(printoutGapFollowUp({ ...asked, plan: { questions: [], unplanned: [] } })).toBeNull()
  })
})
