import {
  type Screen,
} from '@steuereule/core'
import type { ScreenAccess } from '../common/screen-access.js'
import type { AssessmentRepository } from '../assessment/assessment.repository.js'
import { ASSESSMENT_ACCESS_FIELDS, assessmentFieldAccess } from '../assessment/assessment-field-access.js'
import type { CapitalRepository } from '../capital/capital.repository.js'
import { CAPITAL_ACCESS_FIELDS, capitalFieldAccess } from '../capital/capital-field-access.js'
import type { CommuteRepository } from '../commute/commute.repository.js'
import { COMMUTE_ACCESS_FIELDS, commuteFieldAccess } from '../commute/commute-field-access.js'
import type { WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { LSTB_ACCESS_FIELDS, lstbFieldAccess } from '../lstb/lstb-field-access.js'
import type { PensionRepository } from '../pension/pension.repository.js'
import { PENSION_ACCESS_FIELDS, pensionFieldAccess } from '../pension/pension-field-access.js'
import type { RentalRepository } from '../rental/rental.repository.js'
import { RENTAL_ACCESS_FIELDS, rentalFieldAccess } from '../rental/rental-field-access.js'
import type { ProfileRepository } from '../profile/profile.repository.js'
import { PROFILE_ACCESS_FIELDS, profileFieldAccess } from '../profile/profile-field-access.js'
import type { MasterDataRepository } from '../master-data/master-data.repository.js'
import { MASTER_DATA_ACCESS_FIELDS, masterDataFieldAccess } from '../master-data/master-data-field-access.js'
import type { PartnerCouplingRepository } from '../link/link.repository.js'
import { LINK_ACCESS_FIELDS, linkFieldAccess, type SetFilingType } from '../link/link-field-access.js'
import type { InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { INTERVIEW_ACCESS_FIELDS, interviewFieldAccess } from '../interview/interview-field-access.js'
import type { CrossBorderSalaryStatementRepository } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { CH_SALARY_ACCESS_FIELDS, chSalaryCertificateFieldAccess } from '../ch-salary-certificate/ch-salary-certificate-field-access.js'
import type { ChildRepository } from '../children/child.repository.js'
import { CHILD_ACCESS_FIELDS, childFieldAccess } from '../children/child-field-access.js'

export type { ScreenAccess }

export type FieldAccess = Readonly<Partial<Record<Screen, ScreenAccess>>>

export const FIELD_ACCESS = Symbol('FELD_ZUGRIFF')

export interface FieldAccessRepositories {
  readonly lstb: WageTaxCertificateRepository
  readonly pension: PensionRepository
  readonly capital: CapitalRepository
  readonly rental: RentalRepository
  readonly profile?: ProfileRepository
  readonly masterData?: MasterDataRepository
  readonly link?: PartnerCouplingRepository
  readonly interview?: InterviewAnswerRepository
  readonly chSalaryCertificate?: CrossBorderSalaryStatementRepository
  readonly child?: ChildRepository
  readonly commute?: CommuteRepository
  readonly assessment?: AssessmentRepository
  /** The Kopplung mask's way of choosing the Veranlagungsart (`LinkService.set`); see `SetFilingType`. */
  readonly linkFilingType?: SetFilingType
  /**
   * The book (ADR-0101 §18): a booking draft the user takes is posted as a journal entry, never
   * written as a field. Provided by the business module; without it a booking draft cannot be applied.
   */
  readonly booking?: ScreenAccess
}

/** The one field of a booking draft: the entry as JSON (core `serializeBookingDraft`). */
export const BOOKING_ACCESS_FIELDS = ['entry'] as const



/**
 * Every field a screen can take through the confirmation path, without touching a repository.
 * The same lists `fieldAccessFrom` serves; whoever proposes a write (the owl, a receipt) can check
 * a name against them before a draft exists that could never be applied.
 */
export const WRITABLE_FIELDS_BY_SCREEN: Readonly<Record<Screen, readonly string[]>> = {
  lstb: LSTB_ACCESS_FIELDS,
  rente: PENSION_ACCESS_FIELDS,
  kapital: CAPITAL_ACCESS_FIELDS,
  vermietung: RENTAL_ACCESS_FIELDS,
  profil: PROFILE_ACCESS_FIELDS,
  stammdaten: MASTER_DATA_ACCESS_FIELDS,
  kopplung: LINK_ACCESS_FIELDS,
  interview: INTERVIEW_ACCESS_FIELDS,
  chLohnausweis: CH_SALARY_ACCESS_FIELDS,
  kind: CHILD_ACCESS_FIELDS,
  commute: COMMUTE_ACCESS_FIELDS,
  assessment: ASSESSMENT_ACCESS_FIELDS,
  buchung: BOOKING_ACCESS_FIELDS,
}

export function fieldAccessFrom({
  lstb,
  pension,
  capital,
  rental,
  profile,
  masterData,
  link,
  interview,
  chSalaryCertificate,
  child,
  commute,
  assessment,
  linkFilingType,
  booking,
}: FieldAccessRepositories): FieldAccess {
  const access: Partial<Record<Screen, ScreenAccess>> = {
    lstb: lstbFieldAccess(lstb),
    rente: pensionFieldAccess(pension),
    kapital: capitalFieldAccess(capital),
    vermietung: rentalFieldAccess(rental),
  }

  if (profile) access.profil = profileFieldAccess(profile)

  if (masterData) access.stammdaten = masterDataFieldAccess(masterData)

  if (link) access.kopplung = linkFieldAccess(link, linkFilingType)

  if (interview) access.interview = interviewFieldAccess(interview)

  if (chSalaryCertificate) access.chLohnausweis = chSalaryCertificateFieldAccess(chSalaryCertificate)

  if (child) access.kind = childFieldAccess(child)

  if (commute) {
    // The public-holiday region of a way starts from the home address, which the master data holds.
    const homePostalCode = masterData && (async (userId: string) => (await masterData.findByUserId(userId))?.plz)
    access.commute = commuteFieldAccess(commute, homePostalCode)
  }

  if (assessment) access.assessment = assessmentFieldAccess(assessment)

  if (booking) access.buchung = booking
  return access
}
