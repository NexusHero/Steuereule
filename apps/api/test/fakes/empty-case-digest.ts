// A CaseDigest with nothing entered: the common ground of the prompt tests, which add what they are about.
import type { CaseDigest } from '@steuereule/core'

/** A single filer of 2025 with no figures; `furtherFacts` takes what the test is about. */
export function emptyCaseDigest(furtherFacts: Partial<CaseDigest['furtherFacts']> = {}, overrides: Partial<CaseDigest> = {}): CaseDigest {
  return {
    taxYear: 2025,
    filingStatus: 'einzel',
    lstbPersonA: { grossWageEur: null, wageTaxEur: null, socialSecurityEur: null },
    crossBorder: { isCrossBorderCh: false, grossWageChf: null, withholdingTaxChf: null, pillar3aChf: null, healthInsuranceChf: null, dailySicknessBenefitChf: null, nonReturnDays: null },
    commuteAndWorkdays: { workdays: 220, homeOfficeAnswer: null, homeOfficeDays: 0, distanceKm: null },
    catalogExpenses: { hasTraining: false, trainingCostsEur: null, relocationCostsEur: null, donationsEur: null, selfPaidKvPvEur: null, riesterEur: null, doubleHouseholdRentEur: null, workExpenses: { professionalBodiesEur: null, workEquipmentEur: null, accountFeesEur: null, otherWorkExpensesEur: null }, childcareDeductionEur: 0 },
    childrenCount: 0,
    childrenAges: [],
    rentalObjectsCount: 0,
    capitalGainEur: null,
    priorYearComparison: { donationsEur: null },
    openOwlHints: [],
    printoutMissingFields: [],
    estimatedRefundEur: null,
    furtherFacts: {
      answeredQuestions: 3,
      filingStatusAnswered: true,
      singleParent: false,
      pension: null,
      rentals: { rentEur: null, expensesEur: null, loanInterestEur: null },
      capital: { withheldTaxEur: null, saverAllowanceUsedEur: null, depot: null },
      sideJobGrossEur: null,
      wageReplacementEur: null,
      severanceEur: null,
      healthCostsEur: null,
      householdServicesEur: null,
      filingDeadline: null,
      voluntaryFilingDeadline: null,
      ...furtherFacts,
    },
    ...overrides,
  } as CaseDigest
}
