import {
  officialMonthlyRate,
  annualAverageRate,
  deserializeSalaryCertificateField,
  crossBorderStatus,
  actualRate,
  type Answers,
  type CrossBorderStatus,
  type SalaryCertificateValues,
  type ExchangeRate,
  type NGreInput,
} from '@steuereule/core'
import type { CrossBorderSalaryStatementRecord } from './ch-salary-certificate.repository.js'

export function salaryCertificateValuesFromRecord(record: CrossBorderSalaryStatementRecord | null): SalaryCertificateValues {
  const values: SalaryCertificateValues = {}
  if (record === null) return values
  for (const [fieldId, stored] of Object.entries(record.fields)) {
    const value = deserializeSalaryCertificateField(stored)
    if (typeof value === 'number') values[fieldId as keyof SalaryCertificateValues] = value
  }
  return values
}

export function exchangeRateFromRecord(record: CrossBorderSalaryStatementRecord | null): ExchangeRate | null {
  if (record === null || record.exchangeRateMonth === null || record.exchangeRateValue === null || record.exchangeRateMode === null) {
    return null
  }
  if (record.exchangeRateMode === 'amtlich') return officialMonthlyRate(record.exchangeRateMonth, record.exchangeRateValue)
  if (record.exchangeRateMode === 'jahresdurchschnitt') return annualAverageRate(record.exchangeRateMonth, record.exchangeRateValue)
  if (record.exchangeRateReceiptId === null) return null
  return actualRate(record.exchangeRateMonth, record.exchangeRateValue, record.exchangeRateReceiptId)
}

export function crossBorderStatusFromAnswers(answers: Answers): CrossBorderStatus | null {
  const residence = answers['ch-wohnsitz']
  if (residence !== 'Deutschland' && residence !== 'Schweiz') return null
  const daysStr = answers['ch-nichtrueckkehrtage']
  if (daysStr === undefined) return null
  const days = Number(daysStr)
  if (!Number.isInteger(days)) return null
  return crossBorderStatus(residence, days)
}

function optionalAmount(value: string | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : Number(value)
}

/** The Anlage-N-Gre input from what is stored — one place for the estimate and every other reader. */
export function nGreInputFromRecord(record: CrossBorderSalaryStatementRecord, rate: ExchangeRate): NGreInput {
  const values = salaryCertificateValuesFromRecord(record)
  const n = record.nGre
  return {
    grossWageChf: values['bruttolohn-total'] ?? 0,
    familienzulagenChf: Number(n.familienzulagenChf ?? 0),
    ahvContributionsChf: values['ahv-beitraege'] ?? 0,
    withholdingTaxChf: values.quellensteuer ?? 0,
    krankentaggeldChf: Number(n.krankentaggeldChf ?? 0),
    pkArbeitnehmerChf: Number(n.pkArbeitnehmerChf ?? 0),
    pkArbeitgeberChf: Number(n.pkArbeitgeberChf ?? 0),
    pkArbeitnehmerGesamtChf: values['berufliche-vorsorge'],
    pkArbeitgeberGesamtChf: optionalAmount(n.pkArbeitgeberGesamtChf),
    steuerfreiesKrankentaggeldChf: optionalAmount(n.steuerfreiesKrankentaggeldChf),
    krankentaggeldArbeitgeberProzent: optionalAmount(n.krankentaggeldArbeitgeberProzent),
    krankentaggeldArbeitgeberChf: optionalAmount(n.krankentaggeldArbeitgeberChf),
    nbuvArbeitgeberProzent: optionalAmount(n.nbuvArbeitgeberProzent),
    nbuvArbeitgeberChf: optionalAmount(n.nbuvArbeitgeberChf),
    rate: rate.rate,
  }
}
