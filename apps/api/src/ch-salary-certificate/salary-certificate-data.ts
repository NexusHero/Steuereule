import {
  officialMonthlyRate,
  deserializeSalaryCertificateField,
  crossBorderStatus,
  actualRate,
  type Answers,
  type CrossBorderStatus,
  type SalaryCertificateValues,
  type ExchangeRate,
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
