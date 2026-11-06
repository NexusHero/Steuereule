import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import { SALARY_CERTIFICATE_AMOUNT_FIELDS, type SalaryCertificateAmountFieldId } from '@steuereule/core'

@Injectable()
export class ParseSalaryCertificateFieldPipe implements PipeTransform<unknown, SalaryCertificateAmountFieldId> {
  transform(value: unknown): SalaryCertificateAmountFieldId {
    if (typeof value !== 'string' || !(SALARY_CERTIFICATE_AMOUNT_FIELDS as readonly string[]).includes(value)) {
      throw new BadRequestException(`feld must be one of: ${SALARY_CERTIFICATE_AMOUNT_FIELDS.join(', ')}`)
    }
    return value as SalaryCertificateAmountFieldId
  }
}
