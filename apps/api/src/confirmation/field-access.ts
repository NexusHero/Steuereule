import {
  ASSESSMENT_FIELD_IDS,
  CAPITAL_FIELDS,
  WAGE_TAX_CERTIFICATE_FIELDS,
  PENSION_FIELDS,
  RENTAL_FIELDS,
  SALARY_CERTIFICATE_AMOUNT_FIELDS,
  QUESTIONS,
  calculateWorkdays,
  isValidAnswer,
  isValidAssessmentAmount,
  serializeAssessmentField,
  type AssessmentField,
  type EntryStepId,
  type CapitalFieldId,
  type IsoWeekday,
  type WageTaxCertificateFieldId,
  type Screen,
  type PensionFieldId,
  type RentalFieldId,
  type SalaryCertificateAmountFieldId,
} from '@steuereule/core'
import { InvalidInputError } from '../common/domain-error.js'
import type { AssessmentRepository } from '../assessment/assessment.repository.js'
import type { CapitalRepository } from '../capital/capital.repository.js'
import { MEANS_OF_TRANSPORT, type CommuteInputs, type CommuteRepository, type MeansOfTransport } from '../commute/commute.repository.js'
import type { WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import type { PensionRepository } from '../pension/pension.repository.js'
import type { RentalRepository } from '../rental/rental.repository.js'
import type { ProfileRepository } from '../profile/profile.repository.js'
import { MASTER_DATA_FIELDS, type MasterDataField, type MasterDataRepository } from '../master-data/master-data.repository.js'
import type { PartnerCouplingRepository } from '../link/link.repository.js'
import type { InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import type { CrossBorderSalaryStatementRepository, NGreDetails } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import type { ChildRepository } from '../children/child.repository.js'

export interface ScreenAccess {
  readonly fields: readonly string[]
  readonly withInstance: boolean
  read(userId: string, taxYear: number, instance: string | null): Promise<Readonly<Record<string, string | null>> | null>
  write(userId: string, taxYear: number, instance: string | null, field: string, value: string | null): Promise<boolean>
}

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
}

const COMMUTE_ACCESS_FIELDS = [
  'workdays',
  'vacationDays',
  'sickDays',
  'homeOfficeDays',
  'oneWayKm',
  'transport',
  'publicHolidays',
  'publicHolidayRegion',
] as const
const ASSESSMENT_ACCESS_FIELDS = [...ASSESSMENT_FIELD_IDS, 'assessmentDate'] as const
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const INTEGER_RE = /^-?\d+$/

const PENSION_ACCESS_FIELDS = ['rentenart', ...PENSION_FIELDS] as const
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
  'krankentaggeldArbeitgeberProzent',
  'krankentaggeldArbeitgeberChf',
  'nbuvArbeitgeberProzent',
  'nbuvArbeitgeberChf',
]
const CH_SALARY_ACCESS_FIELDS = [
  ...SALARY_CERTIFICATE_AMOUNT_FIELDS,
  'bemerkungen',
  'saeule3aChf',
  'krankenkasseChf',
  ...NGRE_FIELDS,
] as const
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
] as const

/**
 * Every field a screen can take through the confirmation path, without touching a repository.
 * The same lists `fieldAccessFrom` serves; whoever proposes a write (the owl, a receipt) can check
 * a name against them before a draft exists that could never be applied.
 */
export const WRITABLE_FIELDS_BY_SCREEN: Readonly<Record<Screen, readonly string[]>> = {
  lstb: WAGE_TAX_CERTIFICATE_FIELDS,
  rente: PENSION_ACCESS_FIELDS,
  kapital: CAPITAL_FIELDS,
  vermietung: RENTAL_FIELDS,
  profil: PROFILE_ACCESS_FIELDS,
  stammdaten: MASTER_DATA_FIELDS,
  kopplung: LINK_ACCESS_FIELDS,
  interview: INTERVIEW_ACCESS_FIELDS,
  chLohnausweis: CH_SALARY_ACCESS_FIELDS,
  kind: CHILD_ACCESS_FIELDS,
  commute: COMMUTE_ACCESS_FIELDS,
  assessment: ASSESSMENT_ACCESS_FIELDS,
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
}: FieldAccessRepositories): FieldAccess {
  const access: Partial<Record<Screen, ScreenAccess>> = {
    lstb: {
      fields: WAGE_TAX_CERTIFICATE_FIELDS,
      withInstance: false,
      async read(userId, taxYear) {
        const r = await lstb.findForUserAndYear(userId, taxYear)
        return { bruttoarbeitslohn: r?.bruttoarbeitslohn ?? null, lohnsteuer: r?.lohnsteuer ?? null, sozialversicherung: r?.sozialversicherung ?? null }
      },
      async write(userId, taxYear, _instance, field, value) {
        await lstb.setField(userId, taxYear, field as WageTaxCertificateFieldId, value)
        return true
      },
    },
    rente: {
      fields: PENSION_ACCESS_FIELDS,
      withInstance: false,
      async read(userId, taxYear) {
        const r = await pension.findForUserAndYear(userId, taxYear)
        return {
          rentenart: r?.rentenart ?? null,
          jahresbetrag: r?.jahresbetrag ?? null,
          rentenbeginnJahr: r?.rentenbeginnJahr ?? null,
          alterBeiRentenbeginn: r?.alterBeiRentenbeginn ?? null,
        }
      },
      async write(userId, taxYear, _instance, field, value) {
        if (field === 'rentenart') await pension.setPensionKind(userId, taxYear, value)
        else await pension.setField(userId, taxYear, field as PensionFieldId, value)
        return true
      },
    },
    kapital: {
      fields: CAPITAL_FIELDS,
      withInstance: false,
      async read(userId, taxYear) {
        const r = await capital.findForUserAndYear(userId, taxYear)
        return Object.fromEntries(CAPITAL_FIELDS.map((f) => [f, r?.[f] ?? null]))
      },
      async write(userId, taxYear, _instance, field, value) {
        await capital.setField(userId, taxYear, field as CapitalFieldId, value)
        return true
      },
    },
    vermietung: {
      fields: RENTAL_FIELDS,
      withInstance: true,
      async read(userId, taxYear, instance) {
        const property = (await rental.listForUserAndYear(userId, taxYear)).find((o) => o.id === instance)
        if (property === undefined) return null
        return Object.fromEntries(RENTAL_FIELDS.map((f) => [f, property[f]]))
      },
      async write(userId, taxYear, instance, field, value) {
        if (instance === null) return false
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
          firstName: p?.firstName ?? null,
          lastName: p?.lastName ?? null,
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
      fields: MASTER_DATA_FIELDS,
      withInstance: false,
      async read(userId) {
        const m = await masterData.findByUserId(userId)
        return Object.fromEntries(MASTER_DATA_FIELDS.map((f) => [f, m?.[f] ?? null]))
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
        await masterData.save(userId, {
          ...current,
          [field as MasterDataField]: value,
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
        if (field === 'saeule3aChf' || field === 'krankenkasseChf') {
          const current = await chSalaryCertificate.findForUserAndYear(userId, taxYear)
          await chSalaryCertificate.setProvision(
            userId,
            taxYear,
            field === 'saeule3aChf' ? value : current?.saeule3aChf ?? null,
            field === 'krankenkasseChf' ? value : current?.krankenkasseChf ?? null,
          )
          return true
        }
        if ((NGRE_FIELDS as readonly string[]).includes(field)) {
          await chSalaryCertificate.setNGre(userId, taxYear, { [field]: value })
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
        }
      },
      async write(userId, taxYear, instance, field, value) {
        if (instance === null) return false
        const boolFields = ['domesticResidenceAllYear', 'registeredWithMeAllYear', 'childBenefitToMeAllYear']
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
          default:
            return false
        }

        const workdaysRes = calculateWorkdays({
          year: taxYear,
          workdays: updated.workdays,
          vacationDays: updated.vacationDays,
          sickDays: updated.sickDays,
          homeOfficeDays: updated.homeOfficeDays,
          publicHolidays: updated.publicHolidays ?? 0,
        })
        if (workdaysRes.kind === 'widerspruch') {
          throw new InvalidInputError(
            'ARBEITSTAGE_WIDERSPRUCH',
            `The days off exceed the working days (${workdaysRes.conflict.kind}).`,
          )
        }

        await commute.save(userId, taxYear, updated)
        return true
      },
    }
  }

  if (assessment) {
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
          assessmentDate: r?.assessmentDate ?? null,
        }
      },
      async write(userId, taxYear, _instance, field, value) {
        if (field === 'assessmentDate') {
          if (value !== null && !ISO_DATE_RE.test(value)) {
            throw new InvalidInputError('BESCHEIDDATUM_INVALID', 'assessmentDate must be an ISO yyyy-mm-dd date.')
          }
          await assessment.setDate(userId, taxYear, value)
          return true
        }
        if ((ASSESSMENT_FIELD_IDS as readonly string[]).includes(field)) {
          const typedField = field as AssessmentField
          if (value === null || value === 'unklar') {
            await assessment.setField(userId, taxYear, typedField, value)
            return true
          }
          const trimmed = value.trim()
          if (!INTEGER_RE.test(trimmed)) {
            throw new InvalidInputError('FIELD_VALUE_INVALID', `"${field}" requires a whole-euro integer or "unklar".`)
          }
          const n = Number(trimmed)
          if (!isValidAssessmentAmount(typedField, n)) {
            throw new InvalidInputError('FIELD_VALUE_INVALID', `"${field}" value "${value}" is out of allowed range.`)
          }
          await assessment.setField(userId, taxYear, typedField, serializeAssessmentField(typedField, n))
          return true
        }
        return false
      },
    }
  }

  return access
}
