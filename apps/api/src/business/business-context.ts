import { HttpException, HttpStatus, Inject, Injectable, Optional } from '@nestjs/common'
import { euerYearOf, type ChartOfAccounts, type BookkeepingMode, type JournalEntry, type Ledger } from '@steuereule/core'
import { ForbiddenError, NotFoundError } from '../common/domain-error.js'
import { selfEmploymentEnabled, declaresSelfEmployment } from '../config/self-employment.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { answersFrom } from '../interview/answers.js'
import { UnlockService } from '../unlock/unlock.service.js'
import {
  BUSINESS_REPOSITORY,
  type BusinessPerson,
  type BusinessRef,
  FIRST_BUSINESS,
  firstBusinessOf,
  type BusinessProfileRecord,
  type BusinessRepository,
  type LoadedBook,
} from './business.repository.js'
import { vatEntriesOf } from './business-ledger.js'
import { BUSINESS_CLOCK } from './business.tokens.js'
import { isoNow, personWideOf } from './business-helpers.js'

/** HTTP 402 for the paid parts, the same status the printout answers with (ADR-0050). */
export class PaymentRequiredError extends HttpException {
  constructor(year: number) {
    super({ statusCode: HttpStatus.PAYMENT_REQUIRED, code: 'SELF_EMPLOYMENT_NOT_UNLOCKED', message: `Die Ausfüllhilfe und die Exporte für ${year} sind noch nicht freigeschaltet.` }, HttpStatus.PAYMENT_REQUIRED)
  }
}

/**
 * What every part of the self-employment path needs first (ADR-0101): the gate, the paid tier, and the
 * profile and book of a business as the other services read them.
 */
@Injectable()
export class BusinessContext {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly repository: BusinessRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interview: InterviewAnswerRepository,
    @Optional() @Inject(UnlockService) private readonly unlock?: UnlockService,
    /** The clock of the book's log records. */
    @Optional() @Inject(BUSINESS_CLOCK) readonly now: () => string = isoNow,
  ) {}

  /** The path exists only with the switch on and a job that has a business (REQ-015 as amended). */
  async assertOpen(userId: string, year: number): Promise<void> {
    if (!selfEmploymentEnabled()) {
      throw new ForbiddenError('SELF_EMPLOYMENT_DISABLED', 'Selbstständige kann SteuerEule noch nicht berechnen.')
    }
    const answers = answersFrom(await this.interview.findAllForUserAndYear(userId, year))
    if (!declaresSelfEmployment(answers)) {
      throw new ForbiddenError('SELF_EMPLOYMENT_NOT_DECLARED', 'Im Interview ist für dieses Jahr keine selbstständige Tätigkeit angegeben.')
    }
  }

  /** The fill-in help and the exports are part of the paid self-employment tier (ADR-0101 §21). */
  async assertUnlocked(userId: string, year: number): Promise<void> {
    if (!this.unlock) return
    if ((await this.unlock.status(userId, year)) !== 'freigeschaltet') {
      throw new PaymentRequiredError(year)
    }
  }

  async profileRecord(userId: string, year: number, ref: BusinessRef): Promise<BusinessProfileRecord | null> {
    return this.repository.findProfile(userId, year, ref)
  }

  /**
   * The business's own record with the person-wide facts from the first business: VAT is owed by the
   * Unternehmer for all his businesses together (§ 2 Abs. 1 Satz 2 UStG), losses and partnership shares
   * belong to the person (ADR-0101 §22).
   */
  async personRecord(userId: string, year: number, ref: BusinessRef): Promise<BusinessProfileRecord | null> {
    if (ref.business === FIRST_BUSINESS) return this.profileRecord(userId, year, ref)
    const [own, first] = await Promise.all([this.profileRecord(userId, year, ref), this.profileRecord(userId, year, firstBusinessOf(ref.person))])
    if (own === null) return null
    return { ...own, ...personWideOf(first) }
  }

  /** The frame a new book gets: what the profile says, SKR03 and EÜR otherwise. */
  /**
   * The frame of a book with the person-wide facts merged in (Kleinunternehmer, losses …), so every
   * business is checked against them (ADR-0101 §22). A further business must exist before it is used.
   */
  async frame(userId: string, year: number, ref: BusinessRef): Promise<{ chart: ChartOfAccounts; mode: BookkeepingMode; profile: BusinessProfileRecord | null }> {
    const profile = await this.personRecord(userId, year, ref)
    if (profile === null && ref.business !== FIRST_BUSINESS) throw new NotFoundError('BUSINESS_UNKNOWN', `Den Betrieb ${ref.business} gibt es für ${year} nicht; leg ihn in der Übersicht an.`)
    return { chart: profile?.chart ?? 'SKR03', mode: profile?.mode ?? 'euer', profile }
  }

  async loaded(userId: string, year: number, ref: BusinessRef): Promise<{ book: LoadedBook | null; ledger: Ledger; profile: BusinessProfileRecord | null }> {
    const [{ chart, mode, profile }, book] = await Promise.all([this.frame(userId, year, ref), this.repository.loadBook(userId, year, ref)])
    const ledger = book?.ledger ?? { chart, mode, entries: [], lockedThrough: null }
    if (ledger.mode !== 'euer') return { book, profile, ledger }
    // § 11 Abs. 1 Satz 2, Abs. 2 Satz 2 EStG (ADR-0101 §22): a regular payment booked in the neighbouring
    // year's book that belongs to this year counts here; the EÜR filter by euerYearOf does the rest.
    const neighbours = await Promise.all([this.repository.loadBook(userId, year - 1, ref), this.repository.loadBook(userId, year + 1, ref)])
    // Only from an EÜR book in the same chart: a Bilanz counts by date, and another chart reads the numbers wrong.
    const borrowed = neighbours
      .filter((n) => n !== null && n.book.chart === ledger.chart && n.book.mode === 'euer')
      .flatMap((n) => n!.ledger.entries.filter((e) => e.regularPayment !== null && euerYearOf(e) === year))
    return { book, profile, ledger: borrowed.length === 0 ? ledger : { ...ledger, entries: [...ledger.entries, ...borrowed] } }
  }

  /** Every business of the person that has a profile or a book, loaded, the person-wide facts merged in. */
  async businessesOf(userId: string, year: number, person: BusinessPerson): Promise<{ ref: BusinessRef; book: LoadedBook | null; ledger: Ledger; profile: BusinessProfileRecord | null; vatEntries: JournalEntry[] }[]> {
    const profiles = await this.repository.listProfiles(userId, year, person)
    const numbers = new Set([FIRST_BUSINESS, ...profiles.map((p) => p.business)])
    const loaded = await Promise.all(
      [...numbers].sort((a, b) => a - b).map(async (business) => {
        const l = await this.loaded(userId, year, { person, business })
        return { ref: { person, business }, ...l, vatEntries: vatEntriesOf(l.ledger.chart, l.book?.ledger.entries ?? []) }
      }),
    )
    return loaded.filter((b) => b.profile !== null || b.book !== null)
  }
}
