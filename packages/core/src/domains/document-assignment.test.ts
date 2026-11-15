import { describe, expect, it } from 'vitest'
import {
  addAmounts,
  amountCombination,
  decideDocumentHolder,
  holderChildId,
  holderPerson,
  holderScopeOf,
  isHolderRef,
  memberNamed,
  nameFitsMember,
  otherNamedMembers,
  printedHolderName,
  printedPersonDetails,
  printedPersonNames,
  looksLikeWorkExpenseReceipt,
  receiptIssuer,
  sameReceiptAgain,
  sectionForMember,
  sumFieldCombination,
  type AssignmentMember,
} from './document-assignment'

const A: AssignmentMember = { ref: 'A', firstName: 'Elias', lastName: 'Sommer' }
const B: AssignmentMember = { ref: 'B', firstName: 'Nora', lastName: 'Sommer' }
const LIO: AssignmentMember = { ref: 'kind:lio', firstName: 'Lio', lastName: 'Sommer' }
const IDA: AssignmentMember = { ref: 'kind:ida', firstName: 'Ida', lastName: 'Sommer' }
const NAMELESS_A: AssignmentMember = { ref: 'A', firstName: null, lastName: null }

describe('holder references', () => {
  it('accepts A, B and a child, nothing else', () => {
    expect(['A', 'B', 'kind:abc-1'].every(isHolderRef)).toBe(true)
    expect(['C', 'kind:', 'kind:a b', 7, null].some(isHolderRef)).toBe(false)
  })

  it('knows the child and whose record a holder writes', () => {
    expect(holderChildId('kind:lio')).toBe('lio')
    expect(holderChildId('B')).toBeNull()
    expect(holderPerson('B')).toBe('B')
    expect(holderPerson('A')).toBe('A')
    expect(holderPerson('kind:lio')).toBe('A')
  })
})

describe('who can hold a document', () => {
  it('wage papers are an adult’s, a statement anyone’s, a Kita notice a child’s, a donation nobody’s', () => {
    expect(holderScopeOf('lstb', '')).toBe('adults')
    expect(holderScopeOf('chLohnausweis', '')).toBe('adults')
    expect(holderScopeOf('chPensionskasse', '')).toBe('adults')
    expect(holderScopeOf('chPraemien', '')).toBe('adults')
    expect(holderScopeOf('chKrankenkasse', '')).toBe('everyone')
    expect(holderScopeOf('auto', 'Kita Sonnenschein\nJahresbescheinigung Elternbeiträge')).toBe('children')
    expect(holderScopeOf('auto', 'Spendenbescheinigung 300 EUR')).toBe('none')
  })
})

describe('names', () => {
  it('fits an adult by first and last name, a child by the first name', () => {
    expect(nameFitsMember('Nora Sommer', B)).toBe(true)
    expect(nameFitsMember('Nora Winter', B)).toBe(false)
    expect(nameFitsMember('Lio', LIO)).toBe(true)
    expect(nameFitsMember('Elias Sommer', NAMELESS_A)).toBe(false)
  })

  it('names one member or nobody', () => {
    expect(memberNamed('Nora Sommer', [A, B])?.ref).toBe('B')
    expect(memberNamed(null, [A, B])).toBeNull()
    expect(memberNamed('Erika Fremd', [A, B])).toBeNull()
    expect(memberNamed('Sommer', [{ ref: 'A', firstName: 'Sommer', lastName: null }, { ref: 'B', firstName: 'Sommer', lastName: null }])).toBeNull()
  })

  it('reads the holder name of a document', () => {
    expect(printedHolderName('Ausdruck der elektronischen Lohnsteuerbescheinigung\nNora Sommer\n3. Bruttoarbeitslohn 21.000')).toBe('Nora Sommer')
    expect(printedHolderName('Name: Jonas Weber')).toBe('Jonas Weber')
    expect(printedHolderName('SWICA GESUNDHEITSORGANISATION\n12.000 CHF')).toBeNull()
    expect(printedHolderName('')).toBeNull()
  })

  it('reads the people a document is about, the holder first', () => {
    const statement = [
      'Helsana Versicherungen AG',
      'Auszug fur die Steuererklarung 2025',
      'Nora Sommer, 01.02.1990, Versicherten Nr. 100 000 1',
      "01.01.2025 - 31.12.2025 Pramie Grundversicherung (KVG) 1'950.00",
      'Lio Sommer, 03.04.2019, Versicherten Nr. 100 000 2',
      "01.01.2025 - 31.12.2025 Pramie Grundversicherung (KVG) 480.00",
    ].join('\n')
    expect(printedPersonNames('chKrankenkasse', statement)).toEqual(['Nora Sommer', 'Lio Sommer'])
    expect(printedPersonNames('auto', 'Kita Sonnenschein\nJahresbescheinigung Elternbeiträge\nBetreuung für das Kind Lio Sommer\nDer Elternbeitrag')).toEqual(['Lio Sommer'])
    expect(printedPersonNames('auto', 'Kita Sonnenschein\nBetreuung Elternbeiträge')).toEqual([])
    expect(printedPersonNames('lstb', 'Lohnsteuerbescheinigung\nNora Sommer')).toEqual(['Nora Sommer'])
    expect(printedPersonNames('lstb', 'Lohnsteuerbescheinigung')).toEqual([])
  })
})

describe('whose a document is', () => {
  it('finds an adult named anywhere in the text when no printed name fits (a pension statement)', () => {
    const text = 'Pensionskasse Beispiel\nDavon Beiträge BVG\nGeburtsdatum 01.01.1988   Nora Sommer'
    expect(decideDocumentHolder({ scope: 'adults', members: [A, B], printed: [], rawText: text })).toMatchObject({ kind: 'ask', preselected: 'B', printedName: 'Nora Sommer' })
    expect(decideDocumentHolder({ scope: 'adults', members: [A, B], printed: ['Erika Fremd'], rawText: 'Elias Sommer und Nora Sommer' })).toMatchObject({ preselected: null, printedName: 'Erika Fremd', offerCreate: [] })
    expect(printedHolderName('Davon Beiträge BVG')).toBeNull()
  })

  it('the user’s choice is final', () => {
    expect(decideDocumentHolder({ scope: 'adults', chosen: 'B', members: [A, B], printed: ['Elias Sommer'] })).toEqual({ kind: 'assigned', holder: 'B' })
  })

  describe('uploaded in a person’s area (decision 1/2)', () => {
    it('belongs to that person when the document names them or nobody', () => {
      expect(decideDocumentHolder({ scope: 'adults', area: 'B', members: [A, B], printed: ['Nora Sommer'] })).toEqual({ kind: 'assigned', holder: 'B' })
      expect(decideDocumentHolder({ scope: 'adults', area: 'B', members: [A, B], printed: [] })).toEqual({ kind: 'assigned', holder: 'B' })
    })

    it('asks when the document clearly names another person of the household', () => {
      const decision = decideDocumentHolder({ scope: 'adults', area: 'B', members: [A, B], printed: ['Elias Sommer'] })
      expect(decision).toMatchObject({ kind: 'ask', reason: 'contradiction', area: 'B', preselected: 'A', printedName: 'Elias Sommer', options: ['A', 'B'], offerCreate: [] })
    })

    it('preselects the area when the named person cannot hold this document', () => {
      const decision = decideDocumentHolder({ scope: 'adults', area: 'A', members: [A, B, LIO], printed: ['Lio Sommer'] })
      expect(decision).toMatchObject({ kind: 'ask', reason: 'contradiction', preselected: 'A' })
    })

    it('asks, offering to create them, when it names someone outside the household', () => {
      const decision = decideDocumentHolder({ scope: 'adults', area: 'A', members: [A], printed: ['Jonas Weber'] })
      expect(decision).toMatchObject({ kind: 'ask', reason: 'contradiction', preselected: 'A', offerCreate: ['B'] })
    })

    it('asks A „Bist du …?“ when A has no name yet (N1)', () => {
      expect(decideDocumentHolder({ scope: 'adults', area: 'A', members: [NAMELESS_A], printed: ['Nora Sommer'] })).toMatchObject({
        kind: 'ask',
        reason: 'confirmSelf',
        preselected: 'A',
        offerCreate: ['B'],
      })
    })

    it('cannot compare with a nameless B or child: the area decides', () => {
      expect(decideDocumentHolder({ scope: 'adults', area: 'B', members: [A, { ref: 'B', firstName: null, lastName: null }], printed: ['Nora Sommer'] })).toEqual({ kind: 'assigned', holder: 'B' })
    })
  })

  describe('uploaded in the chat or the Belege tab', () => {
    it('belongs to a single person without a question', () => {
      expect(decideDocumentHolder({ scope: 'adults', members: [A], printed: ['Elias Sommer'] })).toEqual({ kind: 'assigned', holder: 'A' })
      expect(decideDocumentHolder({ scope: 'adults', members: [A], printed: [] })).toEqual({ kind: 'assigned', holder: 'A' })
      expect(decideDocumentHolder({ scope: 'children', members: [A, LIO], printed: ['Lio Sommer'] })).toEqual({ kind: 'assigned', holder: 'kind:lio' })
    })

    it('asks „Für wen?“ in a household of several, preselecting the person named', () => {
      expect(decideDocumentHolder({ scope: 'adults', members: [A, B], printed: ['Nora Sommer'] })).toMatchObject({ kind: 'ask', reason: 'which', options: ['A', 'B'], preselected: 'B', offerCreate: [] })
      expect(decideDocumentHolder({ scope: 'everyone', members: [A, B, LIO], printed: [] })).toMatchObject({ kind: 'ask', reason: 'which', options: ['A', 'B', 'kind:lio'], preselected: null })
      expect(decideDocumentHolder({ scope: 'children', members: [A, B, LIO, IDA], printed: ['Ida Sommer'] })).toMatchObject({ kind: 'ask', reason: 'which', options: ['kind:lio', 'kind:ida'], preselected: 'kind:ida' })
    })

    it('does not preselect a person who cannot hold the document', () => {
      expect(decideDocumentHolder({ scope: 'children', members: [A, B, LIO, IDA], printed: ['Nora Sommer'] })).toMatchObject({ kind: 'ask', preselected: null })
    })

    it('offers to create a child when there is none for a childcare notice', () => {
      expect(decideDocumentHolder({ scope: 'children', members: [A], printed: ['Lio Sommer'] })).toMatchObject({ kind: 'ask', reason: 'unknown', options: [], offerCreate: ['kind'] })
      expect(decideDocumentHolder({ scope: 'children', members: [A], printed: [] })).toMatchObject({ kind: 'ask', reason: 'unknown', offerCreate: ['kind'] })
    })

    it('offers to create B or a child for an unknown name, and asks the nameless A first (N1)', () => {
      expect(decideDocumentHolder({ scope: 'adults', members: [A], printed: ['Jonas Weber'] })).toMatchObject({ kind: 'ask', reason: 'unknown', options: ['A'], offerCreate: ['B'] })
      expect(decideDocumentHolder({ scope: 'everyone', members: [A, B, LIO], printed: ['Mia Weber'] })).toMatchObject({ kind: 'ask', reason: 'which', offerCreate: ['kind'] })
      expect(decideDocumentHolder({ scope: 'adults', members: [NAMELESS_A], printed: ['Nora Sommer'] })).toMatchObject({ kind: 'ask', reason: 'confirmSelf', offerCreate: ['B'] })
    })

    it('asks when the one possible holder is not the person named', () => {
      expect(decideDocumentHolder({ scope: 'children', members: [A, LIO], printed: ['Elias Sommer'] })).toMatchObject({ kind: 'ask', reason: 'unknown', options: ['kind:lio'], offerCreate: [] })
    })
  })
})

describe('a document for several people (decision 5)', () => {
  it('names the others of the household, not the holder and not those already linked', () => {
    expect(otherNamedMembers('everyone', ['Elias Sommer', 'Nora Sommer', 'Lio Sommer', 'Erika Fremd'], [A, B, LIO], 'A')).toEqual(['B', 'kind:lio'])
    expect(otherNamedMembers('everyone', ['Elias Sommer', 'Nora Sommer'], [A, B], 'A', ['B'])).toEqual([])
    expect(otherNamedMembers('adults', ['Elias Sommer', 'Nora Sommer'], [A, B], 'A')).toEqual([])
  })

  it('finds a second child in a childcare notice', () => {
    expect(otherNamedMembers('children', ['Lio Sommer'], [A, LIO, IDA], 'kind:lio', [], 'Betreuung für Lio Sommer und Ida Sommer')).toEqual(['kind:ida'])
  })

  it('takes only the lines of one child', () => {
    const text = ['Kita Sonnenschein', 'Jahresbescheinigung Elternbeiträge', 'Kind: Lio Sommer', 'Gesamt 2025: 1.200,00 EUR', 'Kind: Ida Sommer', 'Gesamt 2025: 3.000,00 EUR'].join('\n')
    expect(sectionForMember(text, IDA, [LIO, IDA])).toBe(['Kita Sonnenschein', 'Jahresbescheinigung Elternbeiträge', 'Kind: Ida Sommer', 'Gesamt 2025: 3.000,00 EUR'].join('\n'))
    expect(sectionForMember(text, LIO, [LIO, IDA])).toBe(['Kita Sonnenschein', 'Jahresbescheinigung Elternbeiträge', 'Kind: Lio Sommer', 'Gesamt 2025: 1.200,00 EUR'].join('\n'))
    expect(sectionForMember(text, { ref: 'kind:x', firstName: 'Mia', lastName: null }, [LIO])).toBe(text)
  })
})

describe('creating the holder from a document (decision 3)', () => {
  it('takes names, birth date and Steuer-ID as printed', () => {
    const lstb = 'Lohnsteuerbescheinigung 2025\nIdentifikationsnummer: 31 000 007 919\nNora Sommer\nGeburtsdatum 30.11.1989'
    expect(printedPersonDetails('lstb', lstb, 'Nora Sommer')).toEqual({ firstName: 'Nora', lastName: 'Sommer', birthDate: '1989-11-30', taxId: '31000007919' })
  })

  it('reads a Swiss certificate’s last name first and a date on the name line', () => {
    expect(printedPersonDetails('chLohnausweis', 'H\nSommer Nora 30.11.1989', 'Sommer Nora')).toEqual({ firstName: 'Nora', lastName: 'Sommer', birthDate: '1989-11-30', taxId: null })
    expect(printedPersonDetails('chLohnausweis', 'H', 'Sommer')).toEqual({ firstName: null, lastName: null, birthDate: null, taxId: null })
  })

  it('leaves out what is not printed', () => {
    expect(printedPersonDetails('auto', 'Kind: Lio', 'Lio')).toEqual({ firstName: 'Lio', lastName: null, birthDate: null, taxId: null })
    expect(printedPersonDetails('auto', '', null)).toEqual({ firstName: null, lastName: null, birthDate: null, taxId: null })
    expect(printedPersonDetails('lstb', 'Max Mia Muster', 'Max Mia Muster')).toMatchObject({ firstName: 'Max Mia', lastName: 'Muster' })
  })
})

describe('adding up or replacing (decision 6, N2)', () => {
  it('asks when another source already holds a different amount', () => {
    expect(amountCombination('2100', '2100', 'other')).toBe('write')
    expect(amountCombination('2100', '1950', 'other')).toBe('ask')
    expect(amountCombination('36000', '21000', 'other')).toBe('ask')
  })

  it('writes into an empty field, over zero, over this document’s own value, and anything that is no amount', () => {
    expect(amountCombination(null, '2100', 'other')).toBe('write')
    expect(amountCombination('0', '2100', 'other')).toBe('write')
    expect(amountCombination('2100', '1950', 'thisDocument')).toBe('write')
    expect(amountCombination('2100', '1950', 'none')).toBe('write')
    expect(amountCombination('01.01.2025', '01.03.2025', 'other')).toBe('write')
    expect(amountCombination('2100', 'Ja', 'other')).toBe('write')
  })

  it('adds whole and cent amounts', () => {
    expect(addAmounts('2100', '1950')).toBe('4050')
    expect(addAmounts('10.5', '0.25')).toBe('10.75')
  })
})

describe('work-expense receipts (ADR-0092 §2)', () => {
  it('belong to an adult, and joint receipts stay out', () => {
    expect(looksLikeWorkExpenseReceipt('Media Markt\nRechnung\nMonitor 27 Zoll 349,00 EUR')).toBe(true)
    expect(looksLikeWorkExpenseReceipt('Gewerkschaft ver.di\nMitgliedsbeitrag 2025: 240,00 EUR')).toBe(true)
    expect(looksLikeWorkExpenseReceipt('Spedition Muster\nUmzug am 01.03.2025')).toBe(true)
    expect(looksLikeWorkExpenseReceipt('Bestätigung über Geldzuwendungen im Sinne des § 10b EStG\nSeminarhaus e.V.\nBetrag der Zuwendung: 50,00 EUR')).toBe(false)
    expect(looksLikeWorkExpenseReceipt('Lebensmittel 12,00 EUR')).toBe(false)
    expect(holderScopeOf('auto', 'Media Markt\nMonitor 349,00 EUR')).toBe('adults')
  })

  it('looks for the household’s names in the text, never at the shop’s name', () => {
    const text = 'Media Markt Lörrach\nRechnung an Nora Sommer\nMonitor 349,00 EUR'
    expect(printedPersonNames('auto', text)).toEqual([])
    expect(decideDocumentHolder({ scope: 'adults', members: [A, B], printed: [], rawText: text })).toMatchObject({ kind: 'ask', reason: 'which', preselected: 'B', offerCreate: [] })
    expect(decideDocumentHolder({ scope: 'adults', members: [A, LIO], printed: [], rawText: text })).toEqual({ kind: 'assigned', holder: 'A' })
  })

  it('ignores the mask of someone who cannot hold the document', () => {
    expect(decideDocumentHolder({ scope: 'adults', area: 'kind:lio', members: [A, B, LIO], printed: ['Nora Sommer'] })).toMatchObject({ kind: 'ask', reason: 'which', area: 'kind:lio' })
  })
})

describe('sum fields (ADR-0092 §6)', () => {
  it('adds another receipt without asking, asks for the same one again', () => {
    expect(sumFieldCombination('300', '50', 'other', false)).toBe('add')
    expect(sumFieldCombination('300', '300', 'other', false)).toBe('add')
    expect(sumFieldCombination('300', '300', 'other', true)).toBe('ask')
    expect(sumFieldCombination(null, '50', 'other', false)).toBe('write')
    expect(sumFieldCombination('0', '50', 'other', true)).toBe('write')
    expect(sumFieldCombination('300', '50', 'thisDocument', true)).toBe('write')
    expect(sumFieldCombination('300', 'Ja', 'other', true)).toBe('write')
  })

  it('knows a receipt by issuer, amount and date', () => {
    expect(receiptIssuer('\nRechnung Nr. 4\nZahnarztpraxis Dr. Beispiel\n1.700,00 EUR')).toBe('zahnarztpraxis dr beispiel')
    expect(receiptIssuer('12.05.2025\n')).toBe('')
    const mark = { issuer: 'kinderhilfe', amount: '300', date: '2025-12-01' }
    expect(sameReceiptAgain(mark, [{ ...mark }])).toBe(true)
    expect(sameReceiptAgain(mark, [{ ...mark, date: null }])).toBe(true)
    expect(sameReceiptAgain(mark, [{ ...mark, date: '2025-06-01' }])).toBe(false)
    expect(sameReceiptAgain(mark, [{ ...mark, amount: '50' }])).toBe(false)
    expect(sameReceiptAgain(mark, [{ ...mark, issuer: 'drk' }])).toBe(false)
    expect(sameReceiptAgain({ ...mark, issuer: '' }, [{ ...mark, issuer: '' }])).toBe(false)
  })
})
