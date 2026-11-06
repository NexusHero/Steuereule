import { Inject, Injectable } from '@nestjs/common'
import { ConflictError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { WAGE_TAX_CERTIFICATE_FIELDS, PENSION_FIELDS, RENTAL_FIELDS, provenanceKey, type Provenance, type Screen } from '@steuereule/core'
import { ConfirmationService } from '../bestaetigung/bestaetigung.service.js'
import { CAPITAL_REPOSITORY, type CapitalRepository } from '../kapital/kapital.repository.js'
import { PROVENANCE_REPOSITORY, type ProvenanceRecord, type ProvenanceRepository } from '../kennzeichnung/kennzeichnung.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { PENSION_REPOSITORY, type PensionRepository } from '../rente/rente.repository.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../vermietung/vermietung.repository.js'
import { TAX_YEAR_ROLLOVER_REPOSITORY, type TaxYearRolloverRepository } from './jahresuebernahme.repository.js'
import type { RolloverResponseDto } from './dto/uebernahme-response.dto.js'

export const MAX_PAST_YEARS = 4

function fromTakeover(r: ProvenanceRecord): boolean {
  return r.provenance.kind === 'uebernahme' || r.proposal?.provenance.kind === 'uebernahme'
}

/** Application logic for the Jahresübernahme. */
@Injectable()
export class TakeoverService {
  constructor(
    @Inject(PROVENANCE_REPOSITORY) private readonly repository: ProvenanceRepository,
    @Inject(ConfirmationService) private readonly confirmation: ConfirmationService,
    @Inject(WAGE_TAX_CERTIFICATE_REPOSITORY) private readonly lstbRepository: WageTaxCertificateRepository,
    @Inject(PENSION_REPOSITORY) private readonly pensionRepository: PensionRepository,
    @Inject(CAPITAL_REPOSITORY) private readonly capitalRepository: CapitalRepository,
    @Inject(RENTAL_REPOSITORY) private readonly rentalRepository: RentalRepository,
    @Inject(TAX_YEAR_ROLLOVER_REPOSITORY) private readonly yearTakeoverRepository: TaxYearRolloverRepository,
  ) {}

  private async markings(userId: string, taxYear: number): Promise<RolloverResponseDto> {
    const records = await this.repository.listForUserAndYears(userId, [taxYear])
    return {
      markings: records.flatMap((r) =>
        r.provenance.kind === 'uebernahme' ? [{ itemKey: r.key, lastYear: r.provenance.lastYear, confirmed: r.confirmed }] : [],
      ),
    }
  }

  async getState(userId: string, taxYear: number): Promise<RolloverResponseDto> {
    return this.markings(userId, taxYear)
  }

  async takeOver(userId: string, taxYear: number, lastYear: number): Promise<RolloverResponseDto> {
    if (!Number.isInteger(lastYear) || lastYear < 1 || lastYear >= taxYear) {
      throw new InvalidInputError('VORJAHR_INVALID', 'von must be a whole year strictly before the target year.')
    }
    if (lastYear < taxYear - MAX_PAST_YEARS) {
      throw new InvalidInputError('VORJAHR_TOO_FAR_BACK', `von is more than ${MAX_PAST_YEARS} years back — at most 4 previous years are supported.`)
    }
    const [alreadyTakenOver, existing] = await Promise.all([
      this.yearTakeoverRepository.findForUserAndYear(userId, taxYear),
      this.repository.listForUserAndYears(userId, [taxYear]),
    ])
    if (alreadyTakenOver !== null || existing.some(fromTakeover)) {
      throw new ConflictError('ALREADY_TAKEN_OVER', 'This tax year was already taken over.')
    }

    const [lstbSource, pensionSource, capitalSource, rentalSources] = await Promise.all([
      this.lstbRepository.findForUserAndYear(userId, lastYear),
      this.pensionRepository.findForUserAndYear(userId, lastYear),
      this.capitalRepository.findForUserAndYear(userId, lastYear),
      this.rentalRepository.listForUserAndYear(userId, lastYear),
    ])
    if (lstbSource === null && pensionSource === null && capitalSource === null && rentalSources.length === 0) {
      throw new NotFoundError('NOTHING_TO_TAKE_OVER', `Nothing to take over from ${lastYear} — no LStB, Rente, Kapital or Vermietung exists.`)
    }

    const provenance: Provenance = { kind: 'uebernahme', lastYear }
    const copy = async <F extends string>(screen: Screen, fields: readonly F[], source: Readonly<Record<F, string | null>>, instance?: string) => {
      for (const field of fields) {
        await this.confirmation.write(userId, taxYear, provenanceKey(screen, field, instance), source[field], provenance)
      }
    }
    if (lstbSource !== null) await copy('lstb', WAGE_TAX_CERTIFICATE_FIELDS, lstbSource)
    if (pensionSource !== null) await copy('rente', ['rentenart' as const, ...PENSION_FIELDS], pensionSource)
    if (capitalSource !== null) await copy('kapital', ['kapitalertraege' as const], capitalSource)
    for (const property of rentalSources) {
      const copied = await this.rentalRepository.create(userId, taxYear)
      await copy('vermietung', RENTAL_FIELDS, property, copied.id)
    }

    await this.yearTakeoverRepository.record(userId, taxYear, lastYear)

    return this.markings(userId, taxYear)
  }
}
