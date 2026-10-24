// Application logic: userId+steuerjahr-scoped read, then the deterministic
// Veranlagungsartenvergleich → wire mapping. Trusts `userId` was produced by UserContextGuard
// (never accepts it from a param/body) — mirrors CockpitService's shape.
//
// Ticket 10.2 (M1): the comparison is computed ONLY by @steuereule/core
// (`veranlagungsartenvergleich`, ADR-0034) — never re-derived here (ADR-014/048 determinism
// boundary). The service's job is to gather the facts the core needs and name the honest gates:
//   - `zveA` = the user's settled Einnahmen from `angestellteAusDaten` (a zvE-BASIS, not a real
//     zvE — layer 3 of ADR-0034 is still open, and the response's `herkunft` says so);
//   - `verheiratet` + `zveB` (the PARTNER's zvE-basis) are explicit inputs — M1 does not persist
//     either yet (the Segment-2 `partner` question is declared but not admitted server-side,
//     coupling D4, and the partner's income is uncollected), so they are never fabricated here;
//   - the Progressionsvorbehalt input from the `lohnersatz` catalogue answer (admitted);
//   - `nicht-anwendbar` when single or no income recorded yet.
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import {
  LEERES_LSTB,
  angestellteAusDaten,
  deserialisiereLstbFeld,
  veranlagungsartenvergleich,
  type Answers,
  type KirchensteuerFaktor,
  type LstbDaten,
  type ProgressionsvorbehaltEingabe,
  type Veranlagungsartenvergleich as Vergleich,
} from '@steuereule/core'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRecord, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { LSTB_REPOSITORY, type LstbRecord, type LstbRepository } from '../lstb/lstb.repository.js'
import { TAX_YEAR_REPOSITORY, type TaxYearRepository } from '../cockpit/tax-year.repository.js'
import type { UnschaerfeDto, VeranlagungsartenvergleichDto, VergleichsHerkunftDto } from './dto/veranlagungsartenvergleich-response.dto.js'

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

/** A stored integer answer → whole euros, 0 when absent (same rule as angestellte.ts's intAus). */
function intAus(value: string | undefined): number {
  if (value === undefined) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * The `lohnersatz` catalogue answer → the core's Progressionsvorbehalt input.
 *
 * `'Ja'` is a *complete* Progressionsvorbehalt input only when a positive amount was actually
 * captured. A `'Ja'` with a missing/empty/non-numeric/`<=0` amount (mid-flow, aborted, or never
 * opened) is NOT `{ betrag: 0 }` — `intAus`'s absent→0 default would manufacture a zero Lohnersatz
 * and let `progressionsvorbehaltSchranke` return `obergrenze: 0`, which could flip an honest
 * `unbestimmt` into a false `eindeutig`. ADR-0032: never fabricate a null value.
 */
function progressionsvorbehaltAus(answers: Answers): ProgressionsvorbehaltEingabe {
  if (answers.lohnersatz === 'Ja') {
    const betrag = intAus(answers['lohnersatz-betrag'])
    return betrag > 0 ? { art: 'lohnersatzleistungen', betrag } : { art: 'nicht-angegeben' }
  }
  if (answers.lohnersatz === 'Nein') return { art: 'keine' }
  return { art: 'nicht-angegeben' }
}

/** The core's result → the flat wire DTO (kind + optional fields). */
function toDto(vergleich: Vergleich): VeranlagungsartenvergleichDto {
  const unschaerfe: UnschaerfeDto =
    vergleich.unschaerfe.kind === 'bestimmt'
      ? { kind: 'bestimmt', obergrenze: vergleich.unschaerfe.obergrenze }
      : { kind: 'unbestimmt', grund: vergleich.unschaerfe.grund }
  const herkunft: VergleichsHerkunftDto = {
    zveA: vergleich.herkunft.zveA,
    zveB: vergleich.herkunft.zveB,
    bestandteile: [...vergleich.herkunft.bestandteile],
  }
  switch (vergleich.aussage) {
    case 'eindeutig':
      return {
        kind: 'eindeutig',
        empfehlung: vergleich.empfehlung,
        einzel: vergleich.einzel,
        zusammen: vergleich.zusammen,
        delta: vergleich.delta,
        unschaerfe,
        herkunft,
      }
    case 'zu-knapp':
      return { kind: 'zu-knapp', einzel: vergleich.einzel, zusammen: vergleich.zusammen, delta: vergleich.delta, unschaerfe, herkunft }
    case 'unbestimmt':
      return { kind: 'unbestimmt', einzel: vergleich.einzel, zusammen: vergleich.zusammen, delta: vergleich.delta, unschaerfe, herkunft }
  }
}

@Injectable()
export class VeranlagungsartenvergleichService {
  // Explicit tokens — see CockpitService's constructor for why. The LStB/Interview repositories
  // are the same seams their own services use, so this reads through the SAME field-encryption +
  // integrity checks, never a second Prisma path.
  constructor(
    @Inject(TAX_YEAR_REPOSITORY) private readonly taxYearRepository: TaxYearRepository,
    @Inject(LSTB_REPOSITORY) private readonly lstbRepository: LstbRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
  ) {}

  async getVergleich(
    userId: string,
    steuerjahr: number,
    verheiratet: boolean,
    zveB: number | undefined,
    kirchensteuerFaktor: KirchensteuerFaktor,
  ): Promise<VeranlagungsartenvergleichDto | null> {
    const record = await this.taxYearRepository.findByUserAndYear(userId, steuerjahr)
    // Null propagates as-is — "no tax year yet" is the honest empty state (same as Cockpit).
    if (!record) return null

    const [lstbRecord, interviewRows] = await Promise.all([
      this.lstbRepository.findForUserAndYear(userId, steuerjahr),
      this.interviewRepository.findAllForUserAndYear(userId, steuerjahr),
    ])

    const daten = datenAusRecord(lstbRecord)
    const answers = toAnswers(interviewRows)

    // Honest gates first (ADR-0032): the comparison applies only to a married user with income
    // recorded. Single → no choice between Einzel/Zusammen exists; no income → nothing to compare.
    if (!verheiratet) {
      return { kind: 'nicht-anwendbar', grund: 'nicht-verheiratet' }
    }
    const fakten = angestellteAusDaten(daten, answers)
    if (fakten.einnahmen === 0) {
      return { kind: 'nicht-anwendbar', grund: 'keine-einnahmen' }
    }
    // The comparison applies — the partner zvE-basis is required, never fabricated.
    if (zveB === undefined) {
      throw new BadRequestException('zveB is required to run the Veranlagungsartenvergleich')
    }

    const vergleich = veranlagungsartenvergleich({
      zveA: fakten.einnahmen,
      zveB,
      year: steuerjahr,
      progressionsvorbehalt: progressionsvorbehaltAus(answers),
      kirchensteuerFaktor,
    })
    return toDto(vergleich)
  }
}
