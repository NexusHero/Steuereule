import { EMPTY_WAGE_TAX_CERTIFICATE, deserializeWageTaxCertificateField, type WageTaxCertificateData } from '@steuereule/core'
import type { WageTaxCertificateRecord } from './lstb.repository.js'

export function wageTaxCertificateDataFrom(record: WageTaxCertificateRecord | null): WageTaxCertificateData {
  if (record === null) return EMPTY_WAGE_TAX_CERTIFICATE ?? EMPTY_WAGE_TAX_CERTIFICATE
  return {
    bruttoarbeitslohn: deserializeWageTaxCertificateField(record.bruttoarbeitslohn),
    lohnsteuer: deserializeWageTaxCertificateField(record.lohnsteuer),
    sozialversicherung: deserializeWageTaxCertificateField(record.sozialversicherung),
  }
}
