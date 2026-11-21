import { Inject, Injectable } from '@nestjs/common'
import { InvalidInputError } from '../common/domain-error.js'
import {
  EMPTY_CAPITAL,
  deserializeCapitalField,
  gatedIncomeTypes,
  mostFavourableCheckOnEstimate,
  isValidCapitalAmount,
  capitalAsCoreLineItem,
  capitalStatus,
  classifyCapitalDepot,
  serializeCapitalField,
  setCapitalField,
  type Answers,
  type CalculationStatus,
  type MostFavourableCheck as GuenstigerpruefungKern,
  mandatoryCapitalFields,
  type CapitalData,
  type CapitalFieldId,
  type CapitalFieldState,
  type CapitalDepotClassification,
  type ChurchTaxFactor,
  type Item,
  provenanceKey,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { PROVENANCE_REPOSITORY, type ProvenanceRepository } from '../marking/marking.repository.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { TAX_YEAR_REPOSITORY, type TaxYearRepository } from '../cockpit/tax-year.repository.js'
import { CAPITAL_REPOSITORY, type CapitalRecord, type CapitalRepository } from './capital.repository.js'
import type { PutCapitalFieldDto, CapitalFieldDto } from './dto/capital-field.dto.js'
import type { DepotClassificationDto, CapitalItemDto, CapitalResponseDto, CapitalStatusDto } from './dto/capital-response.dto.js'
import type { MostFavourableCheckDto, MostFavourableCheckSourceDto } from './dto/most-favourable-check-response.dto.js'
import type { UncertaintyDto } from '../filing-type-comparison/dto/filing-type-comparison-response.dto.js'
import { answersFrom } from '../interview/answers.js'
import { interviewOptions } from '../config/self-employment.js'
import type { TaxEstimateStatus } from '../tax-estimate/tax-estimate.service.js'

/**
 * The Cockpit estimate of the household (`TaxEstimateService.getState`). A token, because the estimate's
 * module imports this one for the capital records: CapitalModule resolves it lazily.
 */
export const HOUSEHOLD_ESTIMATE = Symbol('HOUSEHOLD_ESTIMATE')
export interface HouseholdEstimate {
  getState(userId: string, taxYear: number): Promise<TaxEstimateStatus>
}

function dataFromRecord(record: CapitalRecord | null): CapitalData {
  if (record === null) return EMPTY_CAPITAL
  return {
    kapitalertraege: deserializeCapitalField(record.kapitalertraege),
    sparerPauschbetrag: deserializeCapitalField(record.sparerPauschbetrag),
    kapitalertragsteuer: deserializeCapitalField(record.kapitalertragsteuer),
    solidaritaetszuschlag: deserializeCapitalField(record.solidaritaetszuschlag),
    kirchensteuer: deserializeCapitalField(record.kirchensteuer),
  }
}

function stateFromDto(dto: PutCapitalFieldDto): CapitalFieldState {
  if (dto.kind === 'offen') return { kind: 'offen' }
  if (dto.kind === 'unklar') return { kind: 'unklar' }
  if (dto.value === undefined || !isValidCapitalAmount(dto.value)) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', 'kind "erfasst" requires a non-negative integer `wert`.')
  }
  return { kind: 'erfasst', value: dto.value }
}

function toFieldDto(state: CapitalFieldState): CapitalFieldDto {
  switch (state.kind) {
    case 'offen':
      return { kind: 'offen' }
    case 'unklar':
      return { kind: 'unklar' }
    case 'erfasst':
      return { kind: 'erfasst', value: state.value }
  }
}

function depotZuDto(classification: CapitalDepotClassification): DepotClassificationDto {
  switch (classification.kind) {
    case 'deutscher-broker':
      return { kind: 'deutscher-broker' }
    case 'auslaendischer-broker':
      return { kind: 'auslaendischer-broker' }
    case 'krypto':
      return { kind: 'krypto' }
    case 'unbekannt':
      return { kind: 'unbekannt' }
  }
}

function itemToDto(items: Item): CapitalItemDto {
  const source = items.source
  return {
    id: items.id,
    amount: items.amount,
    provenance: source.kind === 'regel' ? source.rule : 'eingabe',
  }
}

function statusToDto(status: CalculationStatus): CapitalStatusDto {
  if (status.kind === 'bestimmt') {
    return { kind: 'bestimmt', einnahmen: status.einnahmen, vorsorgeaufwand: status.vorsorgeaufwand, anrechnung: status.anrechnung }
  }
  return {
    kind: 'offen',
    einnahmen: status.einnahmen,
    vorsorgeaufwand: status.vorsorgeaufwand,
    anrechnung: status.anrechnung,
    openItems: status.openItems,
    conflicts: status.conflicts,
    gated: [...status.gated],
  }
}

function mostFavourableCheckToDto(result: GuenstigerpruefungKern, estimateTreatment: 'abgeltung' | 'quelle'): MostFavourableCheckDto {
  const uncertainty: UncertaintyDto =
    result.uncertainty.kind === 'bestimmt'
      ? { kind: 'bestimmt', upperLimit: result.uncertainty.upperLimit }
      : { kind: 'unbestimmt', reason: result.uncertainty.reason }
  const provenance: MostFavourableCheckSourceDto = {
    kapitalertraege: result.provenance.kapitalertraege,
    remainingZvE: result.provenance.remainingZvE,
    saversAllowance: result.provenance.saversAllowance,
    assessmentType: result.provenance.assessmentType,
    components: [...result.provenance.components],
    ...(result.provenance.remainingZvEFrom === undefined ? {} : { remainingZvEFrom: result.provenance.remainingZvEFrom }),
  }
  switch (result.statement) {
    case 'eindeutig':
      return {
        kind: 'eindeutig',
        recommendation: result.recommendation,
        flatRateTax: result.flatRateTax,
        personal: result.personal,
        delta: result.delta,
        uncertainty,
        provenance,
        estimateTreatment,
      }
    case 'zu-knapp':
      return { kind: 'zu-knapp', flatRateTax: result.flatRateTax, personal: result.personal, delta: result.delta, uncertainty, provenance, estimateTreatment }
    case 'unbestimmt':
      return { kind: 'unbestimmt', flatRateTax: result.flatRateTax, personal: result.personal, delta: result.delta, uncertainty, provenance, estimateTreatment }
  }
}

/** Application logic for the Kapital guided mask + depot-Einordnung + the § 32d Abs. 6 Günstigerprüfung. */
@Injectable()
export class CapitalService {
  constructor(
    @Inject(CAPITAL_REPOSITORY) private readonly repository: CapitalRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
    @Inject(TAX_YEAR_REPOSITORY) private readonly taxYearRepository: TaxYearRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PROVENANCE_REPOSITORY) private readonly markings: ProvenanceRepository,
    @Inject(HOUSEHOLD_ESTIMATE) private readonly estimates: HouseholdEstimate,
  ) {}

  private async answers(userId: string, taxYear: number): Promise<Answers> {
    const rows = await this.interviewRepository.findAllForUserAndYear(userId, taxYear)
    return answersFrom(rows)
  }

  private async toResponse(userId: string, taxYear: number, record: CapitalRecord | null): Promise<CapitalResponseDto> {
    const data = dataFromRecord(record)
    const answers = await this.answers(userId, taxYear)
    const gated = gatedIncomeTypes(answers, interviewOptions())
    const depot = classifyCapitalDepot(answers['kap-depot'])

    const coreItems = capitalAsCoreLineItem(data)
    const items: CapitalItemDto[] = coreItems === null ? [] : [itemToDto(coreItems)]
    const status = capitalStatus(data, gated)

    return {
      kapitalertraege: toFieldDto(data.kapitalertraege),
      sparerPauschbetrag: toFieldDto(data.sparerPauschbetrag),
      kapitalertragsteuer: toFieldDto(data.kapitalertragsteuer),
      solidaritaetszuschlag: toFieldDto(data.solidaritaetszuschlag),
      kirchensteuer: toFieldDto(data.kirchensteuer),
      requiredFields: [...mandatoryCapitalFields(depot.kind)],
      depot: depotZuDto(depot),
      items,
      status: statusToDto(status),
      inhaber: record?.inhaber ?? null,
    }
  }

  async getState(userId: string, taxYear: number): Promise<CapitalResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, taxYear)
    if (record !== null) {
      await this.auditService.append({ userId, action: 'READ', resource: 'kapital' })
    }
    return this.toResponse(userId, taxYear, record)
  }

  async setField(userId: string, taxYear: number, field: CapitalFieldId, dto: PutCapitalFieldDto): Promise<CapitalResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, taxYear)
    const data = dataFromRecord(record)
    const state = stateFromDto(dto)
    setCapitalField(data, field, state)
    const next = await this.repository.setField(userId, taxYear, field, serializeCapitalField(state))
    await this.markings.remove(userId, taxYear, [provenanceKey('kapital', field)])
    return this.toResponse(userId, taxYear, next)
  }

  async setOwner(userId: string, taxYear: number, inhaber: 'A' | 'B' | 'gemeinsam'): Promise<CapitalResponseDto> {
    const next = await this.repository.setOwner(userId, taxYear, inhaber)
    return this.toResponse(userId, taxYear, next)
  }

  async getMostFavourableCheck(
    userId: string,
    taxYear: number,
    churchTaxFactor: ChurchTaxFactor,
  ): Promise<MostFavourableCheckDto | null> {
    const record = await this.taxYearRepository.findByUserAndYear(userId, taxYear)
    if (!record) return null

    const [capitalRecord, interviewRows] = await Promise.all([
      this.repository.findForUserAndYear(userId, taxYear),
      this.interviewRepository.findAllForUserAndYear(userId, taxYear),
    ])

    const answers = answersFrom(interviewRows)
    const depot = classifyCapitalDepot(answers['kap-depot'])
    const data = dataFromRecord(capitalRecord)

    if (depot.kind === 'auslaendischer-broker') {
      return { kind: 'nicht-anwendbar', reason: 'keine-abgeltung-einbehalten' }
    }
    if (depot.kind === 'krypto') {
      return { kind: 'nicht-anwendbar', reason: 'krypto-gegated' }
    }
    if (depot.kind === 'unbekannt') {
      return { kind: 'nicht-anwendbar', reason: 'kap-depot-nicht-beantwortet' }
    }
    if (data.kapitalertraege.kind !== 'erfasst') {
      return { kind: 'nicht-anwendbar', reason: 'keine-kapitalertraege' }
    }

    // The other income is the household's as the Cockpit estimates it: a couple's joint taxable income,
    // a Swiss wage, a pension — with its tariff and its § 32b income. Without an estimate, no number.
    const estimate = await this.estimates.getState(userId, taxYear)
    if (estimate.kind === 'offen') return { kind: 'nicht-anwendbar', reason: 'schaetzung-offen', missing: [...estimate.missing] }
    if (estimate.kind === 'nicht-moeglich') return { kind: 'nicht-anwendbar', reason: 'schaetzung-nicht-moeglich', estimateReason: estimate.reason }

    const joint = estimate.jointAssessment === true
    const result = mostFavourableCheckOnEstimate({
      kapitalertraege: data.kapitalertraege.value,
      year: taxYear,
      assessmentType: joint ? 'zusammen' : 'einzel',
      taxableIncome: estimate.taxableIncome,
      progressionIncomeEur: estimate.breakdown?.progressionIncomeEur ?? 0,
      churchTaxFactor,
    })
    // The couple's estimate taxes the capital income at the flat rate; a single person's leaves the
    // withheld flat tax as final. Neither applies the cheaper tariff (§ 32d Abs. 6 is on application).
    return mostFavourableCheckToDto(result, joint ? 'abgeltung' : 'quelle')
  }
}
