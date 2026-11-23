import {
  calculateWorkdays,
  type IsoWeekday,
  type Screen,
  effectivePublicHolidays,
  germanStateOfAddress,
  isHolidayRegion,
  GERMAN_DATE_PATTERN,
} from '@steuereule/core'
import { InvalidInputError } from '../common/domain-error.js'
import type { ScreenAccess } from '../common/screen-access.js'
import type { AssessmentRepository } from '../assessment/assessment.repository.js'
import { ASSESSMENT_ACCESS_FIELDS, assessmentFieldAccess } from '../assessment/assessment-field-access.js'
import type { CapitalRepository } from '../capital/capital.repository.js'
import { CAPITAL_ACCESS_FIELDS, capitalFieldAccess } from '../capital/capital-field-access.js'
import { MEANS_OF_TRANSPORT, WORK_EXPENSE_AMOUNT_FIELDS, WORK_EXPENSE_NOTE_FIELDS, type CommuteInputs, type CommuteRepository, type MeansOfTransport } from '../commute/commute.repository.js'
import type { WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { LSTB_ACCESS_FIELDS, lstbFieldAccess } from '../lstb/lstb-field-access.js'
import { assertTravelDaysFit } from '../commute/ways-to-work.js'
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

const COMMUTE_ACCESS_FIELDS = [
  'workdays',
  'vacationDays',
  'sickDays',
  'homeOfficeDays',
  'oneWayKm',
  'transport',
  'publicHolidays',
  'publicHolidayRegion',
  ...WORK_EXPENSE_AMOUNT_FIELDS,
  ...WORK_EXPENSE_NOTE_FIELDS,
  'periodFrom',
  'periodTo',
  'secondOneWayKm',
  'secondTransport',
  'secondFrom',
  'secondTo',
  'workplace',
  'secondWorkplace',
  'travelDays',
  'secondTravelDays',
  'shortestRouteConfirmed',
  'secondShortestRouteConfirmed',
] as const
const COMMUTE_BOOLEAN_FIELDS: ReadonlySet<string> = new Set(['shortestRouteConfirmed', 'secondShortestRouteConfirmed'])
const COMMUTE_DATE_FIELDS: ReadonlySet<string> = new Set(['periodFrom', 'periodTo', 'secondFrom', 'secondTo'])
const INTEGER_RE = /^-?\d+$/


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
    access.commute = {
      fields: COMMUTE_ACCESS_FIELDS,
      withInstance: false,
      async read(userId, taxYear) {
        const r = await commute.findForUserAndYear(userId, taxYear)
        if (r === null) {
          return Object.fromEntries(COMMUTE_ACCESS_FIELDS.map((f) => [f, null]))
        }
        return {
          workdays: r.workdays.join(','),
          vacationDays: String(r.vacationDays),
          sickDays: String(r.sickDays),
          homeOfficeDays: String(r.homeOfficeDays),
          oneWayKm: r.oneWayKm === null ? null : String(r.oneWayKm),
          transport: r.transport,
          publicHolidays: r.publicHolidays === null || r.publicHolidays === undefined ? null : String(r.publicHolidays),
          publicHolidayRegion: r.publicHolidayRegion ?? null,
          ...Object.fromEntries(WORK_EXPENSE_AMOUNT_FIELDS.map((f) => [f, r[f] === null || r[f] === undefined ? null : String(r[f])])),
          ...Object.fromEntries(WORK_EXPENSE_NOTE_FIELDS.map((f) => [f, r[f] ?? null])),
          periodFrom: r.periodFrom ?? null,
          periodTo: r.periodTo ?? null,
          secondOneWayKm: r.secondOneWayKm === null || r.secondOneWayKm === undefined ? null : String(r.secondOneWayKm),
          secondTransport: r.secondTransport ?? null,
          secondFrom: r.secondFrom ?? null,
          secondTo: r.secondTo ?? null,
          workplace: r.workplace ?? null,
          secondWorkplace: r.secondWorkplace ?? null,
          travelDays: r.travelDays === null || r.travelDays === undefined ? null : String(r.travelDays),
          secondTravelDays: r.secondTravelDays === null || r.secondTravelDays === undefined ? null : String(r.secondTravelDays),
          shortestRouteConfirmed: r.shortestRouteConfirmed === null || r.shortestRouteConfirmed === undefined ? null : String(r.shortestRouteConfirmed),
          secondShortestRouteConfirmed: r.secondShortestRouteConfirmed === null || r.secondShortestRouteConfirmed === undefined ? null : String(r.secondShortestRouteConfirmed),
        }
      },
      async write(userId, taxYear, _instance, field, value) {
        const current: CommuteInputs = (await commute.findForUserAndYear(userId, taxYear)) ?? {
          workdays: [1, 2, 3, 4, 5],
          vacationDays: 0,
          sickDays: 0,
          homeOfficeDays: 0,
          oneWayKm: null,
          transport: null,
          workplace: null,
          publicHolidays: null,
          publicHolidayRegion: null,
        }

        const parseBoundedInt = (raw: string | null, min: number, max: number, label: string): number | null => {
          if (raw === null) return null
          const trimmed = raw.trim()
          if (!INTEGER_RE.test(trimmed)) {
            throw new InvalidInputError('FIELD_VALUE_INVALID', `"${label}" must be an integer between ${min} and ${max}.`)
          }
          const n = Number(trimmed)
          if (!Number.isInteger(n) || n < min || n > max) {
            throw new InvalidInputError('FIELD_VALUE_INVALID', `"${label}" must be an integer between ${min} and ${max}.`)
          }
          return n
        }

        let updated: CommuteInputs = current
        switch (field) {
          case 'workdays': {
            if (value === null) {
              throw new InvalidInputError('FIELD_VALUE_INVALID', '"workdays" cannot be null.')
            }
            const parsed = [...new Set(value.split(',').map((part) => part.trim()).filter((part) => part !== ''))].map((part) => {
              const n = parseBoundedInt(part, 1, 7, 'workdays')
              return n as IsoWeekday
            })
            if (parsed.length === 0) {
              throw new InvalidInputError('FIELD_VALUE_INVALID', '"workdays" must contain at least one ISO weekday (1-7).')
            }
            updated = { ...current, workdays: parsed }
            break
          }
          case 'vacationDays':
            updated = { ...current, vacationDays: parseBoundedInt(value, 0, 366, 'vacationDays') ?? 0 }
            break
          case 'sickDays':
            updated = { ...current, sickDays: parseBoundedInt(value, 0, 366, 'sickDays') ?? 0 }
            break
          case 'homeOfficeDays':
            updated = { ...current, homeOfficeDays: parseBoundedInt(value, 0, 366, 'homeOfficeDays') ?? 0 }
            break
          case 'oneWayKm':
            updated = { ...current, oneWayKm: parseBoundedInt(value, 0, 999, 'oneWayKm') }
            break
          case 'transport': {
            if (value !== null && !MEANS_OF_TRANSPORT.includes(value as MeansOfTransport)) {
              throw new InvalidInputError('FIELD_VALUE_INVALID', `"transport" must be one of: ${MEANS_OF_TRANSPORT.join(', ')}.`)
            }
            updated = { ...current, transport: value as MeansOfTransport | null }
            break
          }
          case 'publicHolidays':
            updated = { ...current, publicHolidays: parseBoundedInt(value, 0, 30, 'publicHolidays') }
            break
          case 'publicHolidayRegion': {
            const trimmed = value === null ? null : value.trim()
            if (trimmed !== null && trimmed.length > 8) {
              throw new InvalidInputError('FIELD_VALUE_INVALID', '"publicHolidayRegion" must be at most 8 characters.')
            }
            updated = { ...current, publicHolidayRegion: trimmed === '' ? null : trimmed }
            break
          }
          case 'secondOneWayKm':
            updated = { ...current, secondOneWayKm: parseBoundedInt(value, 0, 999, 'secondOneWayKm') }
            break
          case 'secondTransport': {
            if (value !== null && !MEANS_OF_TRANSPORT.includes(value as MeansOfTransport)) {
              throw new InvalidInputError('FIELD_VALUE_INVALID', `"secondTransport" must be one of: ${MEANS_OF_TRANSPORT.join(', ')}.`)
            }
            updated = { ...current, secondTransport: value as MeansOfTransport | null }
            break
          }
          case 'travelDays':
          case 'secondTravelDays':
            updated = { ...current, [field]: parseBoundedInt(value, 0, 366, field) }
            break
          default: {
            if (COMMUTE_BOOLEAN_FIELDS.has(field)) {
              if (value !== null && value !== 'true' && value !== 'false') throw new InvalidInputError('FIELD_VALUE_INVALID', `"${value}" is not "true" or "false".`)
              updated = { ...current, [field]: value === null ? null : value === 'true' }
              break
            }
            if (field === 'workplace' || field === 'secondWorkplace') {
              const trimmed = value === null ? '' : value.trim()
              updated = { ...current, [field]: trimmed === '' ? null : trimmed.slice(0, 120) }
              break
            }
            if (COMMUTE_DATE_FIELDS.has(field)) {
              const trimmed = value === null ? null : value.trim()
              if (trimmed !== null && trimmed !== '' && !GERMAN_DATE_PATTERN.test(trimmed)) {
                throw new InvalidInputError('FIELD_VALUE_INVALID', `"${field}" must be a date DD.MM.YYYY.`)
              }
              updated = { ...current, [field]: trimmed === '' ? null : trimmed }
              break
            }
            if ((WORK_EXPENSE_AMOUNT_FIELDS as readonly string[]).includes(field)) {
              updated = { ...current, [field]: parseBoundedInt(value, 0, 1_000_000, field) }
              break
            }
            if ((WORK_EXPENSE_NOTE_FIELDS as readonly string[]).includes(field)) {
              const trimmed = value === null ? null : value.trim()
              if (trimmed !== null && trimmed.length > 100) throw new InvalidInputError('FIELD_VALUE_INVALID', `"${field}" must be at most 100 characters.`)
              updated = { ...current, [field]: trimmed === '' ? null : trimmed }
              break
            }
            return false
          }
        }

        // The mask starts from the Bundesland of the home address; a way written here gets the same
        // start, or the workplace's own state when its postal code names one. A region or a count the
        // user set stands, and so does a region cleared in this very write.
        const holidaysOpen = !isHolidayRegion(updated.publicHolidayRegion) && (updated.publicHolidays ?? null) === null
        if (holidaysOpen && field !== 'publicHolidayRegion' && field !== 'publicHolidays') {
          const region = germanStateOfAddress(updated.workplace) ?? germanStateOfAddress((await masterData?.findByUserId(userId))?.plz)
          if (region !== null) updated = { ...updated, publicHolidayRegion: region }
        }

        const workdaysRes = calculateWorkdays({
          year: taxYear,
          workdays: updated.workdays,
          vacationDays: updated.vacationDays,
          sickDays: updated.sickDays,
          homeOfficeDays: updated.homeOfficeDays,
          publicHolidays: effectivePublicHolidays(taxYear, updated),
        })
        if (workdaysRes.kind === 'widerspruch') {
          throw new InvalidInputError(
            'ARBEITSTAGE_WIDERSPRUCH',
            `The days off exceed the working days (${workdaysRes.conflict.kind}).`,
          )
        }

        assertTravelDaysFit(taxYear, updated)

        await commute.save(userId, taxYear, updated)
        return true
      },
    }
  }

  if (assessment) access.assessment = assessmentFieldAccess(assessment)

  if (booking) access.buchung = booking
  return access
}
