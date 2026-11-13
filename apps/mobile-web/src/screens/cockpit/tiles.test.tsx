import { describe, expect, it } from 'vitest'
import { AMOUNT_LATER, type Conflict, type Notice } from '@steuereule/core'
import type {
  ChSalaryCertificateResponseDto,
  ChildrenResponseDto,
  CommuteResponseDto,
  KapitalResponseDto,
  LstbResponseDto,
  PensionResponseDto,
  RentalResponseDto,
} from '@steuereule/api-client'
import {
  FINDING_TILE,
  TILES,
  hasAnswersForEntry,
  nextStep,
  nextStepTile,
  partitionTiles,
  tileById,
  tileHintSeverity,
  tilesForFinding,
  visibleTiles,
  type TileFacts,
  type TileId,
} from './tiles'

function emptyLstb(): LstbResponseDto {
  return {
    bruttoarbeitslohn: { kind: 'offen' },
    lohnsteuer: { kind: 'offen' },
    sozialversicherung: { kind: 'offen' },
    state: { kind: 'unvollstaendig', open: ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung'], unclear: [] },
  }
}

function completeLstb(): LstbResponseDto {
  return {
    bruttoarbeitslohn: { kind: 'erfasst', value: 50000 },
    lohnsteuer: { kind: 'erfasst', value: 8000 },
    sozialversicherung: { kind: 'erfasst', value: 10000 },
    state: { kind: 'vollstaendig', bruttoarbeitslohn: 50000, lohnsteuer: 8000, sozialversicherung: 10000 },
  }
}

function emptyCh(): ChSalaryCertificateResponseDto {
  return {
    fields: [],
    bemerkungen: null,
    exchangeRate: null,
    status: 'echter-grenzgaenger',
    items: [],
    foldStatus: { kind: 'bestimmt', einnahmen: 50000, vorsorgeaufwand: 5000, anrechnung: 2000 },
    nGre: {
      arbeitgeberName: null,
      arbeitgeberStrasse: null,
      arbeitgeberPlzOrt: null,
      familienzulagenChf: null,
      krankentaggeldChf: null,
      pkArbeitnehmerChf: null,
      pkArbeitgeberChf: null,
      pkArbeitgeberGesamtChf: null,
      steuerfreiesKrankentaggeldChf: null,
      krankentaggeldArbeitgeberProzent: null,
      krankentaggeldArbeitgeberChf: null,
      nbuvArbeitgeberProzent: null,
      nbuvArbeitgeberChf: null,
      specialCases: null,
    },
  }
}

function baseFacts(overrides: Partial<TileFacts> = {}): TileFacts {
  return {
    path: 'angestellte',
    answers: { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' },
    ...overrides,
  }
}

const DONE_LEBENSLAGEN = { dhf: 'Nein', umzug: 'Nein', abfindung: 'Nein', lohnersatz: 'Nein', nebenjob: 'Nein' }
const DONE_EINKUENFTE = { einkuenfte: 'Nein' }
const DONE_SONDERAUSGABEN = { spenden: 'Nein', 'kv-pv': 'Nein', riester: 'Nein' }

function completeCommute(): CommuteResponseDto {
  return {
    inputs: {
      workdays: [1, 2, 3, 4, 5],
      vacationDays: 30,
      sickDays: 0,
      homeOfficeDays: 0,
      oneWayKm: 10,
      transport: 'oepnv',
      workplace: 'Berlin',
      publicHolidays: 9,
      publicHolidayRegion: 'BE',
    },
    workdays: { weekdays: 252, workdays: 222, commuteDays: 222 },
    commuterAllowance: 666,
  }
}

describe('cockpit tiles (§ 2.2–2.4 & Slice 5 § 5.2)', () => {
  it('defines all 14 tiles with unique IDs, title keys, and persona rules', () => {
    const ids = TILES.map((t) => t.id)
    expect(ids).toEqual([
      'lstb',
      'ch',
      'rente',
      'lebenslagen',
      'einkuenfte',
      'sonderausgaben',
      'arbeitsweg',
      'kapital',
      'vermietung',
      'kinder',
      'alleinerziehend',
      'haushalt',
      'gesundheit',
      'vorauszahlungen',
    ])
    for (const tile of TILES) {
      expect(tile.titleKey).toBe(`cockpit.kachel.${tile.id}.titel`)
      expect(tile.personas === 'all' || Array.isArray(tile.personas)).toBe(true)
    }
  })

  describe('persona visibility & Weitere Themen partitioning (§ 5.2 & § 5.7)', () => {
    it('places angestellt tiles in main and all remaining non-flagged tiles in more (booster flag false)', () => {
      const part = partitionTiles(baseFacts({ boosterEnabled: false }))
      expect(part.main.map((t) => t.id)).toEqual(['lstb', 'lebenslagen', 'einkuenfte', 'sonderausgaben', 'arbeitsweg'])
      expect(part.more.map((t) => t.id)).toEqual(['ch', 'rente', 'kapital', 'vermietung', 'kinder', 'alleinerziehend', 'vorauszahlungen'])
      expect(visibleTiles(baseFacts({ boosterEnabled: false })).map((t) => t.id)).toEqual(part.main.map((t) => t.id))
    })

    it('exposes haushalt in main and gesundheit in more/main when boosterEnabled is true', () => {
      const emp = partitionTiles(baseFacts({ boosterEnabled: true }))
      expect(emp.main.map((t) => t.id)).toEqual([
        'lstb',
        'lebenslagen',
        'einkuenfte',
        'sonderausgaben',
        'arbeitsweg',
        'haushalt',
      ])
      expect(emp.more.map((t) => t.id)).toContain('gesundheit')

      const retiree = partitionTiles(
        baseFacts({ path: 'rente', answers: { job: 'Rente', ausland: 'Nein', kinder: 'Nein' }, boosterEnabled: true }),
      )
      expect(retiree.main.map((t) => t.id)).toEqual(['rente', 'einkuenfte', 'sonderausgaben', 'kapital', 'haushalt', 'gesundheit'])
    })

    it('shows ch, lebenslagen, einkuenfte, sonderausgaben, arbeitsweg in main for grenzgaenger', () => {
      const part = partitionTiles(
        baseFacts({ path: 'ch', answers: { job: 'Angestellt', ausland: 'Ja, in die Schweiz', kinder: 'Nein' }, boosterEnabled: false }),
      )
      expect(part.main.map((t) => t.id)).toEqual(['ch', 'lebenslagen', 'einkuenfte', 'sonderausgaben', 'arbeitsweg', 'vorauszahlungen'])
      expect(part.more.map((t) => t.id)).toContain('lstb')
    })

    it('shows rente and kapital in main and arbeitsweg in more for rentner', () => {
      const part = partitionTiles(
        baseFacts({ path: 'rente', answers: { job: 'Rente', ausland: 'Nein', kinder: 'Nein' }, boosterEnabled: false }),
      )
      expect(part.main.map((t) => t.id)).toEqual(['rente', 'einkuenfte', 'sonderausgaben', 'kapital'])
      expect(part.more.map((t) => t.id)).toContain('arbeitsweg')
    })

    it('adds vermietung to main for vermieter', () => {
      const part = partitionTiles(
        baseFacts({ answers: { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', einkuenfte: 'Vermietung' }, boosterEnabled: false }),
      )
      expect(part.main.map((t) => t.id)).toContain('vermietung')
    })

    it('adds kinder (and not alleinerziehend) to main when married with child, and both when single parent', () => {
      const marriedParent = partitionTiles(
        baseFacts({ answers: { job: 'Angestellt', ausland: 'Nein', kinder: '1 Kind', familienstand: 'Verheiratet' }, boosterEnabled: false }),
      )
      expect(marriedParent.main.map((t) => t.id)).toContain('kinder')
      expect(marriedParent.main.map((t) => t.id)).not.toContain('alleinerziehend')
      expect(marriedParent.more.map((t) => t.id)).toContain('alleinerziehend')

      const singleParent = partitionTiles(
        baseFacts({
          answers: { job: 'Angestellt', ausland: 'Nein', kinder: '1 Kind', familienstand: 'Geschieden oder getrennt' },
          boosterEnabled: true,
        }),
      )
      expect(singleParent.main.map((t) => t.id)).toContain('kinder')
      expect(singleParent.main.map((t) => t.id)).toContain('alleinerziehend')
      expect(singleParent.main.map((t) => t.id)).toContain('gesundheit')
    })
  })

  describe('tile status logic', () => {
    it('evaluates lstb status via core wageTaxCertificateStatus', () => {
      const tile = tileById('lstb')
      expect(tile.status(baseFacts({ lstb: null }))).toBe('offen')
      expect(tile.status(baseFacts({ lstb: emptyLstb() }))).toBe('offen')
      expect(tile.status(baseFacts({ lstb: completeLstb() }))).toBe('erledigt')

      const conflictLstb: LstbResponseDto = {
        bruttoarbeitslohn: { kind: 'erfasst', value: 1000 },
        lohnsteuer: { kind: 'erfasst', value: 2000 },
        sozialversicherung: { kind: 'erfasst', value: 100 },
        state: { kind: 'widerspruch', conflicts: [] },
      }
      expect(tile.status(baseFacts({ lstb: conflictLstb }))).toBe('offen')
    })

    it('evaluates ch status using foldStatus === bestimmt and exchangeRate !== null', () => {
      const tile = tileById('ch')
      const baseCh = emptyCh()
      expect(tile.status(baseFacts({ ch: null }))).toBe('offen')
      expect(tile.status(baseFacts({ ch: baseCh }))).toBe('offen')
      expect(
        tile.status(baseFacts({ ch: { ...baseCh, exchangeRate: { month: '2025-12', rate: 1.07, mode: 'amtlich' }, foldStatus: null } })),
      ).toBe('offen')
      expect(
        tile.status(baseFacts({ ch: { ...baseCh, exchangeRate: { month: '2025-12', rate: 1.07, mode: 'amtlich' } } })),
      ).toBe('erledigt')
    })

    it('evaluates rente status using status.kind === bestimmt', () => {
      const tile = tileById('rente')
      const openPension: PensionResponseDto = {
        kind: null,
        jahresbetrag: { kind: 'offen' },
        rentenbeginnJahr: { kind: 'offen' },
        alterBeiRentenbeginn: { kind: 'offen' },
        items: [],
        status: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, openItems: 1, conflicts: 0, gated: [] },
      }
      const donePension: PensionResponseDto = {
        ...openPension,
        kind: 'GesetzlicheRente',
        status: { kind: 'bestimmt', einnahmen: 12000, vorsorgeaufwand: 0, anrechnung: 0 },
      }
      expect(tile.status(baseFacts({ pension: openPension }))).toBe('offen')
      expect(tile.status(baseFacts({ pension: donePension }))).toBe('erledigt')
    })

    it('evaluates catalog tiles as erledigt when done, and prioritizes betrag-offen over erledigt', () => {
      const life = tileById('lebenslagen')
      expect(life.status(baseFacts({ answers: {} }))).toBe('offen')
      expect(life.status(baseFacts({ answers: DONE_LEBENSLAGEN }))).toBe('erledigt')
      expect(
        life.status(baseFacts({ answers: { ...DONE_LEBENSLAGEN, dhf: 'Ja', 'dhf-miete': AMOUNT_LATER } })),
      ).toBe('betrag-offen')
      expect(
        life.status(baseFacts({ answers: { dhf: 'Ja', 'dhf-miete': AMOUNT_LATER } })),
      ).toBe('betrag-offen')

      const special = tileById('sonderausgaben')
      expect(special.status(baseFacts({ answers: DONE_SONDERAUSGABEN }))).toBe('erledigt')
      expect(
        special.status(baseFacts({ answers: { ...DONE_SONDERAUSGABEN, spenden: 'Ja', 'spenden-betrag': AMOUNT_LATER } })),
      ).toBe('betrag-offen')
    })

    it('evaluates arbeitsweg, kapital, vermietung, and kinder statuses', () => {
      expect(tileById('arbeitsweg').status(baseFacts({ commute: { inputs: null, workdays: null, commuterAllowance: null } }))).toBe('offen')
      expect(tileById('arbeitsweg').status(baseFacts({ commute: completeCommute() }))).toBe('erledigt')

      const openCap: KapitalResponseDto = {
        kapitalertraege: { kind: 'offen' },
        sparerPauschbetrag: { kind: 'offen' },
        kapitalertragsteuer: { kind: 'offen' },
        solidaritaetszuschlag: { kind: 'offen' },
        kirchensteuer: { kind: 'offen' },
        requiredFields: ['kapitalertraege'],
        depot: { kind: 'unbekannt' },
        items: [],
        status: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, openItems: 1, conflicts: 0, gated: [] },
        inhaber: null,
      }
      const doneCap: KapitalResponseDto = {
        ...openCap,
        status: { kind: 'bestimmt', einnahmen: 2000, vorsorgeaufwand: 0, anrechnung: 0 },
      }
      expect(tileById('kapital').status(baseFacts({ capital: openCap }))).toBe('offen')
      expect(tileById('kapital').status(baseFacts({ capital: doneCap }))).toBe('erledigt')

      const openRental: RentalResponseDto = {
        classification: { kind: 'einfach' },
        properties: [],
        status: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, werbungskosten: 0, depreciation: 0, openItems: 3, conflicts: 0 },
      }
      const doneRental: RentalResponseDto = {
        classification: { kind: 'einfach' },
        properties: [],
        status: { kind: 'bestimmt', einnahmen: 12000, vorsorgeaufwand: 0, anrechnung: 0, werbungskosten: 2000, depreciation: 1000, openItems: 0, conflicts: 0 },
      }
      expect(tileById('vermietung').status(baseFacts({ rental: openRental }))).toBe('offen')
      expect(tileById('vermietung').status(baseFacts({ rental: doneRental }))).toBe('erledigt')

      const emptyChildren: ChildrenResponseDto = {
        kinder: [],
        count: 0,
        childBenefitSum: 0,
        totalAllowance: 0,
        swissFamilyAllowanceSum: 0,
        differentialChildBenefitSum: 0,
      }
      const oneChild: ChildrenResponseDto = {
        ...emptyChildren,
        kinder: [
          {
            id: 'c1',
            sequenceNumber: 1,
            firstName: 'Max',
            lastName: 'M',
            geburtsdatum: '2020-01-01',
            kinship: '1',
            kinshipB: null,
            familyBenefitsOffice: 'Berlin',
            domesticResidenceAllYear: true,
            otherParent: null,
            otherParentName: null,
            otherParentBirthDate: null,
            otherParentAddress: null,
            otherParentKind: null,
            otherParentDiedOn: null,
            registeredWithMeAllYear: true,
            childBenefitToMeAllYear: true,
            healthBasicEur: null,
            careEur: null,
          },
        ],
        count: 1,
      }
      expect(tileById('kinder').status(baseFacts({ children: emptyChildren }))).toBe('offen')
      expect(tileById('kinder').status(baseFacts({ children: oneChild }))).toBe('erledigt')

      expect(tileById('alleinerziehend').status(baseFacts({ answers: {} }))).toBe('offen')
      expect(
        tileById('alleinerziehend').status(baseFacts({ answers: { 'ae-weitere-person': 'Nein', 'ae-haushaltsgemeinschaft': 'Nein' } })),
      ).toBe('erledigt')

      expect(tileById('haushalt').status(baseFacts({ answers: {} }))).toBe('offen')
      expect(tileById('haushalt').status(baseFacts({ answers: { 'haushalt-gate': 'Nein' } }))).toBe('erledigt')
      expect(
        tileById('haushalt').status(
          baseFacts({
            answers: {
              'haushalt-gate': 'Ja',
              'haushalt-dienstleistung-betrag': '100',
              'haushalt-handwerker-betrag': AMOUNT_LATER,
              'haushalt-minijob-betrag': '0',
            },
          }),
        ),
      ).toBe('betrag-offen')

      expect(tileById('gesundheit').status(baseFacts({ answers: {} }))).toBe('offen')
      expect(tileById('gesundheit').status(baseFacts({ answers: { 'gesundheit-gate': 'Nein' } }))).toBe('erledigt')
    })
  })

  describe('nextStep while a tile is still loading or failed', () => {
    it('suggests no step when an earlier tile in the order has an unknown status', () => {
      expect(nextStep(baseFacts({ pendingTiles: new Set(['lstb']) }))).toEqual({ kind: 'unknown' })
    })

    it('still suggests the first open tile when only a later tile is unknown', () => {
      const step = nextStep(baseFacts({ pendingTiles: new Set(['arbeitsweg']) }))
      expect(step.kind === 'tile' ? step.tile.id : step.kind).toBe('lstb')
    })
  })

  describe('nextStepTile sequence (§ 2.3)', () => {
    it('walks angestellte tiles in order: lstb -> lebenslagen -> einkuenfte -> sonderausgaben -> arbeitsweg -> null', () => {
      const pick = (overrides: Partial<TileFacts> = {}): TileId | null => nextStepTile(baseFacts(overrides))?.id ?? null

      expect(pick()).toBe('lstb')
      expect(pick({ lstb: completeLstb() })).toBe('lebenslagen')
      expect(pick({ lstb: completeLstb(), answers: DONE_LEBENSLAGEN })).toBe('einkuenfte')
      expect(
        pick({ lstb: completeLstb(), answers: { ...DONE_LEBENSLAGEN, dhf: 'Ja', 'dhf-miete': AMOUNT_LATER } }),
      ).toBe('einkuenfte')
      expect(
        pick({ lstb: completeLstb(), answers: { dhf: 'Ja', 'dhf-miete': AMOUNT_LATER } }),
      ).toBe('lebenslagen')
      expect(pick({ lstb: completeLstb(), answers: { ...DONE_LEBENSLAGEN, ...DONE_EINKUENFTE } })).toBe('sonderausgaben')
      expect(
        pick({ lstb: completeLstb(), answers: { ...DONE_LEBENSLAGEN, ...DONE_EINKUENFTE, ...DONE_SONDERAUSGABEN } }),
      ).toBe('arbeitsweg')
      expect(
        pick({
          lstb: completeLstb(),
          answers: { ...DONE_LEBENSLAGEN, ...DONE_EINKUENFTE, ...DONE_SONDERAUSGABEN },
          commute: completeCommute(),
        }),
      ).toBeNull()
    })

    it('walks ch tiles in order: ch -> einkuenfte -> sonderausgaben -> arbeitsweg -> null', () => {
      const doneCh: ChSalaryCertificateResponseDto = {
        ...emptyCh(),
        exchangeRate: { month: '2025-12', rate: 1.07, mode: 'amtlich' },
      }
      const pick = (overrides: Partial<TileFacts> = {}): TileId | null =>
        nextStepTile(baseFacts({ path: 'ch', ...overrides }))?.id ?? null

      expect(pick()).toBe('ch')
      expect(pick({ ch: doneCh })).toBe('einkuenfte')
      expect(pick({ ch: doneCh, answers: DONE_EINKUENFTE })).toBe('sonderausgaben')
      expect(pick({ ch: doneCh, answers: { ...DONE_EINKUENFTE, ...DONE_SONDERAUSGABEN } })).toBe('arbeitsweg')
      expect(
        pick({ ch: doneCh, answers: { ...DONE_EINKUENFTE, ...DONE_SONDERAUSGABEN }, commute: completeCommute() }),
      ).toBeNull()
    })

    it('walks rente tiles in order: rente -> einkuenfte -> sonderausgaben -> null', () => {
      const donePension: PensionResponseDto = {
        kind: 'GesetzlicheRente',
        jahresbetrag: { kind: 'erfasst', value: 18000 },
        rentenbeginnJahr: { kind: 'erfasst', value: 2020 },
        alterBeiRentenbeginn: { kind: 'offen' },
        items: [],
        status: { kind: 'bestimmt', einnahmen: 14400, vorsorgeaufwand: 0, anrechnung: 0 },
      }
      const pick = (overrides: Partial<TileFacts> = {}): TileId | null =>
        nextStepTile(baseFacts({ path: 'rente', ...overrides }))?.id ?? null

      expect(pick()).toBe('rente')
      expect(pick({ pension: donePension })).toBe('einkuenfte')
      expect(pick({ pension: donePension, answers: DONE_EINKUENFTE })).toBe('sonderausgaben')
      expect(pick({ pension: donePension, answers: { ...DONE_EINKUENFTE, ...DONE_SONDERAUSGABEN } })).toBeNull()
    })
  })

  describe('hasAnswersForEntry (§ 2.1)', () => {
    it('returns true only when answers contain at least one question belonging to the given catalog entry', () => {
      expect(hasAnswersForEntry('lebenslagen', { job: 'Angestellt' })).toBe(false)
      expect(hasAnswersForEntry('lebenslagen', { dhf: 'Nein' })).toBe(true)
      expect(hasAnswersForEntry('einkuenfte', { einkuenfte: 'Kapitalerträge' })).toBe(true)
      expect(hasAnswersForEntry('sonderausgaben', { spenden: 'Ja', 'spenden-betrag': AMOUNT_LATER })).toBe(true)
    })
  })

  describe('FINDING_TILE & tile hints (§ 3.2)', () => {
    it('maps every conflict and notice kind to its fixing tile or abgabe', () => {
      expect(FINDING_TILE['lstb-offen']).toBe('lstb')
      expect(FINDING_TILE['lstb-unklar']).toBe('lstb')
      expect(FINDING_TILE['lstb-widerspruch']).toBe('lstb')
      expect(FINDING_TILE['werktage-widerspruch']).toBe('arbeitsweg')
      expect(FINDING_TILE['gated-einkunftsart']).toBe('einkuenfte')
      expect(FINDING_TILE['erfasst-nicht-gerechnet']).toBe('lebenslagen')
      expect(FINDING_TILE['werbungskosten-uebersteigt-einnahmen']).toBe('abgabe')
      expect(FINDING_TILE['betrag-spaeter']).toBe('abgabe')
    })

    it('resolves betrag-spaeter to the catalog tiles owning its steps and Gewerbe gate to abgabe', () => {
      expect(tilesForFinding({ kind: 'betrag-spaeter', steps: ['dhf-miete'] })).toEqual(['lebenslagen'])
      expect(
        tilesForFinding({ kind: 'betrag-spaeter', steps: ['dhf-miete', 'umzug-kosten', 'spenden-betrag'] }),
      ).toEqual(['lebenslagen', 'sonderausgaben'])
      expect(tilesForFinding({ kind: 'betrag-spaeter', steps: ['haushalt-handwerker-betrag'] })).toEqual(['haushalt'])
      expect(tilesForFinding({ kind: 'betrag-spaeter', steps: [] })).toEqual(['abgabe'])
      expect(tilesForFinding({ kind: 'gated-einkunftsart', incomeType: 'Kapital' })).toEqual(['einkuenfte'])
      expect(tilesForFinding({ kind: 'gated-einkunftsart', incomeType: 'Vermietung' })).toEqual(['einkuenfte'])
      expect(tilesForFinding({ kind: 'gated-einkunftsart', incomeType: 'Gewerbe' })).toEqual(['abgabe'])
      expect(tilesForFinding({ kind: 'lstb-offen', fields: ['bruttoarbeitslohn'] })).toEqual(['lstb'])
      expect(tilesForFinding({ kind: 'erfasst-nicht-gerechnet', amount: 1200 })).toEqual(['lebenslagen'])
      expect(
        tilesForFinding({ kind: 'werbungskosten-uebersteigt-einnahmen', werbungskosten: 5000, einnahmen: 1000 }),
      ).toEqual(['abgabe'])
    })

    it('computes tileHintSeverity with blocker precedence over warnung', () => {
      const conflicts: readonly Conflict[] = [{ kind: 'lstb-offen', fields: ['bruttoarbeitslohn'] }]
      const notices: readonly Notice[] = [
        { kind: 'betrag-spaeter', steps: ['spenden-betrag'] },
        { kind: 'erfasst-nicht-gerechnet', amount: 500 },
      ]

      expect(tileHintSeverity('lstb', conflicts, notices)).toBe('blocker')
      expect(tileHintSeverity('sonderausgaben', conflicts, notices)).toBe('warnung')
      expect(tileHintSeverity('lebenslagen', conflicts, notices)).toBe('warnung')
      expect(tileHintSeverity('einkuenfte', conflicts, notices)).toBeNull()

      const gatedConflicts: readonly Conflict[] = [{ kind: 'gated-einkunftsart', incomeType: 'Kapital' }]
      const sameTileNotices: readonly Notice[] = [{ kind: 'erfasst-nicht-gerechnet', amount: 500 }]
      expect(tileHintSeverity('einkuenfte', gatedConflicts, sameTileNotices)).toBe('blocker')
    })
  })
})
