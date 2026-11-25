// The figures the product promises to its users: limits, retention periods and the AI recipients. The
// API enforces them, the privacy text and the marketing website print them; all three read this one
// module, and `apps/api/src/common/product-limits.lock.test.ts` fails when an enforcing constant drifts
// away from it. Prices are not here: the amount lives in the Stripe price (`STRIPE_PRICE_ID`) and is
// shown on Stripe's checkout page before payment, so no text states a figure of its own.

const MIB = 1024 * 1024

export const PRODUCT_LIMITS = {
  /** One uploaded receipt file (`MAX_RECEIPT_FILE_BYTES`). */
  receiptFileBytes: 10 * MIB,
  /** Stored receipt files per account (`MAX_RECEIPT_FILES_PER_ACCOUNT`). */
  receiptFilesPerAccount: 2_000,
  /** Stored receipt bytes per account (`MAX_RECEIPT_BYTES_PER_ACCOUNT`). */
  receiptBytesPerAccount: 2 * 1024 * MIB,
  /** Receipt rows per account, with or without a file (`MAX_RECEIPTS_PER_ACCOUNT`). */
  receiptsPerAccount: 5_000,
  /** Receipt reads per account and day (`DEFAULT_PARSE_DAILY_LIMIT`). */
  receiptReadsPerDay: 300,
  /** Owl chat messages per account and minute (the chat route's throttle). */
  advisorMessagesPerMinute: 10,
  /** Owl conversations per account and tax year (`MAX_CONVERSATIONS_PER_YEAR`). */
  advisorConversationsPerYear: 50,
} as const

export const RETENTION = {
  /** A guest with no write for this long is erased (`GUEST_RETENTION_DAYS`). */
  guestDataDays: 30,
  /** Lifetime of the guest cookie `se_guest_session`. */
  guestCookieDays: 180,
  /** A signed-in session ends this long after its last use (`SESSION_IDLE_EXPIRES_IN_SECONDS`). */
  sessionIdleDays: 7,
  /** A signed-in session ends this long after sign-in however often it is used (`SESSION_ABSOLUTE_MAX_AGE_MS`). */
  sessionAbsoluteDays: 30,
  /** Daily database backups kept (`infra/gcp/main.tf`, `retained_backups`). */
  databaseBackups: 7,
  /** Point-in-time recovery window of the database (`transaction_log_retention_days`). */
  databasePitrDays: 7,
  /** Backups of the receipt-file key store (crypto-shredding reaches the receipt files after these expire). */
  keystoreBackups: 2,
  keystorePitrDays: 1,
  /**
   * Legal holds (built in P7): held records survive an account deletion until the period ends. Both periods
   * run from the end of the calendar year of the record (payment, submission).
   * Payments (`Unlock`): Buchungsbelege, eight years (§ 147 Abs. 1 Nr. 4, Abs. 3 AO; § 257 Abs. 1 Nr. 4, Abs. 4 HGB).
   * Submission versions (`FilingVersion`): the regular assessment period, four years (§ 169 Abs. 2 Satz 1 Nr. 2, § 170 AO).
   */
  legalHoldPaymentYears: 8,
  legalHoldFilingVersionYears: 4,
  /**
   * Every access-log row is deleted this long after it was written (`AUDIT_LOG_RETENTION_YEARS`), the
   * anonymised rows of deleted accounts included: the regular limitation period (§ 195, § 199 BGB) within
   * which an access may be questioned, rounded up to whole years from the row's date.
   */
  auditLogYears: 3,
  /** Expired sessions, expired or revoked assistant tokens and expired device logins are deleted this long after they ended. */
  endedLoginRecordDays: 30,
  /** ADR-0030: a never-verified account is deleted no sooner than this long after registration … */
  unverifiedAccountDays: 30,
  /** … and no sooner than this long after the warning e-mail went out (§3a). */
  unverifiedWarningDays: 7,
} as const

/** Where servers and database run (`infra/gcp/variables.tf`, default of `region`). */
export const HOSTING = { provider: 'Google Cloud', region: 'europe-west4', country: 'Niederlande' } as const

/** Who can receive data from a model call, as the privacy text and the owl consent name them. */
export interface ModelProvider {
  readonly id: 'google-genai' | 'anthropic' | 'openai'
  readonly company: string
  readonly product: string
  readonly country: string
}

/**
 * Every model provider the API can call (`AiProviderKind` without `deterministic`/`fake`): the chat, its
 * fallback slot, the topic guard and the document reading (`vision_ocr`) each pick one of these.
 */
export const MODEL_PROVIDERS: readonly ModelProvider[] = [
  { id: 'google-genai', company: 'Google', product: 'Gemini', country: 'USA' },
  { id: 'anthropic', company: 'Anthropic', product: 'Claude', country: 'USA' },
  { id: 'openai', company: 'OpenAI', product: 'GPT', country: 'USA' },
]

/** The figure as German copy prints it: `10 MB`, `2 GB`, `5.000`. */
export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / MIB)} MB`
}

export function formatGigabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * MIB))} GB`
}

export function formatCount(count: number): string {
  return count.toLocaleString('de-DE')
}

function joinGerman(items: readonly string[], conjunction: 'und' | 'oder'): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${conjunction} ${items.at(-1)}`
}

/** „Google (Gemini, USA), Anthropic (Claude, USA) und OpenAI (GPT, USA)“: who receives what the owl sends. */
export function modelProviderList(providers: readonly ModelProvider[] = MODEL_PROVIDERS): string {
  return joinGerman(providers.map((p) => `${p.company} (${p.product}, ${p.country})`), 'und')
}

/** „Google, Anthropic oder OpenAI“. */
export function modelCompanyList(providers: readonly ModelProvider[] = MODEL_PROVIDERS): string {
  return joinGerman(providers.map((p) => p.company), 'oder')
}
