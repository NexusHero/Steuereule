import { Inject, Injectable } from '@nestjs/common'
import { InvalidInputError } from '../common/domain-error.js'
import {
  LEERES_KAPITAL,
  angestellteAusDaten,
  deserialisiereKapitalFeld,
  gatedEinkunftsarten,
  guenstigerpruefung,
  istGueltigerKapitalBetrag,
  kapitalAlsKernposten,
  kapitalStand,
  ordneKapDepotEin,
  progressionsvorbehaltAus,
  serialisiereKapitalFeld,
  setzeKapitalFeld,
  type Answers,
  type Berechnungsstand,
  type Guenstigerpruefung as GuenstigerpruefungKern,
  kapitalPflichtfelder,
  type KapitalDaten,
  type KapitalFeldId,
  type KapitalFeldZustand,
  type KapitalDepotEinordnung,
  type KirchensteuerFaktor,
  type Posten,
  kennzeichnungsKey,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { KENNZEICHNUNG_REPOSITORY, type KennzeichnungRepository } from '../kennzeichnung/kennzeichnung.repository.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { LSTB_REPOSITORY, type LstbRepository } from '../lstb/lstb.repository.js'
import { TAX_YEAR_REPOSITORY, type TaxYearRepository } from '../cockpit/tax-year.repository.js'
import { KAPITAL_REPOSITORY, type KapitalRecord, type KapitalRepository } from './kapital.repository.js'
import type { PutKapitalFeldDto, KapitalFeldDto } from './dto/kapital-feld.dto.js'
import type { DepotEinordnungDto, KapitalPostenDto, KapitalResponseDto, KapitalStandDto } from './dto/kapital-response.dto.js'
import type { GuenstigerpruefungDto, GuenstigerpruefungHerkunftDto } from './dto/guenstigerpruefung-response.dto.js'
import type { UnschaerfeDto } from '../veranlagungsartenvergleich/dto/veranlagungsartenvergleich-response.dto.js'
import { answersAus } from '../interview/answers.js'
import { lstbDatenAus } from '../lstb/lstb-daten.js'

function datenAusRecord(record: KapitalRecord | null): KapitalDaten {
  if (record === null) return LEERES_KAPITAL
  return {
    kapitalertraege: deserialisiereKapitalFeld(record.kapitalertraege),
    sparerPauschbetrag: deserialisiereKapitalFeld(record.sparerPauschbetrag),
    kapitalertragsteuer: deserialisiereKapitalFeld(record.kapitalertragsteuer),
    solidaritaetszuschlag: deserialisiereKapitalFeld(record.solidaritaetszuschlag),
    kirchensteuer: deserialisiereKapitalFeld(record.kirchensteuer),
  }
}

function zustandAusDto(dto: PutKapitalFeldDto): KapitalFeldZustand {
  if (dto.kind === 'offen') return { kind: 'offen' }
  if (dto.kind === 'unklar') return { kind: 'unklar' }
  if (dto.wert === undefined || !istGueltigerKapitalBetrag(dto.wert)) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', 'kind "erfasst" requires a non-negative integer `wert`.')
  }
  return { kind: 'erfasst', wert: dto.wert }
}

function toFeldDto(zustand: KapitalFeldZustand): KapitalFeldDto {
  switch (zustand.kind) {
    case 'offen':
      return { kind: 'offen' }
    case 'unklar':
      return { kind: 'unklar' }
    case 'erfasst':
      return { kind: 'erfasst', wert: zustand.wert }
  }
}

function depotZuDto(einordnung: KapitalDepotEinordnung): DepotEinordnungDto {
  switch (einordnung.kind) {
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

function postenZuDto(posten: Posten): KapitalPostenDto {
  const quelle = posten.quelle
  return {
    id: posten.id,
    betrag: posten.betrag,
    herkunft: quelle.art === 'regel' ? quelle.regel : 'eingabe',
  }
}

function standZuDto(stand: Berechnungsstand): KapitalStandDto {
  if (stand.kind === 'bestimmt') {
    return { kind: 'bestimmt', einnahmen: stand.einnahmen, vorsorgeaufwand: stand.vorsorgeaufwand, anrechnung: stand.anrechnung }
  }
  return {
    kind: 'offen',
    einnahmen: stand.einnahmen,
    vorsorgeaufwand: stand.vorsorgeaufwand,
    anrechnung: stand.anrechnung,
    offenePosten: stand.offenePosten,
    konflikte: stand.konflikte,
    gegated: [...stand.gegated],
  }
}

function guenstigerpruefungZuDto(ergebnis: GuenstigerpruefungKern): GuenstigerpruefungDto {
  const unschaerfe: UnschaerfeDto =
    ergebnis.unschaerfe.kind === 'bestimmt'
      ? { kind: 'bestimmt', obergrenze: ergebnis.unschaerfe.obergrenze }
      : { kind: 'unbestimmt', grund: ergebnis.unschaerfe.grund }
  const herkunft: GuenstigerpruefungHerkunftDto = {
    kapitalertraege: ergebnis.herkunft.kapitalertraege,
    uebrigesZvE: ergebnis.herkunft.uebrigesZvE,
    sparerpauschbetrag: ergebnis.herkunft.sparerpauschbetrag,
    veranlagung: ergebnis.herkunft.veranlagung,
    bestandteile: [...ergebnis.herkunft.bestandteile],
  }
  switch (ergebnis.aussage) {
    case 'eindeutig':
      return {
        kind: 'eindeutig',
        empfehlung: ergebnis.empfehlung,
        abgeltung: ergebnis.abgeltung,
        persoenlich: ergebnis.persoenlich,
        delta: ergebnis.delta,
        unschaerfe,
        herkunft,
      }
    case 'zu-knapp':
      return { kind: 'zu-knapp', abgeltung: ergebnis.abgeltung, persoenlich: ergebnis.persoenlich, delta: ergebnis.delta, unschaerfe, herkunft }
    case 'unbestimmt':
      return { kind: 'unbestimmt', abgeltung: ergebnis.abgeltung, persoenlich: ergebnis.persoenlich, delta: ergebnis.delta, unschaerfe, herkunft }
  }
}

/** Application logic for the Kapital guided mask + depot-Einordnung + the § 32d Abs. 6 Günstigerprüfung. */
@Injectable()
export class KapitalService {
  constructor(
    @Inject(KAPITAL_REPOSITORY) private readonly repository: KapitalRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
    @Inject(LSTB_REPOSITORY) private readonly lstbRepository: LstbRepository,
    @Inject(TAX_YEAR_REPOSITORY) private readonly taxYearRepository: TaxYearRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(KENNZEICHNUNG_REPOSITORY) private readonly kennzeichnungen: KennzeichnungRepository,
  ) {}

  private async antworten(userId: string, steuerjahr: number): Promise<Answers> {
    const rows = await this.interviewRepository.findAllForUserAndYear(userId, steuerjahr)
    return answersAus(rows)
  }

  private async toResponse(userId: string, steuerjahr: number, record: KapitalRecord | null): Promise<KapitalResponseDto> {
    const daten = datenAusRecord(record)
    const answers = await this.antworten(userId, steuerjahr)
    const gegated = gatedEinkunftsarten(answers)
    const depot = ordneKapDepotEin(answers['kap-depot'])

    const kernposten = kapitalAlsKernposten(daten)
    const posten: KapitalPostenDto[] = kernposten === null ? [] : [postenZuDto(kernposten)]
    const stand = kapitalStand(daten, gegated)

    return {
      kapitalertraege: toFeldDto(daten.kapitalertraege),
      sparerPauschbetrag: toFeldDto(daten.sparerPauschbetrag),
      kapitalertragsteuer: toFeldDto(daten.kapitalertragsteuer),
      solidaritaetszuschlag: toFeldDto(daten.solidaritaetszuschlag),
      kirchensteuer: toFeldDto(daten.kirchensteuer),
      pflichtfelder: [...kapitalPflichtfelder(depot.kind)],
      depot: depotZuDto(depot),
      posten,
      stand: standZuDto(stand),
      inhaber: record?.inhaber ?? null,
    }
  }

  async getState(userId: string, steuerjahr: number): Promise<KapitalResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    if (record !== null) {
      await this.auditService.append({ userId, action: 'READ', resource: 'kapital' })
    }
    return this.toResponse(userId, steuerjahr, record)
  }

  async setFeld(userId: string, steuerjahr: number, feld: KapitalFeldId, dto: PutKapitalFeldDto): Promise<KapitalResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    const daten = datenAusRecord(record)
    const zustand = zustandAusDto(dto)
    setzeKapitalFeld(daten, feld, zustand)
    const next = await this.repository.setFeld(userId, steuerjahr, feld, serialisiereKapitalFeld(zustand))
    await this.kennzeichnungen.entferne(userId, steuerjahr, [kennzeichnungsKey('kapital', feld)])
    return this.toResponse(userId, steuerjahr, next)
  }

  async setInhaber(userId: string, steuerjahr: number, inhaber: 'A' | 'B' | 'gemeinsam'): Promise<KapitalResponseDto> {
    const next = await this.repository.setInhaber(userId, steuerjahr, inhaber)
    return this.toResponse(userId, steuerjahr, next)
  }

  async getGuenstigerpruefung(
    userId: string,
    steuerjahr: number,
    kirchensteuerFaktor: KirchensteuerFaktor,
  ): Promise<GuenstigerpruefungDto | null> {
    const record = await this.taxYearRepository.findByUserAndYear(userId, steuerjahr)
    if (!record) return null

    const [kapitalRecord, lstbRecord, interviewRows] = await Promise.all([
      this.repository.findForUserAndYear(userId, steuerjahr),
      this.lstbRepository.findForUserAndYear(userId, steuerjahr),
      this.interviewRepository.findAllForUserAndYear(userId, steuerjahr),
    ])

    const answers = answersAus(interviewRows)
    const depot = ordneKapDepotEin(answers['kap-depot'])
    const daten = datenAusRecord(kapitalRecord)

    if (depot.kind === 'auslaendischer-broker') {
      return { kind: 'nicht-anwendbar', grund: 'keine-abgeltung-einbehalten' }
    }
    if (depot.kind === 'krypto') {
      return { kind: 'nicht-anwendbar', grund: 'krypto-gegated' }
    }
    if (depot.kind === 'unbekannt') {
      return { kind: 'nicht-anwendbar', grund: 'kap-depot-nicht-beantwortet' }
    }
    if (daten.kapitalertraege.kind !== 'erfasst') {
      return { kind: 'nicht-anwendbar', grund: 'keine-kapitalertraege' }
    }

    const uebrigesZvE = angestellteAusDaten(lstbDatenAus(lstbRecord), answers).einnahmen
    const veranlagung = 'einzel' as const

    const ergebnis = guenstigerpruefung({
      kapitalertraege: daten.kapitalertraege.wert,
      uebrigesZvE,
      year: steuerjahr,
      veranlagung,
      progressionsvorbehalt: progressionsvorbehaltAus(answers),
      kirchensteuerFaktor,
    })
    return guenstigerpruefungZuDto(ergebnis)
  }
}
