// Application logic: userId+steuerjahr-scoped read, then the honest fold -> wire mapping.
// Trusts that `userId` was produced by UserContextGuard (never accepts it from a
// param/body) — mirrors ProfileService's shape.
//
// Ticket 15 (Cockpit-Echtdaten): the Schätz-Platzhalter (`baseEstimate`) is GONE. The number
// the Cockpit shows now comes from the deterministic core alone — the settled income Posten
// (LStB Bruttoarbeitslohn + Nebenjob-Brutto) summed, folded through @steuereule/core's
// `cockpitSpanneAusEingaben` (which carries the ADR-015 range rule), and reported as an honest
// `bestimmt` / `spanne` / `gated` stand. The refund/tariff formula stays out of scope (ADR-048/
// ADR-0032: no number that looks like a calculation without being one) — so the hero shows the
// settled income, never a fabricated Erstattung.
import { Inject, Injectable } from '@nestjs/common'
import {
  LEERES_LSTB,
  angestellteAusDaten,
  cockpitSpanneAusEingaben,
  deserialisiereLstbFeld,
  type Answers,
  type CockpitSpanne,
  type LstbDaten,
} from '@steuereule/core'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRecord, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { KAPITAL_REPOSITORY, type KapitalRepository } from '../kapital/kapital.repository.js'
import { LSTB_REPOSITORY, type LstbRecord, type LstbRepository } from '../lstb/lstb.repository.js'
import { RENTE_REPOSITORY, type RenteRepository } from '../rente/rente.repository.js'
import { UEBERNAHME_REPOSITORY, type UebernahmeRepository } from '../uebernahme/uebernahme.repository.js'
import { VERMIETUNG_REPOSITORY, type VermietungRepository } from '../vermietung/vermietung.repository.js'
import { TAX_YEAR_REPOSITORY, type TaxYearRepository } from './tax-year.repository.js'
import type { CockpitStandDto, CockpitSummaryDto } from './dto/cockpit-summary.dto.js'

/**
 * The ONE encoding (packages/core/src/lstb.ts): a stored field string is `erfasst` when it is a
 * plain non-negative integer (whole euros), anything else (`null`/`unklar`/`0`) is not a settled
 * fact. A settled value parses to its number, anything else yields null — never a fabricated
 * zero (ADR-032).
 */
function erfassterWert(raw: string | null): number | null {
  if (raw === null || raw === 'unklar') return null
  if (!/^\d+$/.test(raw)) return null
  return Number(raw)
}

/** A stored LStB row (or none) → the core's LstbDaten, via the ONE encoding in core/lstb.ts. */
function datenAusRecord(record: LstbRecord | null): LstbDaten {
  if (record === null) return LEERES_LSTB
  return {
    bruttoarbeitslohn: deserialisiereLstbFeld(record.bruttoarbeitslohn),
    lohnsteuer: deserialisiereLstbFeld(record.lohnsteuer),
    sozialversicherung: deserialisiereLstbFeld(record.sozialversicherung),
  }
}

/** Stored interview rows → the core's sparse Answers object. */
function toAnswers(rows: InterviewAnswerRecord[]): Answers {
  const answers: Record<string, string> = {}
  for (const row of rows) answers[row.questionId] = row.value
  return answers as Answers
}

/** The core's CockpitSpanne → the flat wire DTO (kind + optional fields, LstbZustandDto's shape). */
function toStandDto(stand: CockpitSpanne): CockpitStandDto {
  switch (stand.kind) {
    case 'bestimmt':
      return { kind: 'bestimmt', wert: stand.wert }
    case 'spanne':
      return {
        kind: 'spanne',
        von: stand.von,
        bis: stand.bis,
        offenePosten: stand.offenePosten,
        konflikte: stand.konflikte,
        unbestaetigte: stand.unbestaetigte,
        unbestaetigteSumme: stand.unbestaetigteSumme,
      }
    case 'gated':
      return { kind: 'gated', summe: stand.summe, gegated: [...stand.gegated] }
  }
}

@Injectable()
export class CockpitService {
  // Explicit tokens — see the comment on ProfileController's constructor. The LStB/Interview
  // repositories are the same seams their own services use, so the Cockpit's aggregation reads
  // through the SAME field-encryption + integrity checks, never a second Prisma path.
  constructor(
    @Inject(TAX_YEAR_REPOSITORY) private readonly taxYearRepository: TaxYearRepository,
    @Inject(LSTB_REPOSITORY) private readonly lstbRepository: LstbRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
    @Inject(UEBERNAHME_REPOSITORY) private readonly uebernahmeRepository: UebernahmeRepository,
    @Inject(RENTE_REPOSITORY) private readonly renteRepository: RenteRepository,
    @Inject(KAPITAL_REPOSITORY) private readonly kapitalRepository: KapitalRepository,
    @Inject(VERMIETUNG_REPOSITORY) private readonly vermietungRepository: VermietungRepository,
  ) {}

  async getSummary(userId: string, steuerjahr: number): Promise<CockpitSummaryDto | null> {
    const record = await this.taxYearRepository.findByUserAndYear(userId, steuerjahr)
    // Null propagates as-is — "no tax year yet" is the honest empty state (REQ-001),
    // never a synthesized zero row.
    if (!record) return null

    const [lstbRecord, interviewRows, uebernahmen, renteRecord, kapitalRecord, vermietungRecords] = await Promise.all([
      this.lstbRepository.findForUserAndYear(userId, steuerjahr),
      this.interviewRepository.findAllForUserAndYear(userId, steuerjahr),
      this.uebernahmeRepository.listForUserAndYear(userId, steuerjahr),
      this.renteRepository.findForUserAndYear(userId, steuerjahr),
      this.kapitalRepository.findForUserAndYear(userId, steuerjahr),
      this.vermietungRepository.listForUserAndYear(userId, steuerjahr),
    ])

    const daten = datenAusRecord(lstbRecord)
    const answers = toAnswers(interviewRows)

    // ADR-021: UNBESTÄTIGTE Übernahmen zählen in die Spanne — je kopierter Fakt ein Posten,
    // seine erfasste Summe ist die Unsicherheit, die er beiträgt (ruhig, kein Konflikt). Die
    // Kennzeichnung benennt den Fakt (`lstb`, `rente`, `kapital`, `vermietung-<id>`); der Wert
    // kommt aus der kopierten Zeile selbst — immer der erfasste Betrag, nie ein fabricated zero.
    let unbestaetigte = 0
    let unbestaetigteSumme = 0
    for (const kennzeichnung of uebernahmen) {
      if (kennzeichnung.bestaetigt) continue
      let wert: number | null = null
      if (kennzeichnung.postenKey === 'lstb' && daten.bruttoarbeitslohn.kind === 'erfasst') {
        wert = daten.bruttoarbeitslohn.wert
      } else if (kennzeichnung.postenKey === 'rente') {
        wert = erfassterWert(renteRecord?.jahresbetrag ?? null)
      } else if (kennzeichnung.postenKey === 'kapital') {
        wert = erfassterWert(kapitalRecord?.kapitalertraege ?? null)
      } else if (kennzeichnung.postenKey.startsWith('vermietung-')) {
        const objektId = kennzeichnung.postenKey.slice('vermietung-'.length)
        const objekt = vermietungRecords.find((o) => o.id === objektId)
        wert = erfassterWert(objekt?.mieteinnahmen ?? null)
      }
      if (wert !== null) {
        unbestaetigte += 1
        unbestaetigteSumme += wert
      }
    }

    // The one and only place the stand is derived — @steuereule/core's cockpitSpanneAusEingaben,
    // never re-derived here (determinism boundary, ADR-014/048/015). The settled income + open/
    // conflict counts come from `angestellteAusDaten`, the single core fold shared with mobile-web.
    const fakten = angestellteAusDaten(daten, answers)
    const stand = cockpitSpanneAusEingaben({
      summe: fakten.einnahmen,
      offenePosten: fakten.offenePosten,
      konflikte: fakten.konflikte,
      gegated: fakten.gegated,
      unbestaetigte,
      unbestaetigteSumme,
    })

    return { taxYear: record.steuerjahr, stand: toStandDto(stand), openItems: record.openItems }
  }
}
