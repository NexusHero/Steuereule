// Application logic for the Kapital guided mask + depot-Einordnung + the § 32d Abs. 6
// Günstigerprüfung (ticket 10.5, product ADR-032, Anlage KAP). userId+steuerjahr-scoped
// read/write, then the honest-state + fold mapping. Trusts that `userId` was produced by
// UserContextGuard + @RequiresAccount() (never accepts it from a param/body) — mirrors
// LstbService/RenteService. The fold is NEVER computed here — @steuereule/core's
// `kapitalAlsKernposten`/`kapitalStand`/`guenstigerpruefung`/`ordneKapDepotEin`/
// `deserialisiereKapitalFeld`/`serialisiereKapitalFeld`/`setzeKapitalFeld` are imported,
// never reimplemented (ADR-014/048 determinism boundary).
//
// The depot kind (Deutscher / Ausländischer Broker / Krypto) is DERIVED from the persisted
// interview answer `kap-depot` (read through the interview repository — one source, no
// denormalized copy). The Günstigerprüfung applies ONLY where Abgeltungsteuer was actually
// withheld (deutscher-broker); an ausländischer Broker is a KAP-Pflicht (no tax withheld), and
// Krypto is gated — both named honestly, never a fabricated Abgeltung (ADR-032).
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import {
  LEERES_KAPITAL,
  LEERES_LSTB,
  angestellteAusDaten,
  deserialisiereKapitalFeld,
  deserialisiereLstbFeld,
  gatedEinkunftsarten,
  guenstigerpruefung,
  istGueltigerKapitalBetrag,
  kapitalAlsKernposten,
  kapitalStand,
  ordneKapDepotEin,
  serialisiereKapitalFeld,
  setzeKapitalFeld,
  type Answers,
  type Berechnungsstand,
  type Guenstigerpruefung as GuenstigerpruefungKern,
  type KapitalDaten,
  type KapitalFeldId,
  type KapitalFeldZustand,
  type KapitalDepotEinordnung,
  type KirchensteuerFaktor,
  type LstbDaten,
  type Posten,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { LSTB_REPOSITORY, type LstbRecord, type LstbRepository } from '../lstb/lstb.repository.js'
import { TAX_YEAR_REPOSITORY, type TaxYearRepository } from '../cockpit/tax-year.repository.js'
import { progressionsvorbehaltAus } from '../veranlagungsartenvergleich/veranlagungsartenvergleich.service.js'
import { KAPITAL_REPOSITORY, type KapitalRecord, type KapitalRepository } from './kapital.repository.js'
import type { PutKapitalFeldDto, KapitalFeldDto } from './dto/kapital-feld.dto.js'
import type { DepotEinordnungDto, KapitalPostenDto, KapitalResponseDto, KapitalStandDto } from './dto/kapital-response.dto.js'
import type { GuenstigerpruefungDto, GuenstigerpruefungHerkunftDto } from './dto/guenstigerpruefung-response.dto.js'
import type { UnschaerfeDto } from '../veranlagungsartenvergleich/dto/veranlagungsartenvergleich-response.dto.js'

/** A stored row (or none) → the core's KapitalDaten, via the ONE encoding in core/kapital.ts. */
function datenAusRecord(record: KapitalRecord | null): KapitalDaten {
  if (record === null) return LEERES_KAPITAL
  return { kapitalertraege: deserialisiereKapitalFeld(record.kapitalertraege) }
}

/** A stored LStB row (or none) → the core's LstbDaten, via the ONE encoding in core/lstb.ts. */
function lstbAusRecord(record: LstbRecord | null): LstbDaten {
  if (record === null) return LEERES_LSTB
  return {
    bruttoarbeitslohn: deserialisiereLstbFeld(record.bruttoarbeitslohn),
    lohnsteuer: deserialisiereLstbFeld(record.lohnsteuer),
    sozialversicherung: deserialisiereLstbFeld(record.sozialversicherung),
  }
}

/** Stored interview rows → the core's sparse Answers object. */
function toAnswers(rows: { questionId: string; value: string }[]): Answers {
  const answers: Record<string, string> = {}
  for (const row of rows) answers[row.questionId] = row.value
  return answers as Answers
}

/** A wire field state → the core's KapitalFeldZustand; a 400 when `erfasst` lacks a valid value. */
function zustandAusDto(dto: PutKapitalFeldDto): KapitalFeldZustand {
  if (dto.kind === 'offen') return { kind: 'offen' }
  if (dto.kind === 'unklar') return { kind: 'unklar' }
  if (dto.wert === undefined || !istGueltigerKapitalBetrag(dto.wert)) {
    throw new BadRequestException('kind "erfasst" requires a non-negative integer `wert`.')
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

/** The core's result → the flat wire DTO (kind + optional fields). */
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

@Injectable()
export class KapitalService {
  constructor(
    @Inject(KAPITAL_REPOSITORY) private readonly repository: KapitalRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
    @Inject(LSTB_REPOSITORY) private readonly lstbRepository: LstbRepository,
    @Inject(TAX_YEAR_REPOSITORY) private readonly taxYearRepository: TaxYearRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  private async antworten(userId: string, steuerjahr: number): Promise<Answers> {
    const rows = await this.interviewRepository.findAllForUserAndYear(userId, steuerjahr)
    return toAnswers(rows)
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
      depot: depotZuDto(depot),
      posten,
      stand: standZuDto(stand),
    }
  }

  async getState(userId: string, steuerjahr: number): Promise<KapitalResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    // Only log an access when there's something to access (REQ-004.2's pattern).
    if (record !== null) {
      await this.auditService.append({ userId, action: 'READ', resource: 'kapital' })
    }
    return this.toResponse(userId, steuerjahr, record)
  }

  async setFeld(userId: string, steuerjahr: number, feld: KapitalFeldId, dto: PutKapitalFeldDto): Promise<KapitalResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    const daten = datenAusRecord(record)
    const zustand = zustandAusDto(dto)
    // `setzeKapitalFeld` is the core's own invariant guard (throws on an invalid `erfasst`) —
    // defense in depth behind the explicit 400 in `zustandAusDto`.
    setzeKapitalFeld(daten, feld, zustand)
    const next = await this.repository.setFeld(userId, steuerjahr, feld, serialisiereKapitalFeld(zustand))
    return this.toResponse(userId, steuerjahr, next)
  }

  /**
   * The § 32d Abs. 6 EStG Günstigerprüfung, gathered + gated here and computed ONLY by the core
   * (`guenstigerpruefung`, ADR-0034-Muster). The honest gates first (ADR-032): the comparison
   * applies only where Abgeltungsteuer was withheld (deutscher-broker) AND Kapitalerträge are
   * captured. `uebrigesZvE` is the settled non-capital income (Einnahmen-Basis from `berechne`,
   * layer 3 open). The Veranlagungsart is fixed to Einzelveranlagung in M1 — the Sparerpauschbetrag
   * (§ 20 Abs. 9: 1.000 € einzel / 2.000 € zusammen) and the Splitting-Tarif are the later
   * Zusammenveranlagung slice's inputs, the same "not yet collected" honesty as the
   * Veranlagungsartenvergleich's `verheiratet` flag (never fabricated here).
   */
  async getGuenstigerpruefung(
    userId: string,
    steuerjahr: number,
    kirchensteuerFaktor: KirchensteuerFaktor,
  ): Promise<GuenstigerpruefungDto | null> {
    const record = await this.taxYearRepository.findByUserAndYear(userId, steuerjahr)
    // Null propagates as-is — "no tax year yet" is the honest empty state (same as Cockpit).
    if (!record) return null

    const [kapitalRecord, lstbRecord, interviewRows] = await Promise.all([
      this.repository.findForUserAndYear(userId, steuerjahr),
      this.lstbRepository.findForUserAndYear(userId, steuerjahr),
      this.interviewRepository.findAllForUserAndYear(userId, steuerjahr),
    ])

    const answers = toAnswers(interviewRows)
    const depot = ordneKapDepotEin(answers['kap-depot'])
    const daten = datenAusRecord(kapitalRecord)

    // Honest gates first — the Günstigerprüfung names why it does not apply rather than
    // manufacturing an Abgeltung that never happened (ADR-032).
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

    const uebrigesZvE = angestellteAusDaten(lstbAusRecord(lstbRecord), answers).einnahmen
    // M1: Einzelveranlagung — see the method doc (the Veranlagung choice is a later slice's input).
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
