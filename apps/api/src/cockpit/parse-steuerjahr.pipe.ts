import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'

const MIN_TAX_YEAR = 2000

/** `ParseIntPipe` alone only proves "parses as an integer" — it never validates against the actual storage type. */
@Injectable()
export class ParseTaxYearPipe implements PipeTransform<unknown, number> {
  transform(value: unknown): number {
    const parsed = Number(value)
    const maxTaxYear = new Date().getFullYear() + 1

    if (!Number.isInteger(parsed)) {
      throw new BadRequestException('jahr must be a plain integer tax year (e.g. 2026)')
    }
    if (parsed < MIN_TAX_YEAR || parsed > maxTaxYear) {
      throw new BadRequestException(`jahr must be between ${MIN_TAX_YEAR} and ${maxTaxYear}, got ${parsed}`)
    }

    return parsed
  }
}
