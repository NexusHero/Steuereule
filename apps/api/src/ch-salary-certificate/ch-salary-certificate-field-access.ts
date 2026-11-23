import { SALARY_CERTIFICATE_AMOUNT_FIELDS, type SalaryCertificateAmountFieldId } from '@steuereule/core'
import { InvalidInputError } from '../common/domain-error.js'
import type { ScreenAccess } from '../common/screen-access.js'
import { N_GRE_BOOLEAN_FIELDS, type CrossBorderSalaryStatementRepository, type NGreDetails } from './ch-salary-certificate.repository.js'

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
type ExchangeRateField = (typeof EXCHANGE_RATE_FIELDS)[number]
const YEAR_OR_MONTH_RE = /^\d{4}(-(0[1-9]|1[0-2]))?$/
export const CH_SALARY_ACCESS_FIELDS = [
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

const isOneOf = (fields: readonly string[], field: string): boolean => fields.includes(field)

/**
 * Stores one half of the exchange rate next to the other. The mode follows the period: a year is the
 * annual average (Anlage N-Gre), a month the BMF monthly rate. A rate with a receipt ("tatsächlich")
 * is the mask's, the owl does not set it.
 */
async function storeExchangeRate(repository: CrossBorderSalaryStatementRepository, userId: string, taxYear: number, field: ExchangeRateField, value: string | null): Promise<void> {
  const current = await repository.findForUserAndYear(userId, taxYear)
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
  await repository.setExchangeRate(userId, taxYear, { month, rate, mode })
}

function parseBoolean(value: string | null): boolean | null {
  if (value !== null && value !== 'true' && value !== 'false') {
    throw new InvalidInputError('FIELD_VALUE_INVALID', `"${value}" is not "true" or "false".`)
  }
  return value === null ? null : value === 'true'
}

/** The confirmation path's view of the screen `chLohnausweis` (ADR-0066): the Swiss certificate and the Anlage N-Gre. */
export function chSalaryCertificateFieldAccess(repository: CrossBorderSalaryStatementRepository): ScreenAccess {
  return {
    fields: CH_SALARY_ACCESS_FIELDS,
    withInstance: false,
    async read(userId, taxYear) {
      const r = await repository.findForUserAndYear(userId, taxYear)
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
      if (isOneOf(SALARY_CERTIFICATE_AMOUNT_FIELDS, field)) {
        await repository.setField(userId, taxYear, field as SalaryCertificateAmountFieldId, value)
      } else if (field === 'bemerkungen') {
        await repository.setRemarks(userId, taxYear, value)
      } else if (isOneOf(EXCHANGE_RATE_FIELDS, field)) {
        await storeExchangeRate(repository, userId, taxYear, field as ExchangeRateField, value)
      } else if (field === 'saeule3aChf' || field === 'krankenkasseChf') {
        await repository.setProvision(userId, taxYear, { [field]: value })
      } else if (isOneOf(NGRE_FIELDS, field)) {
        await repository.setNGre(userId, taxYear, { [field]: value })
      } else if (isOneOf(N_GRE_BOOLEAN_FIELDS, field)) {
        await repository.setNGre(userId, taxYear, { [field]: parseBoolean(value) })
      } else {
        return false
      }
      return true
    },
  }
}
