import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import { WAGE_TAX_CERTIFICATE_FIELDS, type WageTaxCertificateFieldId } from '@steuereule/core'

@Injectable()
export class ParseLstbFieldPipe implements PipeTransform<unknown, WageTaxCertificateFieldId> {
  transform(value: unknown): WageTaxCertificateFieldId {
    if (typeof value !== 'string' || !(WAGE_TAX_CERTIFICATE_FIELDS as readonly string[]).includes(value)) {
      throw new BadRequestException(`feld must be one of: ${WAGE_TAX_CERTIFICATE_FIELDS.join(', ')}`)
    }
    return value as WageTaxCertificateFieldId
  }
}
