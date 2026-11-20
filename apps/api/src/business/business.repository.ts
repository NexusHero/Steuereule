import type { ChartOfAccounts, BookkeepingMode, JournalEntry, Ledger, LogRecord } from '@steuereule/core'

export type BusinessPerson = 'A' | 'B'

/** One business of one person (ADR-0101 §22): the person and the business number, from 1. */
export interface BusinessRef {
  readonly person: BusinessPerson
  readonly business: number
}

export const FIRST_BUSINESS = 1

/** The person's first business: where the person-wide facts (losses, partnership shares) live. */
export const firstBusinessOf = (person: BusinessPerson): BusinessRef => ({ person, business: FIRST_BUSINESS })

/** The stored business profile; JSON columns are decrypted strings, parsed by the service. */
export interface BusinessProfileRecord {
  readonly id: string
  readonly userId: string
  readonly taxYear: number
  readonly person: BusinessPerson
  readonly business: number
  readonly kind: 'freiberuf' | 'gewerbe' | null
  readonly professionAnswers: string | null
  readonly suggestion: string | null
  readonly name: string | null
  readonly mode: BookkeepingMode
  readonly chart: ChartOfAccounts
  readonly smallBusiness: boolean
  readonly vatMethod: 'ist' | 'soll'
  readonly municipalityAgs: string | null
  readonly multiplierOverride: string | null
  readonly startDate: string | null
  readonly vatPrepayments: string | null
  /** JSON of the Voranmeldung facts (period, Dauerfristverlängerung, Sondervorauszahlung), ADR-0101 §22. */
  readonly vatPeriodFacts: string | null
  /** JSON of the § 16 / § 34 facts. */
  readonly disposalFacts: string | null
  /** JSON of the § 34a facts. */
  readonly retainedFacts: string | null
  readonly tradeTaxInputs: string | null
  readonly lossFacts: string | null
  readonly partnershipShares: string | null
  readonly procedureDoc: string | null
}

/** What a save may change; undefined keeps what is stored. */
export type BusinessProfilePatch = Partial<Omit<BusinessProfileRecord, 'id' | 'userId' | 'taxYear' | 'person' | 'business'>>

export interface BookRecord {
  readonly id: string
  readonly chart: ChartOfAccounts
  readonly mode: BookkeepingMode
  readonly lockedThrough: string | null
}

/** A book as the core sees it, with its log and the origin of each entry. */
export interface LoadedBook {
  readonly book: BookRecord
  readonly ledger: Ledger
  readonly log: readonly LogRecord[]
  /** Entry number → origin ("nutzer", "eule:<ref>", "bank:<id>", "beleg:<id>", "afa:<id>", "eb"). */
  readonly sources: ReadonlyMap<number, string>
  /** Entry number → the accepted booking draft it was posted from (owl, receipt). */
  readonly drafts: ReadonlyMap<number, string>
}

/** What a change of the book appends: entries (in number order) with their origin, log records, a new lock. */
export interface BookAppend {
  readonly entries?: readonly { readonly entry: JournalEntry; readonly source: string; readonly draft?: string }[]
  readonly log?: readonly LogRecord[]
  readonly lockedThrough?: string
  /** Fixed assets the entries capitalise: written in the same transaction, so an entry never stands without its asset. */
  readonly assets?: readonly NewFixedAsset[]
}

export interface FixedAssetRecord {
  readonly id: string
  readonly taxYear: number
  readonly person: BusinessPerson
  readonly business: number
  readonly label: string
  readonly account: string
  readonly acquisitionDate: string
  /** Net cost in cents. */
  readonly acquisitionCost: number
  readonly method: string
  readonly category: string | null
  readonly usefulLifeYears: number | null
  /** JSON `{ byYear: { [year]: cents }, costReduction: cents }`. */
  readonly specialDepreciation: string | null
  /** JSON `{ date, proceedsCents }`. */
  readonly disposal: string | null
}

export type NewFixedAsset = Omit<FixedAssetRecord, 'id'>

export interface BankTransactionRecord {
  readonly id: string
  readonly fingerprint: string
  /** Signed cents. */
  readonly amount: number
  /** JSON of the core BankTransaction without the amount. */
  readonly details: string
  readonly status: 'offen' | 'gebucht' | 'ignoriert'
  readonly entryNumber: number | null
}

export interface BookingRuleRecord {
  readonly id: string
  readonly person: BusinessPerson
  /** JSON `{ counterpartyIban?, counterpartyNameContains?, referenceContains?, direction? }`. */
  readonly criteria: string
  readonly account: string
  readonly taxKey: string
  readonly text: string | null
}

export const BUSINESS_REPOSITORY = Symbol('BUSINESS_REPOSITORY')

/** Persistence of the self-employment path (ADR-0101); every call is scoped to the trusted userId. */
export interface BusinessRepository {
  findProfile(userId: string, taxYear: number, ref: BusinessRef): Promise<BusinessProfileRecord | null>
  /** Every business of the person in the year, by number. */
  listProfiles(userId: string, taxYear: number, person: BusinessPerson): Promise<BusinessProfileRecord[]>
  saveProfile(userId: string, taxYear: number, ref: BusinessRef, patch: BusinessProfilePatch): Promise<BusinessProfileRecord>
  /** Removes a business profile; the service allows it only for a further business without a book. */
  deleteProfile(userId: string, taxYear: number, ref: BusinessRef): Promise<void>

  /** The book with its entries and log, or null when nothing was booked yet. */
  loadBook(userId: string, taxYear: number, ref: BusinessRef): Promise<LoadedBook | null>
  /**
   * Runs `work` on the current book in one transaction with the book row locked, so numbers and the
   * hash chain stay gapless under concurrent requests; creates the book with `chart`/`mode` first.
   */
  changeBook<T>(
    userId: string,
    taxYear: number,
    ref: BusinessRef,
    frame: { readonly chart: ChartOfAccounts; readonly mode: BookkeepingMode },
    work: (book: LoadedBook) => { readonly result: T; readonly append: BookAppend } | Promise<{ readonly result: T; readonly append: BookAppend }>,
  ): Promise<T>

  listAssets(userId: string, ref: BusinessRef, throughYear: number): Promise<FixedAssetRecord[]>
  createAsset(userId: string, asset: NewFixedAsset): Promise<FixedAssetRecord>
  setAssetDisposal(userId: string, assetId: string, disposal: string): Promise<FixedAssetRecord | null>

  listBankTransactions(userId: string, taxYear: number, ref: BusinessRef): Promise<BankTransactionRecord[]>
  /** Inserts the transactions whose fingerprint is new for the book; returns how many were new. */
  addBankTransactions(
    userId: string,
    taxYear: number,
    ref: BusinessRef,
    frame: { readonly chart: ChartOfAccounts; readonly mode: BookkeepingMode },
    transactions: readonly { readonly fingerprint: string; readonly amount: number; readonly details: string }[],
  ): Promise<number>
  setBankTransactionStatus(userId: string, id: string, status: BankTransactionRecord['status'], entryNumber: number | null): Promise<void>

  listRules(userId: string, person: BusinessPerson): Promise<BookingRuleRecord[]>
  createRule(userId: string, rule: Omit<BookingRuleRecord, 'id'>): Promise<BookingRuleRecord>
}

/** The account holder's first business: where owl drafts and receipts are booked (ADR-0101 §22). */
export const OWN_FIRST_BUSINESS: BusinessRef = firstBusinessOf('A')
