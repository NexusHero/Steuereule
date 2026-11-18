import {
  annexNGreAmounts,
  deserializeWageTaxCertificateField,
  wageTaxCertificateStatus,
  type WageFacts,
  type WorkExpenseParts,
} from '@steuereule/core'
import type { CrossBorderSalaryStatementRepository } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { exchangeRateFromRecord, nGreInputFromRecord } from '../ch-salary-certificate/salary-certificate-data.js'
import type { CommuteInputs } from '../commute/commute.repository.js'
import { answersFrom } from '../interview/answers.js'
import type { InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { wageTaxCertificateDataFrom } from '../lstb/lstb-data.js'
import type { WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { workExpenseParts } from '../tax-estimate/tax-estimate.service.js'

// The facts of one person and year as the Verlauf and the Abgabe both read them (ADR-0098): one
// reading, so the version frozen at submission and the Verlauf's „heute erklärt“ cannot drift apart.

type LstbRecord = Awaited<ReturnType<WageTaxCertificateRepository['findForUserAndYear']>>
type ChRecord = Awaited<ReturnType<CrossBorderSalaryStatementRepository['findForUserAndYear']>>
type InterviewRows = Awaited<ReturnType<InterviewAnswerRepository['findAllForUserAndYear']>>

/** The LStB when it is complete, else the Swiss Lohnausweis at the year's rate (ADR-0042); null otherwise. */
export function wageFacts(lstbRecord: LstbRecord, chRecord: ChRecord): WageFacts | null {
  if (lstbRecord !== null) {
    const state = wageTaxCertificateStatus(wageTaxCertificateDataFrom(lstbRecord))
    if (state.kind === 'vollstaendig') {
      const amount = (v: string | null | undefined) => {
        const f = deserializeWageTaxCertificateField(v ?? null)
        return f.kind === 'erfasst' ? f.value : 0
      }
      const soli = lstbRecord.solidaritaetszuschlag && /^\d+(\.\d{1,2})?$/.test(lstbRecord.solidaritaetszuschlag) ? Math.round(Number(lstbRecord.solidaritaetszuschlag)) : 0
      return {
        gross: state.bruttoarbeitslohn,
        wageTax: state.lohnsteuer,
        solidaritaetszuschlag: soli,
        churchTax: amount(lstbRecord.kirchensteuer) + amount(lstbRecord.kirchensteuerEhegatte),
        socialSecurity: state.sozialversicherung,
        source: 'lohnsteuerbescheinigung',
        exchangeRate: null,
      }
    }
  }
  const rate = exchangeRateFromRecord(chRecord)
  if (chRecord === null || rate === null) return null
  const rows = annexNGreAmounts(nGreInputFromRecord(chRecord, rate)).eur
  return {
    gross: rows.z23,
    wageTax: rows.z25,
    solidaritaetszuschlag: 0,
    churchTax: 0,
    socialSecurity: rows.z82 + rows.z85,
    source: 'lohnausweis',
    exchangeRate: { rate: rate.rate, period: rate.month },
  }
}

/** The Werbungskosten parts today's answers claim; null when nothing is entered or the core cannot read it. */
export function todaysWorkExpenses(year: number, path: CommuteInputs | null, rows: InterviewRows): WorkExpenseParts | null {
  if (path === null && rows.length === 0) return null
  try {
    return workExpenseParts(year, path, answersFrom(rows))
  } catch {
    return null
  }
}
