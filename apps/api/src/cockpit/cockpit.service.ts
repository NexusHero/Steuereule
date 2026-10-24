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
  angestellteAusAntworten,
  cockpitSpanneAusEingaben,
  deserialisiereLstbFeld,
  gatedEinkunftsarten,
  lstbZustand,
  type Answers,
  type CockpitSpanne,
  type LstbDaten,
} from '@steuereule/core'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRecord, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { LSTB_REPOSITORY, type LstbRecord, type LstbRepository } from '../lstb/lstb.repository.js'
import { TAX_YEAR_REPOSITORY, type TaxYearRepository } from './tax-year.repository.js'
import type { CockpitStandDto, CockpitSummaryDto } from './dto/cockpit-summary.dto.js'

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

/** The LStB figures only apply when the Angestellte vertical does (job = Angestellt/Beides). */
function angestellteZutreffend(answers: Answers): boolean {
  return answers.job === 'Angestellt' || answers.job === 'Beides'
}

/**
 * The settled income-Posten sum this slice can fold (ADR-048: income-only Posten). Only the
 * LStB Bruttoarbeitslohn (when the Angestellte vertical applies) and a declared Nebenjob's
 * Brutto are income; Werbungskosten and Sonderausgaben are captured-but-not-folded (their
 * formulas are later slices) and never enter this sum — a partial truth stated as a partial
 * truth, never a guess.
 */
function summeAusDaten(daten: LstbDaten, answers: Answers): number {
  let summe = 0
  if (angestellteZutreffend(answers) && daten.bruttoarbeitslohn.kind === 'erfasst') {
    summe += daten.bruttoarbeitslohn.wert
  }
  if (answers.nebenjob === 'Midijob' || answers.nebenjob === 'Nebenjob') {
    summe += angestellteAusAntworten(answers).nebenjobBrutto
  }
  return summe
}

/**
 * Required-but-empty line items: the LStB's own open/unclear fields (only when the Angestellte
 * vertical applies — a pensioner/self-employed person has no LStB to transcribe), plus a
 * declared Nebenjob whose Brutto follow-up was never entered. Optional Lebenslagen/Sonderausgaben
 * branches are NOT counted — they are optional-by-declaration, and their amounts surface as a
 * plausibility Hinweis, not as an open required line item.
 */
function offenePostenAusDaten(daten: LstbDaten, answers: Answers): number {
  let offen = 0
  if (angestellteZutreffend(answers)) {
    const zustand = lstbZustand(daten)
    if (zustand.kind === 'unvollstaendig') offen = zustand.offen.length + zustand.unklar.length
  }
  const nebenjobOffen =
    (answers.nebenjob === 'Midijob' || answers.nebenjob === 'Nebenjob') && angestellteAusAntworten(answers).nebenjobBrutto === 0
  if (nebenjobOffen) offen += 1
  return offen
}

/** Open conflicts: the LStB's named widerspruch (ADR-008), counted — `berechne` reads only this count. */
function konflikteAusDaten(daten: LstbDaten, answers: Answers): number {
  if (!angestellteZutreffend(answers)) return 0
  const zustand = lstbZustand(daten)
  return zustand.kind === 'widerspruch' ? zustand.widersprueche.length : 0
}

/** The core's CockpitSpanne → the flat wire DTO (kind + optional fields, LstbZustandDto's shape). */
function toStandDto(stand: CockpitSpanne): CockpitStandDto {
  switch (stand.kind) {
    case 'bestimmt':
      return { kind: 'bestimmt', wert: stand.wert }
    case 'spanne':
      return { kind: 'spanne', von: stand.von, bis: stand.bis, offenePosten: stand.offenePosten, konflikte: stand.konflikte }
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
  ) {}

  async getSummary(userId: string, steuerjahr: number): Promise<CockpitSummaryDto | null> {
    const record = await this.taxYearRepository.findByUserAndYear(userId, steuerjahr)
    // Null propagates as-is — "no tax year yet" is the honest empty state (REQ-001),
    // never a synthesized zero row.
    if (!record) return null

    const [lstbRecord, interviewRows] = await Promise.all([
      this.lstbRepository.findForUserAndYear(userId, steuerjahr),
      this.interviewRepository.findAllForUserAndYear(userId, steuerjahr),
    ])

    const daten = datenAusRecord(lstbRecord)
    const answers = toAnswers(interviewRows)

    // The one and only place the stand is derived — @steuereule/core's cockpitSpanneAusEingaben,
    // never re-derived here (determinism boundary, ADR-014/048/015).
    const stand = cockpitSpanneAusEingaben({
      summe: summeAusDaten(daten, answers),
      offenePosten: offenePostenAusDaten(daten, answers),
      konflikte: konflikteAusDaten(daten, answers),
      gegated: gatedEinkunftsarten(answers),
    })

    return { taxYear: record.steuerjahr, stand: toStandDto(stand), openItems: record.openItems }
  }
}
