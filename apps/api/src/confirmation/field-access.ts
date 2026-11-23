import {
  ASSESSMENT_FIELD_IDS,
  ASSESSMENT_NEW_POSITION_IDS,
  isAssessmentPositionId,
  isValidAssessmentPositionAmount,
  WAGE_TAX_CERTIFICATE_FIELDS, LSTB_OPTIONAL_LINES, LSTB_SOCIAL_LINES, LSTB_SOLI_LINE,
  RENTAL_FIELDS,
  SALARY_CERTIFICATE_AMOUNT_FIELDS,
  QUESTIONS,
  calculateWorkdays,
  isValidAnswer,
  isValidAssessmentAmount,
  type AssessmentField,
  type EntryStepId,
  type IsoWeekday,
  type WageTaxCertificateFieldId,
  type Screen,
  type RentalFieldId,
  type SalaryCertificateAmountFieldId,
  effectivePublicHolidays,
  germanStateOfAddress,
  isHolidayRegion,
  GERMAN_DATE_PATTERN,
  ISO_DATE_PATTERN,
} from '@steuereule/core'
import { InvalidInputError } from '../common/domain-error.js'
import type { ScreenAccess } from '../common/screen-access.js'
import type { AssessmentRepository } from '../assessment/assessment.repository.js'
import type { CapitalRepository } from '../capital/capital.repository.js'
import { CAPITAL_ACCESS_FIELDS, capitalFieldAccess } from '../capital/capital-field-access.js'
import { MEANS_OF_TRANSPORT, WORK_EXPENSE_AMOUNT_FIELDS, WORK_EXPENSE_NOTE_FIELDS, type CommuteInputs, type CommuteRepository, type MeansOfTransport } from '../commute/commute.repository.js'
import type { LstbLine, WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { storeLstbLines } from '../lstb/lstb-data.js'
import { assertTravelDaysFit } from '../commute/ways-to-work.js'
import type { PensionRepository } from '../pension/pension.repository.js'
import { PENSION_ACCESS_FIELDS, pensionFieldAccess } from '../pension/pension-field-access.js'
import type { RentalRepository } from '../rental/rental.repository.js'
import type { ProfileRepository } from '../profile/profile.repository.js'
import { MASTER_DATA_FIELDS, type MasterDataField, type MasterDataRepository } from '../master-data/master-data.repository.js'
import type { PartnerCouplingRepository } from '../link/link.repository.js'
import type { InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { N_GRE_BOOLEAN_FIELDS, type CrossBorderSalaryStatementRepository, type NGreDetails } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import type { ChildRepository } from '../children/child.repository.js'

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
  /**
   * Chooses the Veranlagungsart the way the Kopplung mask does (`LinkService.set`): „zusammen“
   * creates Person B's placeholder, so there is someone to record for (ADR-0054, ADR-0091).
   */
  readonly linkFilingType?: (userId: string, taxYear: number, filingType: 'einzel' | 'zusammen') => Promise<void>
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
/** Zeilen 22–27, 24c and 5 of the LStB (ADR-0093). */
const LSTB_LINE_FIELDS: readonly string[] = [...LSTB_SOCIAL_LINES, LSTB_SOLI_LINE]
const LSTB_ACCESS_FIELDS = [...WAGE_TAX_CERTIFICATE_FIELDS, ...LSTB_OPTIONAL_LINES, ...LSTB_LINE_FIELDS] as const
const COMMUTE_DATE_FIELDS: ReadonlySet<string> = new Set(['periodFrom', 'periodTo', 'secondFrom', 'secondTo'])
/** The five figures, the Besteuerungsgrundlagen beyond them, the date and the Erläuterungen (ADR-0098 §8). */
const ASSESSMENT_ACCESS_FIELDS = [...ASSESSMENT_FIELD_IDS, ...ASSESSMENT_NEW_POSITION_IDS, 'assessmentDate', 'erlaeuterungen'] as const
const MAX_EXPLANATIONS_LENGTH = 4_000
const INTEGER_RE = /^-?\d+$/

const PROFILE_ACCESS_FIELDS = ['firstName', 'lastName', 'steuerId', 'steuernummer'] as const
const LINK_ACCESS_FIELDS = ['filingType', 'invitationCode'] as const
const INTERVIEW_ACCESS_FIELDS = Object.keys(QUESTIONS)
const NGRE_FIELDS: readonly (keyof NGreDetails)[] = [
  'arbeitgeberName',
  'arbeitgeberStrasse',
  'arbeitgeberPlzOrt',
  'familienzulagenChf',
  'krankentaggeldChf',
  'pkArbeitnehmerChf',
  'pkArbeitgeberChf',
  'pkArbeitgeberGesamtChf',
  'steuerfreiesKrankentaggeldChf',
  'steuerfreiesUnfalltaggeldChf',
  'taggeldQuelle',
  'krankentaggeldArbeitgeberProzent',
  'krankentaggeldArbeitgeberChf',
  'nbuvArbeitgeberProzent',
  'nbuvArbeitgeberChf',
  'krankenkasseZusatzChf',
]
/** The Wechselkurs CHF→EUR as two fields (C4): the rate, and a year (annual average) or a month (BMF monthly rate). */
const EXCHANGE_RATE_FIELDS = ['wechselkurs', 'wechselkursMonat'] as const
const YEAR_OR_MONTH_RE = /^\d{4}(-(0[1-9]|1[0-2]))?$/
const CH_SALARY_ACCESS_FIELDS = [
  ...SALARY_CERTIFICATE_AMOUNT_FIELDS,
  'bemerkungen',
  'saeule3aChf',
  'krankenkasseChf',
  ...NGRE_FIELDS,
  ...EXCHANGE_RATE_FIELDS,
  /** „Keine Sonderfälle“ of the Anlage N-Gre, as the mask's switch (ADR-0091, Nachtrag). */
  'nGreSonderfaelle',
  /** Anlage Vorsorgeaufwand Zeile 49 and the family allowance inside Ziffer 8 (ADR-0093). */
  'kvZuschussAnspruch',
  'familienzulagenImBruttolohn',
] as const
/** What describes a rental object beyond its amounts (Anlage V Zeilen 1–13, 20, 33, 46, 86); the mask's address call stores them. */
const RENTAL_DETAIL_FIELDS = ['strasse', 'hausnummer', 'plz', 'city', 'livingArea', 'einheiten', 'depreciationAsLastYear', 'umlagen', 'schuldzinsen', 'anteilA'] as const
type RentalDetailField = (typeof RENTAL_DETAIL_FIELDS)[number]
const RENTAL_ACCESS_FIELDS = [...RENTAL_FIELDS, ...RENTAL_DETAIL_FIELDS] as const
const CHILD_ACCESS_FIELDS = [
  'firstName',
  'lastName',
  'geburtsdatum',
  'taxId',
  'childBenefitClaimEur',
  'kinship',
  'kinshipB',
  'familyBenefitsOffice',
  'domesticResidenceAllYear',
  'otherParent',
  'otherParentName',
  'otherParentBirthDate',
  'otherParentAddress',
  'otherParentKind',
  'otherParentDiedOn',
  'registeredWithMeAllYear',
  'childBenefitToMeAllYear',
  'healthBasicEur',
  'careEur',
  'swissFamilyAllowanceEur',
  'childcareEur',
  'childcareProvider',
  'childcareFrom',
  'childcareTo',
  'swissFamilyAllowancePayer',
  'healthInsuranceAbroad',
] as const

/**
 * Every field a screen can take through the confirmation path, without touching a repository.
 * The same lists `fieldAccessFrom` serves; whoever proposes a write (the owl, a receipt) can check
 * a name against them before a draft exists that could never be applied.
 */
/** The yes/no beside the master data's text fields (ADR-0052 amendment 3). */
const CHURCH_TAX_LIABLE = 'kirchensteuerpflichtig'
const STAMMDATEN_ACCESS_FIELDS: readonly string[] = [...MASTER_DATA_FIELDS, CHURCH_TAX_LIABLE]

export const WRITABLE_FIELDS_BY_SCREEN: Readonly<Record<Screen, readonly string[]>> = {
  lstb: LSTB_ACCESS_FIELDS,
  rente: PENSION_ACCESS_FIELDS,
  kapital: CAPITAL_ACCESS_FIELDS,
  vermietung: RENTAL_ACCESS_FIELDS,
  profil: PROFILE_ACCESS_FIELDS,
  stammdaten: STAMMDATEN_ACCESS_FIELDS,
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
    lstb: {
      fields: LSTB_ACCESS_FIELDS,
      withInstance: false,
      async read(userId, taxYear) {
        const r = await lstb.findForUserAndYear(userId, taxYear)
        return {
          bruttoarbeitslohn: r?.bruttoarbeitslohn ?? null,
          lohnsteuer: r?.lohnsteuer ?? null,
          sozialversicherung: r?.sozialversicherung ?? null,
          kirchensteuer: r?.kirchensteuer ?? null,
          kirchensteuerEhegatte: r?.kirchensteuerEhegatte ?? null,
          zuschuesseKvPv: r?.zuschuesseKvPv ?? null,
          ...Object.fromEntries(LSTB_LINE_FIELDS.map((line) => [line, r?.[line as LstbLine] ?? null])),
        }
      },
      async write(userId, taxYear, _instance, field, value) {
        if (LSTB_LINE_FIELDS.includes(field)) {
          // The same write as the mask's: the sum of Zeilen 23, 25, 26 and 27 follows the lines (ADR-0093).
          await storeLstbLines(lstb, userId, taxYear, { [field as LstbLine]: value })
        } else if (field === 'zuschuesseKvPv') {
          await lstb.setSubsidies(userId, taxYear, value)
        } else if (field === 'kirchensteuer' || field === 'kirchensteuerEhegatte') {
          const r = await lstb.findForUserAndYear(userId, taxYear)
          const lines = { kirchensteuer: r?.kirchensteuer ?? null, kirchensteuerEhegatte: r?.kirchensteuerEhegatte ?? null }
          await lstb.setChurchTax(userId, taxYear, { ...lines, [field]: value })
        } else {
          await lstb.setField(userId, taxYear, field as WageTaxCertificateFieldId, value)
        }
        return true
      },
    },
    rente: pensionFieldAccess(pension),
    kapital: capitalFieldAccess(capital),
    vermietung: {
      fields: RENTAL_ACCESS_FIELDS,
      withInstance: true,
      async read(userId, taxYear, instance) {
        const property = (await rental.listForUserAndYear(userId, taxYear)).find((o) => o.id === instance)
        if (property === undefined) return null
        const details = Object.fromEntries(
          RENTAL_DETAIL_FIELDS.map((f) => {
            const v = property[f]
            return [f, v === null || v === undefined ? null : String(v)]
          }),
        )
        return { ...Object.fromEntries(RENTAL_FIELDS.map((f) => [f, property[f]])), ...details }
      },
      async write(userId, taxYear, instance, field, value) {
        if (instance === null) return false
        if ((RENTAL_DETAIL_FIELDS as readonly string[]).includes(field)) {
          const detail = field as RentalDetailField
          const stored = detail === 'depreciationAsLastYear' ? (value === null ? null : value === 'true') : value
          return (await rental.setAddress(userId, taxYear, instance, { [detail]: stored })) !== null
        }
        return (await rental.setField(userId, taxYear, instance, field as RentalFieldId, value)) !== null
      },
    },
  }

  if (profile) {
    access.profil = {
      fields: PROFILE_ACCESS_FIELDS,
      withInstance: false,
      async read(userId) {
        const p = await profile.findByUserId(userId)
        return {
          // The profile stores a missing name as '' (both are required columns): that is no value to keep.
          firstName: p?.firstName || null,
          lastName: p?.lastName || null,
          steuerId: p?.steuerId ?? null,
          steuernummer: p?.steuernummer ?? null,
        }
      },
      async write(userId, _year, _instance, field, value) {
        const current = await profile.findByUserId(userId)
        await profile.upsert(userId, {
          firstName: current?.firstName ?? '',
          lastName: current?.lastName ?? '',
          steuerId: current?.steuerId ?? null,
          steuernummer: current?.steuernummer ?? null,
          [field]: value,
        })
        return true
      },
    }
  }

  if (masterData) {
    access.stammdaten = {
      fields: STAMMDATEN_ACCESS_FIELDS,
      withInstance: false,
      async read(userId) {
        const m = await masterData.findByUserId(userId)
        const liable = m?.kirchensteuerpflichtig
        return { ...Object.fromEntries(MASTER_DATA_FIELDS.map((f) => [f, m?.[f] ?? null])), [CHURCH_TAX_LIABLE]: liable === true || liable === false ? String(liable) : null }
      },
      async write(userId, _year, _instance, field, value) {
        const current = (await masterData.findByUserId(userId)) ?? {
          geburtsdatum: null,
          strasse: null,
          hausnummer: null,
          hausnummerZusatz: null,
          plz: null,
          wohnort: null,
          beruf: null,
          religion: null,
          familienstand: null,
          familienstandSeit: null,
          iban: null,
          kontoinhaber: null,
          finanzamt: null,
          telefon: null,
          religionEinwilligungAm: null,
        }
        if (field === CHURCH_TAX_LIABLE) {
          await masterData.save(userId, { ...current, kirchensteuerpflichtig: value === null ? null : value === 'true' })
          return true
        }
        await masterData.save(userId, {
          ...current,
          [field as MasterDataField]: value,
          // Art. 9 DSGVO: the religion is stored only with the moment of the consent (ADR-0091 for the owl's write).
          ...(field === 'religion' ? { religionEinwilligungAm: value === null ? null : new Date() } : {}),
        })
        return true
      },
    }
  }

  if (link) {
    access.kopplung = {
      fields: LINK_ACCESS_FIELDS,
      withInstance: false,
      async read(userId, taxYear) {
        const l = await link.findByUserAndYear(userId, taxYear)
        return {
          filingType: l?.filingType ?? null,
          invitationCode: l?.invitationCode ?? null,
        }
      },
      async write(userId, taxYear, _instance, field, value) {
        if (field === 'filingType' && linkFilingType) {
          await linkFilingType(userId, taxYear, value === 'zusammen' ? 'zusammen' : 'einzel')
          return true
        }
        const current = await link.findByUserAndYear(userId, taxYear)
        if (field === 'filingType') {
          const filingType = value === 'zusammen' ? 'zusammen' : 'einzel'
          await link.upsert(userId, taxYear, {
            personBUserId: current?.personBUserId ?? '',
            filingType,
            invitationCode: current?.invitationCode ?? null,
          })
          return true
        }
        if (field === 'invitationCode') {
          await link.upsert(userId, taxYear, {
            personBUserId: current?.personBUserId ?? '',
            filingType: current?.filingType ?? 'einzel',
            invitationCode: value,
          })
          return true
        }
        return false
      },
    }
  }

  if (interview) {
    access.interview = {
      fields: INTERVIEW_ACCESS_FIELDS,
      withInstance: false,
      async read(userId, taxYear) {
        const rows = await interview.findAllForUserAndYear(userId, taxYear)
        return Object.fromEntries(rows.map((r) => [r.questionId, r.value]))
      },
      async write(userId, taxYear, _instance, field, value) {
        // The interview's own endpoint checks every answer; this path did not. One value outside
        // the accepted set (say „angestellt“ for „Angestellt“) made every later read of that
        // user's interview fail (#476). Null and '' take an answer back and stay allowed.
        if (value !== null && value !== '' && !isValidAnswer(field as EntryStepId, value)) {
          throw new InvalidInputError('FIELD_VALUE_INVALID', `"${value}" is not an accepted answer for "${field}".`)
        }
        await interview.write({
          userId,
          taxYear,
          questionId: field,
          value: value ?? '',
          openItems: 0,
        })
        return true
      },
    }
  }

  if (chSalaryCertificate) {
    access.chLohnausweis = {
      fields: CH_SALARY_ACCESS_FIELDS,
      withInstance: false,
      async read(userId, taxYear) {
        const r = await chSalaryCertificate.findForUserAndYear(userId, taxYear)
        const nGreFields: Record<string, string | null> = {}
        if (r?.nGre) {
          for (const [k, v] of Object.entries(r.nGre)) {
            nGreFields[k] = v === null ? null : typeof v === 'boolean' ? String(v) : v
          }
        }
        return {
          ...(r?.fields),
          wechselkurs: r?.exchangeRateValue === null || r?.exchangeRateValue === undefined ? null : String(r.exchangeRateValue),
          wechselkursMonat: r?.exchangeRateMonth ?? null,
          bemerkungen: r?.bemerkungen ?? null,
          saeule3aChf: r?.saeule3aChf ?? null,
          krankenkasseChf: r?.krankenkasseChf ?? null,
          ...nGreFields,
        }
      },
      async write(userId, taxYear, _instance, field, value) {
        if ((SALARY_CERTIFICATE_AMOUNT_FIELDS as readonly string[]).includes(field)) {
          await chSalaryCertificate.setField(userId, taxYear, field as SalaryCertificateAmountFieldId, value)
          return true
        }
        if (field === 'bemerkungen') {
          await chSalaryCertificate.setRemarks(userId, taxYear, value)
          return true
        }
        if ((EXCHANGE_RATE_FIELDS as readonly string[]).includes(field)) {
          // The mode follows the period: a year is the annual average (Anlage N-Gre), a month the BMF monthly rate.
          // A rate with a receipt ("tatsächlich") is the mask's, the owl does not set it.
          const current = await chSalaryCertificate.findForUserAndYear(userId, taxYear)
          let rate = current?.exchangeRateValue ?? null
          let month = current?.exchangeRateMonth ?? null
          if (field === 'wechselkurs') {
            const parsed = value === null ? null : Number(value.replace(',', '.'))
            if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0)) {
              throw new InvalidInputError('WECHSELKURS_INVALID', '"wechselkurs" must be a positive number.')
            }
            rate = parsed
            month ??= String(taxYear)
          } else {
            if (value !== null && !YEAR_OR_MONTH_RE.test(value)) {
              throw new InvalidInputError('WECHSELKURS_INVALID', '"wechselkursMonat" must be yyyy or yyyy-mm.')
            }
            month = value
          }
          const mode = month === null ? null : month.length === 4 ? 'jahresdurchschnitt' : 'amtlich'
          await chSalaryCertificate.setExchangeRate(userId, taxYear, { month, rate, mode })
          return true
        }
        if (field === 'saeule3aChf' || field === 'krankenkasseChf') {
          await chSalaryCertificate.setProvision(userId, taxYear, { [field]: value })
          return true
        }
        if ((NGRE_FIELDS as readonly string[]).includes(field)) {
          await chSalaryCertificate.setNGre(userId, taxYear, { [field]: value })
          return true
        }
        if ((N_GRE_BOOLEAN_FIELDS as readonly string[]).includes(field)) {
          if (value !== null && value !== 'true' && value !== 'false') {
            throw new InvalidInputError('FIELD_VALUE_INVALID', `"${value}" is not "true" or "false".`)
          }
          await chSalaryCertificate.setNGre(userId, taxYear, { [field]: value === null ? null : value === 'true' })
          return true
        }
        return false
      },
    }
  }

  if (child) {
    access.kind = {
      fields: CHILD_ACCESS_FIELDS,
      withInstance: true,
      async read(userId, taxYear, instance) {
        if (instance === null) return null
        const list = await child.listForUserAndYear(userId, taxYear)
        const c = list.find((k) => k.id === instance)
        if (!c) return null
        return {
          firstName: c.firstName,
          lastName: c.lastName,
          geburtsdatum: c.geburtsdatum,
          taxId: c.taxId,
          childBenefitClaimEur: c.childBenefitClaimEur,
          kinship: c.kinship,
          kinshipB: c.kinshipB,
          familyBenefitsOffice: c.familyBenefitsOffice,
          domesticResidenceAllYear: c.domesticResidenceAllYear === null ? null : String(c.domesticResidenceAllYear),
          otherParent: c.otherParent,
          otherParentName: c.otherParentName,
          otherParentBirthDate: c.otherParentBirthDate,
          otherParentAddress: c.otherParentAddress,
          otherParentKind: c.otherParentKind,
          otherParentDiedOn: c.otherParentDiedOn,
          registeredWithMeAllYear: c.registeredWithMeAllYear === null ? null : String(c.registeredWithMeAllYear),
          childBenefitToMeAllYear: c.childBenefitToMeAllYear === null ? null : String(c.childBenefitToMeAllYear),
          healthBasicEur: c.healthBasicEur,
          careEur: c.careEur,
          swissFamilyAllowanceEur: c.swissFamilyAllowanceEur,
          childcareEur: c.childcareEur ?? null,
          childcareProvider: c.childcareProvider ?? null,
          childcareFrom: c.childcareFrom ?? null,
          childcareTo: c.childcareTo ?? null,
          swissFamilyAllowancePayer: c.swissFamilyAllowancePayer ?? null,
          healthInsuranceAbroad: c.healthInsuranceAbroad === null || c.healthInsuranceAbroad === undefined ? null : String(c.healthInsuranceAbroad),
        }
      },
      async write(userId, taxYear, instance, field, value) {
        if (instance === null) return false
        const boolFields = ['domesticResidenceAllYear', 'registeredWithMeAllYear', 'childBenefitToMeAllYear', 'healthInsuranceAbroad']
        const parsedValue = boolFields.includes(field) ? (value === 'true' ? true : value === 'false' ? false : null) : value
        const updated = await child.update(userId, taxYear, instance, { [field]: parsedValue })
        return updated !== null
      },
    }
  }

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

  if (assessment) {
    // Any Bescheid value taken over, from whichever entry point, may be the first of an Eckjahr (ADR-0098 §4).
    const written = async (userId: string, taxYear: number, value: string | null) => {
      if (value !== null) await assessment.recordExternalYear(userId, taxYear)
      return true
    }
    access.assessment = {
      fields: ASSESSMENT_ACCESS_FIELDS,
      withInstance: false,
      async read(userId, taxYear) {
        const r = await assessment.findForUserAndYear(userId, taxYear)
        return {
          einnahmen: r?.fields.einnahmen ?? null,
          vorsorgeaufwand: r?.fields.vorsorgeaufwand ?? null,
          anrechnung: r?.fields.anrechnung ?? null,
          festgesetzteSteuer: r?.fields.festgesetzteSteuer ?? null,
          erstattung: r?.fields.erstattung ?? null,
          ...Object.fromEntries(ASSESSMENT_NEW_POSITION_IDS.map((id) => [id, r?.positions?.[id] ?? null])),
          assessmentDate: r?.assessmentDate ?? null,
          erlaeuterungen: r?.explanations ?? null,
        }
      },
      async write(userId, taxYear, _instance, field, value) {
        if (field === 'assessmentDate') {
          if (value !== null && !ISO_DATE_PATTERN.test(value)) {
            throw new InvalidInputError('BESCHEIDDATUM_INVALID', 'assessmentDate must be an ISO yyyy-mm-dd date.')
          }
          await assessment.setDate(userId, taxYear, value)
          return written(userId, taxYear, value)
        }
        if (field === 'erlaeuterungen') {
          const text = value === null ? null : value.trim()
          if (text !== null && text.length > MAX_EXPLANATIONS_LENGTH) {
            throw new InvalidInputError('FIELD_VALUE_INVALID', `"erlaeuterungen" must be at most ${MAX_EXPLANATIONS_LENGTH} characters.`)
          }
          await assessment.setExplanations(userId, taxYear, text === '' ? null : text)
          return written(userId, taxYear, text === '' ? null : text)
        }
        const original = (ASSESSMENT_FIELD_IDS as readonly string[]).includes(field)
        if (original || isAssessmentPositionId(field)) {
          if (value === null || value === 'unklar') {
            await assessment.setField(userId, taxYear, field as AssessmentField, value)
            return written(userId, taxYear, value)
          }
          const trimmed = value.trim()
          if (!INTEGER_RE.test(trimmed)) {
            throw new InvalidInputError('FIELD_VALUE_INVALID', `"${field}" requires a whole-euro integer or "unklar".`)
          }
          const n = Number(trimmed)
          const valid = original ? isValidAssessmentAmount(field as AssessmentField, n) : isAssessmentPositionId(field) && isValidAssessmentPositionAmount(field, n)
          if (!valid) {
            throw new InvalidInputError('FIELD_VALUE_INVALID', `"${field}" value "${value}" is out of allowed range.`)
          }
          await assessment.setField(userId, taxYear, field as AssessmentField, String(n))
          return written(userId, taxYear, String(n))
        }
        return false
      },
    }
  }

  if (booking) access.buchung = booking
  return access
}
