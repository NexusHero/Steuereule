// Representative PrintoutFacts for the golden test of `printoutValues` and the unit tests of its
// section builders: a single filer, a married couple, children, cross-border commuters, and gaps.
import type {
  ChSalaryCertificateFacts,
  ChildFacts,
  CommuteFacts,
  LifeSituationFacts,
  PersonBFacts,
  PrintoutFacts,
} from '../../src/printout/printout-values.js'

export const PROFILE: PrintoutFacts['profile'] = { firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358', steuernummer: '2010304050' }

export const MASTER_DATA: NonNullable<PrintoutFacts['masterData']> = {
  geburtsdatum: '1990-04-12',
  strasse: 'Musterstraße',
  hausnummer: '12',
  hausnummerZusatz: 'a',
  plz: '79539',
  wohnort: 'Lörrach',
  beruf: 'Ingenieurin',
  religion: 'VD',
  familienstand: 'geschieden',
  familienstandSeit: '2018-06-01',
  iban: 'DE89370400440532013000',
  kontoinhaber: null,
  finanzamt: 'Finanzamt Lörrach',
  telefon: '07621 12345',
}

export const NO_LIFE_SITUATIONS: LifeSituationFacts = { trainingEur: null, relocationEur: null, wageReplacementEur: null, severance: false, secondHousehold: false }

export const COMMUTE: CommuteFacts = {
  workdaysPerWeek: 5,
  daysOff: 30,
  commuteDays: 140,
  oneWayKm: 18,
  withCar: true,
  workplace: 'Freiburg',
  from: '01.01.2025',
  to: '30.06.2025',
  second: { commuteDays: 90, oneWayKm: 9, withCar: false, workplace: 'Basel', from: '01.07.2025', to: '31.12.2025' },
  workExpenses: {
    professionalBodiesEur: 120,
    professionalBodiesNote: null,
    workEquipmentEur: 450,
    workEquipmentNote: 'Laptop',
    accountFeesEur: 16,
    otherWorkExpensesEur: 60,
    otherWorkExpensesNote: 'Fachliteratur',
  },
}

export const CH_SALARY: ChSalaryCertificateFacts = {
  status: 'echter-grenzgaenger',
  rate: 1.065,
  grossWageChf: '100000',
  ahvContributionsChf: '6600',
  withholdingTaxChf: '4500',
  arbeitgeberName: 'Muster AG',
  arbeitgeberStrasse: 'Bahnhofstrasse 1',
  arbeitgeberPlzOrt: '4051 Basel',
  familienzulagenChf: '2400',
  krankentaggeldChf: '300',
  pkArbeitnehmerChf: '5000',
  pkArbeitgeberChf: '6000',
  pkArbeitnehmerGesamtChf: '5600',
  pkArbeitgeberGesamtChf: '7000',
  steuerfreiesKrankentaggeldChf: '800',
  steuerfreiesUnfalltaggeldChf: '1200',
  krankentaggeldArbeitgeberProzent: '50',
  krankentaggeldArbeitgeberChf: null,
  nbuvArbeitgeberProzent: '0',
  nbuvArbeitgeberChf: null,
  specialCases: false,
}

export const CHILD: ChildFacts = {
  firstName: 'Lena',
  lastName: 'Beispiel',
  geburtsdatum: '2016-03-05',
  taxId: '12345678901',
  childBenefitClaimEur: '3060',
  kinship: '1',
  familyBenefitsOffice: 'Familienkasse Baden-Württemberg West',
  domesticResidenceAllYear: true,
  otherParent: 'Inland',
  otherParentName: 'Max Muster',
  otherParentBirthDate: '1988-01-20',
  otherParentAddress: 'Hauptstraße 3, 79539 Lörrach',
  otherParentKind: '1',
  registeredWithMeAllYear: true,
  childBenefitToMeAllYear: true,
  healthBasicEur: '400',
  careEur: '80',
  childcareEur: '1800',
  childcareProvider: 'Kita Sonnenschein',
  childcareFrom: '01.01.',
  childcareTo: '31.12.',
}

export const PERSON_B: PersonBFacts = {
  firstName: 'Ben',
  lastName: 'Beispiel',
  steuerId: '86095742719',
  geburtsdatum: '1989-11-02',
  religion: 'RK',
  beruf: 'Lehrer',
  bruttoarbeitslohn: '38000',
  pension: { rentenart: 'PrivateRentenversicherung', jahresbetrag: '1200' },
  commute: { ...COMMUTE, second: null, workExpenses: null, workplace: 'Lörrach', oneWayKm: 4, withCar: false, from: null, to: null },
  healthInsurance: [{ kind: 'privat', basicHealthAmount: 2400, withSickPay: false, careInsuranceAmount: 300, optionalExtrasAmount: 150 }],
  lifeSituations: { ...NO_LIFE_SITUATIONS, wageReplacementEur: 1500, trainingEur: 250 },
}

/** A single filer with income from employment, a pension, capital, two rentals and most Anlagen. */
export const SINGLE: PrintoutFacts = {
  taxYear: 2025,
  profile: PROFILE,
  masterData: MASTER_DATA,
  bruttoarbeitslohn: '42000',
  pension: { rentenart: 'GesetzlicheRente', jahresbetrag: '3600' },
  commute: { ...COMMUTE, second: null },
  lifeSituations: { trainingEur: 900, relocationEur: 1400, wageReplacementEur: 2000, severance: false, secondHousehold: false },
  capital: { depot: 'deutscher-broker', kapitalertraege: '1500', sparerPauschbetrag: '1000', kapitalertragsteuer: '125', solidaritaetszuschlag: '6', kirchensteuer: '9' },
  rental: [
    {
      strasse: 'Gartenweg 4',
      plz: '79540',
      city: 'Lörrach',
      livingArea: '72',
      mieteinnahmen: '9600',
      anschaffungskosten: '250000',
      baujahr: '1995',
      werbungskosten: '1800',
      depreciationAsLastYear: true,
      umlagen: '1200',
      schuldzinsen: '2100',
      einheiten: '2',
    },
    {
      sequenceNumber: '7',
      strasse: 'Bergstraße 1',
      plz: '79541',
      city: 'Lörrach',
      livingArea: null,
      mieteinnahmen: '6000',
      anschaffungskosten: '180000',
      baujahr: '2010',
      werbungskosten: '900',
      depreciationAsLastYear: false,
    },
  ],
  kinder: [CHILD],
  singleParent: { otherPerson: 'Nein', householdCommunity: 'Nein' },
  specialExpenses: { donations: '250' },
  riester: { kind: 'Unmittelbar', incomeLastYear: '41000' },
  householdAndHealth: { healthCostsEur: 1800, healthReimbursedEur: 300, minijobEur: 1200, servicesEur: 600, craftsmenLabourEur: 800, craftsmenInvoicesEur: 2000 },
  healthInsurance: [
    { kind: 'gesetzlich', basicHealthAmount: 3000, withSickPay: true, careInsuranceAmount: 600, optionalExtrasAmount: 120 },
    { kind: 'ausland', basicHealthAmount: 1000, withSickPay: false, careInsuranceAmount: 0, optionalExtrasAmount: 50 },
  ],
}

/** A married couple filing jointly, both employed, with joint capital, a shared rental and two children. */
export const MARRIED: PrintoutFacts = {
  taxYear: 2025,
  profile: PROFILE,
  masterData: { ...MASTER_DATA, familienstand: 'verheiratet', familienstandSeit: '2015-08-15', kontoinhaber: 'Anna und Ben Beispiel', iban: 'CH9300762011623852957' },
  bruttoarbeitslohn: '52000',
  pension: { rentenart: 'WitwenWaisenrente', jahresbetrag: '2400' },
  commute: COMMUTE,
  lifeSituations: { ...NO_LIFE_SITUATIONS, severance: true },
  link: { filingType: 'zusammen', personB: PERSON_B },
  capital: { depot: 'auslaendischer-broker', inhaber: 'gemeinsam', kapitalertraege: '1501', sparerPauschbetrag: '2000' },
  rental: [
    {
      strasse: 'Gartenweg 4',
      plz: '79540',
      city: 'Lörrach',
      livingArea: '90',
      mieteinnahmen: '12000',
      anschaffungskosten: '300000',
      baujahr: '1960',
      werbungskosten: '2500',
      depreciationAsLastYear: true,
      anteilA: '70',
    },
  ],
  kinder: [
    { ...CHILD, kinshipB: '1', otherParent: null, swissFamilyAllowanceEur: '2400', childBenefitClaimEur: null },
    { ...CHILD, firstName: 'Tom', lastName: 'Muster', geburtsdatum: '2025-04-10', kinshipB: null, healthInsuranceAbroad: true, childcareEur: null },
  ],
  healthInsurance: [{ kind: 'gesetzlich', basicHealthAmount: 2800, withSickPay: false, careInsuranceAmount: 500, optionalExtrasAmount: 0 }],
}

/** A single parent with children in every other-parent situation and the gaps they leave. */
export const CHILDREN: PrintoutFacts = {
  taxYear: 2025,
  profile: PROFILE,
  masterData: { ...MASTER_DATA, familienstand: 'ledig', familienstandSeit: null },
  bruttoarbeitslohn: '30000',
  singleParent: { otherPerson: 'Nein', householdCommunity: 'Nein' },
  kinder: [
    { ...CHILD, sequenceNumber: '2', otherParent: 'Verstorben', otherParentDiedOn: '2025-05-31' },
    { ...CHILD, firstName: 'Mia', otherParent: 'Unbekannt', registeredWithMeAllYear: false },
    { ...CHILD, firstName: 'Noah', otherParent: 'Ausland' },
    { ...CHILD, firstName: 'Ole', geburtsdatum: '2005-02-01' },
    { ...CHILD, firstName: 'Pia', taxId: null, kinship: null, domesticResidenceAllYear: null, otherParent: 'Inland', otherParentAddress: null },
    { ...CHILD, firstName: 'Ria', domesticResidenceAllYear: false },
  ],
}

/** A couple where both commute to Switzerland: A only there, B after a change from a German employer. */
export const CROSS_BORDER: PrintoutFacts = {
  taxYear: 2025,
  profile: PROFILE,
  masterData: { ...MASTER_DATA, familienstand: 'verheiratet', familienstandSeit: '2015-08-15' },
  bruttoarbeitslohn: null,
  commute: { ...COMMUTE, second: null },
  chSalaryCertificate: CH_SALARY,
  lifeSituations: { trainingEur: 700, relocationEur: 300, wageReplacementEur: null, severance: false, secondHousehold: false },
  link: {
    filingType: 'zusammen',
    personB: {
      ...PERSON_B,
      pension: null,
      commute: COMMUTE,
      chSalaryCertificate: { ...CH_SALARY, steuerfreiesUnfalltaggeldChf: null, nbuvArbeitgeberProzent: '100', nbuvArbeitgeberChf: '900', krankentaggeldArbeitgeberProzent: '0' },
      lifeSituations: { ...NO_LIFE_SITUATIONS, trainingEur: 400, secondHousehold: true },
    },
  },
  capital: { depot: 'deutscher-broker', inhaber: 'B', kapitalertraege: '800', sparerPauschbetrag: '800', kapitalertragsteuer: '0', solidaritaetszuschlag: '0', kirchensteuer: '0' },
  healthInsurance: [{ kind: 'ausland', basicHealthAmount: 4200, withSickPay: true, careInsuranceAmount: 0, optionalExtrasAmount: 300 }],
}

/** A single filer who changed from a German to a Swiss employer during the year. */
export const JOB_CHANGE: PrintoutFacts = {
  taxYear: 2025,
  profile: PROFILE,
  masterData: MASTER_DATA,
  bruttoarbeitslohn: '20000',
  commute: COMMUTE,
  chSalaryCertificate: { ...CH_SALARY, grossWageChf: '50000' },
  lifeSituations: { ...NO_LIFE_SITUATIONS, trainingEur: 500 },
  riester: { kind: 'Mittelbar', incomeLastYear: null },
}

/** Everything that blocks the print at once. */
export const GAPS: PrintoutFacts = {
  taxYear: 2025,
  profile: { firstName: null, lastName: 'Beispiel', steuerId: null, steuernummer: null },
  masterData: null,
  bruttoarbeitslohn: 'unklar',
  pension: { rentenart: 'Betriebsrente', jahresbetrag: '3000' },
  capital: { depot: 'krypto', kapitalertraege: '200' },
  chSalaryCertificate: { ...CH_SALARY, specialCases: true },
  childrenAnswered: true,
  kinder: [],
  lifeSituations: { ...NO_LIFE_SITUATIONS, secondHousehold: true, severance: true },
  rental: [{ strasse: null, plz: null, city: null, livingArea: null, mieteinnahmen: 'unklar', anschaffungskosten: null, baujahr: null, werbungskosten: null, depreciationAsLastYear: null }],
  riester: { kind: null, incomeLastYear: null },
  specialExpenses: { donations: 'unklar' },
}

/** A married couple filing jointly where both have a special case in the Anlage N-Gre and a pension elsewhere. */
export const JOINT_GAPS: PrintoutFacts = {
  ...GAPS,
  profile: PROFILE,
  masterData: { ...MASTER_DATA, familienstand: 'verheiratet' },
  link: {
    filingType: 'zusammen',
    personB: {
      firstName: 'Ben',
      lastName: null,
      steuerId: '86095742719',
      geburtsdatum: null,
      pension: { rentenart: 'Betriebsrente', jahresbetrag: '100' },
      chSalaryCertificate: { ...CH_SALARY, specialCases: true },
    },
  },
  capital: { depot: 'deutscher-broker', inhaber: 'gemeinsam', kapitalertraege: '100', sparerPauschbetrag: 'unklar' },
}

/** Married, filing separately, nothing else. */
export const MARRIED_SEPARATE: PrintoutFacts = {
  taxYear: 2025,
  profile: PROFILE,
  masterData: { ...MASTER_DATA, familienstand: 'verheiratet', kontoinhaber: null, iban: null },
  bruttoarbeitslohn: null,
  link: { filingType: 'einzel', personB: PERSON_B },
}

/** Married without a linked spouse. */
export const MARRIED_UNLINKED: PrintoutFacts = { ...MARRIED_SEPARATE, link: null }

export const GOLDEN_CASES: Readonly<Record<string, PrintoutFacts>> = {
  single: SINGLE,
  married: MARRIED,
  children: CHILDREN,
  crossBorder: CROSS_BORDER,
  jobChange: JOB_CHANGE,
  gaps: GAPS,
  jointGaps: JOINT_GAPS,
  marriedSeparate: MARRIED_SEPARATE,
  marriedUnlinked: MARRIED_UNLINKED,
}
