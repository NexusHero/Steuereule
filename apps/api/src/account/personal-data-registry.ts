// The one declared list of every place that stores data about a person (P7, table 2 of the beta audit).
// Account deletion, the DSGVO export (JSON and PDF), the guest→account takeover and the guest sweep read
// their tables from here instead of keeping lists of their own; `test/personal-data-registry.lock.test.ts`
// fails for a Prisma model (main and keystore schema) that is missing, so a new table cannot silently
// outlive an erasure, stay out of the export or be left behind at sign-up.
//
// Order matters: deletion walks the entries top to bottom, so a child row comes before the row it points to.

/** How a row is tied to a person. */
export type PersonTie =
  /**
   * `userId` is the person (an account id or a guest id). The person's id set also holds every Person B
   * the person keeps without an own login: `spouse_<userId>_<year>` (ADR-0054), so those rows go with
   * the person on deletion and show in the person's export.
   */
  | 'userId'
  /** Nullable `userId` (better-auth and OAuth rows; a row without one belongs to nobody yet). */
  | 'optionalUserId'
  /** `User.id` itself. */
  | 'userPrimaryKey'
  /** TaxYearLink: `personAUserId` (the return's owner) and `personBUserId` (a spouse account or a shadow id). */
  | 'coupling'
  /** PartnerLink: `personAUserId`, `personBUserId`. */
  | 'partnerLink'
  /** `householdUserId` (person A's household); HouseholdPerson also `linkedUserId` (B's own account, API-23). */
  | 'household'
  /** Through a parent row (named in `note`). */
  | 'parentRow'
  /** Verification: `identifier` is the e-mail address or a session-bound step-up/reset key. */
  | 'emailIdentifier'
  /** Keystore UserDataKey: the account/guest id, or `household-person:<id>`. */
  | 'keystoreSubject'
  /** No personal data. */
  | 'none'

/** What account deletion (and therefore the guest sweep and the unverified-account sweep) does. */
export type DeletionTreatment =
  /** Generic: `deleteMany` over the person's id set, in registry order. */
  | { readonly kind: 'rows' }
  /** Generic, but rows under an active row hold (`LegalHold.resourceId`) stay until the hold ends. */
  | { readonly kind: 'rowsUnlessHeld' }
  /** A named step of `deleteAccountTransaction` (the tie is not a plain userId). */
  | { readonly kind: 'step'; readonly step: DeletionStep }
  /** Removed by a database cascade from the named parent. */
  | { readonly kind: 'cascade'; readonly from: string }
  /** Deliberately not deleted, with the reason. */
  | { readonly kind: 'kept'; readonly reason: string }
  | { readonly kind: 'none'; readonly reason: string }

export type DeletionStep = 'anonymiseAudit' | 'user' | 'deviceCodes' | 'coupling' | 'household' | 'keys'

/** What the DSGVO export (Art. 15/20) shows. */
export type ExportTreatment =
  /** Generic: every row of the person's id set, one entry each, under `area` (shadow rows marked Person B). */
  | { readonly kind: 'rows'; readonly area: string; readonly shadowOnly?: boolean }
  /** A section of its own, built by `ExportSection` (identity, sessions, household …). */
  | { readonly kind: 'section'; readonly section: ExportSection }
  | { readonly kind: 'none'; readonly reason: string }

export type ExportSection =
  | 'identity'
  | 'profile'
  | 'accessLog'
  | 'sessions'
  | 'security'
  | 'devices'
  | 'assistants'
  | 'coupling'
  | 'household'
  | 'receiptFiles'
  | 'legalHolds'

/** What the guest→account takeover at the first sign-in does with a guest's rows. */
export type TakeoverTreatment =
  /** Every row moves to the account. */
  | { readonly kind: 'moveAll' }
  /** The rows of the years the account has no data for move; the other years stay with the guest (swept). */
  | { readonly kind: 'moveYears' }
  /** One row per person: moves when the account has none. */
  | { readonly kind: 'moveIfAbsent' }
  /** A named step (re-encryption of receipt files, the coupling). */
  | { readonly kind: 'step'; readonly step: TakeoverStep }
  /** A guest cannot write it (the route needs an account, or the row is the account itself). */
  | { readonly kind: 'accountOnly'; readonly reason: string }
  | { readonly kind: 'none'; readonly reason: string }

export type TakeoverStep = 'receipts' | 'coupling'

/** Which legal hold can keep the row. */
export type HoldTreatment =
  /** A hold on this one row (`LegalHold.resource` = the entry's `holdResource`, `resourceId` = the row id). */
  | 'row'
  /** An operator's category hold (`LegalHold.resource` = this value, `resourceId` null). */
  | 'taxData'
  | 'profile'
  | 'auditLog'
  | 'none'

export interface PersonalDataEntry {
  /** The Prisma model name (main schema) or `keystore.UserDataKey`. */
  readonly model: string
  readonly personalData: boolean
  readonly tie: PersonTie
  readonly deletion: DeletionTreatment
  readonly export: ExportTreatment
  readonly takeover: TakeoverTreatment
  readonly hold: HoldTreatment
  /** For `hold: 'row'`: the `LegalHold.resource` value. */
  readonly holdResource?: string
  readonly note?: string
}

const rows = { kind: 'rows' } as const
const accountRoute = (route: string): TakeoverTreatment => ({ kind: 'accountOnly', reason: `${route} requires an account (@RequiresAccount)` })
const ACCOUNT_ONLY = accountRoute('every route writing it')
const cascadeUser = { kind: 'cascade', from: 'User' } as const

function taxTable(model: string, area: string, takeover: TakeoverTreatment = ACCOUNT_ONLY): PersonalDataEntry {
  return { model, personalData: true, tie: 'userId', deletion: rows, export: { kind: 'rows', area }, takeover, hold: 'taxData' }
}

export const PERSONAL_DATA_REGISTRY: readonly PersonalDataEntry[] = [
  // --- Identity and profile -------------------------------------------------------------------
  {
    model: 'Profile',
    personalData: true,
    tie: 'userId',
    deletion: rows,
    // The account's own profile is the export's `profile` block; Person B profiles kept by A are rows.
    export: { kind: 'rows', area: 'Profil', shadowOnly: true },
    takeover: { kind: 'moveIfAbsent' },
    hold: 'profile',
  },
  {
    model: 'GuestActivity',
    personalData: false,
    tie: 'userId',
    deletion: { kind: 'kept', reason: 'the guest retention clock: the guest sweep drops it after the erasure (ADR-0109)' },
    export: { kind: 'none', reason: 'only a guest id and a timestamp, no data about the person' },
    takeover: { kind: 'none', reason: 'the guest clock runs out; the sweep then erases what the takeover left behind' },
    hold: 'none',
  },
  // --- Tax data (deleted in this order: children before parents) --------------------------------
  taxTable('TaxYear', 'Steuerjahr', { kind: 'moveYears' }),
  taxTable('InterviewAnswer', 'Interview-Antwort', { kind: 'moveYears' }),
  {
    model: 'ReceiptFile',
    personalData: true,
    tie: 'userId',
    deletion: rows,
    // Metadata in the tax data, the original files themselves in their own section (H2-6).
    export: { kind: 'section', section: 'receiptFiles' },
    takeover: { kind: 'step', step: 'receipts' },
    hold: 'taxData',
    note: 'bytes encrypted under the per-user DEK in the keystore (ADR-0059); AAD binds them to userId',
  },
  taxTable('Receipt', 'Beleg', { kind: 'step', step: 'receipts' }),
  taxTable('Lstb', 'Lohnsteuerbescheinigung'),
  taxTable('ChSalaryCertificate', 'Lohnausweis (CH)'),
  taxTable('Pension', 'Rente'),
  taxTable('Capital', 'Kapitalerträge'),
  taxTable('Commute', 'Arbeitsweg'),
  taxTable('RentalProperty', 'Vermietungsobjekt'),
  taxTable('Assessment', 'Steuerbescheid'),
  {
    model: 'FilingVersion',
    personalData: true,
    tie: 'userId',
    deletion: { kind: 'rowsUnlessHeld' },
    export: { kind: 'rows', area: 'Eingereichte Fassung' },
    takeover: accountRoute('POST …/abgabe'),
    hold: 'row',
    holdResource: 'filingVersion',
    note: 'held 4 years from the end of the submission year (§ 169, § 170 AO; RETENTION.legalHoldFilingVersionYears)',
  },
  taxTable('Marking', 'Herkunft und Bestätigung', { kind: 'moveYears' }),
  taxTable('YearTakeover', 'Jahresübernahme'),
  taxTable('MasterData', 'Erklärungs-Stammdaten', { kind: 'moveIfAbsent' }),
  taxTable('Child', 'Kind'),
  taxTable('OwlSetting', 'Eulen-Modus-Einstellung'),
  taxTable('OwlCardDismissal', 'Eulen-Modus-Kartenverwurf'),
  taxTable('OwlPersonalDataConsent', 'Eulen-Einwilligung Personendaten'),
  // After its messages: they reference the conversation (#481).
  taxTable('AdvisorChatMessage', 'Steuerberater-Chat'),
  taxTable('AdvisorConversation', 'Steuerberater-Chat (Gespräche)'),
  taxTable('AdvisorNote', 'Steuerberater-Chat (Projektnotizen)'),
  taxTable('AdvisorSituation', 'Steuerberater-Chat (Unsere Situation)'),
  taxTable('AdvisorInterview', 'Steuerberater-Chat (Stand des Interviews)'),
  taxTable('AssistantTask', 'Aufgabe vom Assistenten'),
  // ADR-0101: lines before their entries, entries, log and bank transactions before their book (FKs). The
  // append-only trigger lets these deletes through only under the erasure flag (`allowErasure`).
  taxTable('JournalLine', 'Buchungszeile'),
  taxTable('JournalEntry', 'Buchung'),
  taxTable('LedgerLogRecord', 'Buchungsprotokoll'),
  taxTable('BankTransaction', 'Kontoumsatz'),
  taxTable('Ledger', 'Buch'),
  taxTable('FixedAsset', 'Anlagegut'),
  taxTable('BookingRule', 'Buchungsregel'),
  taxTable('PayrollRun', 'Lohnlauf'),
  taxTable('BusinessProfile', 'Betrieb'),
  {
    model: 'Unlock',
    personalData: true,
    tie: 'userId',
    deletion: { kind: 'rowsUnlessHeld' },
    export: { kind: 'rows', area: 'Zahlung (Freischaltung)' },
    takeover: accountRoute('POST …/freischaltung (a guest cannot pay)'),
    hold: 'row',
    holdResource: 'unlock',
    note: 'a paid row is held 8 years from the end of the payment year (§ 147 AO, § 257 HGB; RETENTION.legalHoldPaymentYears); no FK to User',
  },
  // --- Partner and household ------------------------------------------------------------------
  {
    model: 'TaxYearLink',
    personalData: true,
    tie: 'coupling',
    deletion: { kind: 'step', step: 'coupling' },
    export: { kind: 'section', section: 'coupling' },
    takeover: { kind: 'step', step: 'coupling' },
    hold: 'taxData',
    note: "A's rows go with A; where the person is B, B's id is replaced by A's shadow id and A keeps the year (API-22)",
  },
  {
    model: 'HouseholdMergeCandidate',
    personalData: true,
    tie: 'household',
    deletion: { kind: 'step', step: 'household' },
    export: { kind: 'section', section: 'household' },
    takeover: accountRoute('GET /v1/haushalt'),
    hold: 'taxData',
  },
  {
    model: 'HouseholdPerson',
    personalData: true,
    tie: 'household',
    deletion: { kind: 'step', step: 'household' },
    export: { kind: 'section', section: 'household' },
    takeover: accountRoute('GET /v1/haushalt'),
    hold: 'taxData',
    note: "the household's people, and B's own facts copied into A's household (linkedUserId, API-23)",
  },
  {
    model: 'TaxYearMembership',
    personalData: true,
    tie: 'parentRow',
    deletion: { kind: 'cascade', from: 'HouseholdPerson' },
    export: { kind: 'section', section: 'household' },
    takeover: accountRoute('GET /v1/haushalt'),
    hold: 'taxData',
    note: 'via personId → HouseholdPerson',
  },
  {
    model: 'PartnerLink',
    personalData: true,
    tie: 'partnerLink',
    deletion: { kind: 'step', step: 'household' },
    export: { kind: 'section', section: 'coupling' },
    takeover: accountRoute('POST …/kopplung/beitreten'),
    hold: 'taxData',
  },
  // --- Login, devices, assistants -------------------------------------------------------------
  {
    model: 'DeviceCode',
    personalData: true,
    tie: 'optionalUserId',
    deletion: { kind: 'step', step: 'deviceCodes' },
    export: { kind: 'section', section: 'devices' },
    takeover: accountRoute('the approving phone is signed in'),
    hold: 'none',
    note: 'a row without userId was never approved: swept after it expired (lifecycle sweep)',
  },
  { model: 'Session', personalData: true, tie: 'userId', deletion: cascadeUser, export: { kind: 'section', section: 'sessions' }, takeover: ACCOUNT_ONLY, hold: 'none' },
  { model: 'Account', personalData: true, tie: 'userId', deletion: cascadeUser, export: { kind: 'section', section: 'identity' }, takeover: ACCOUNT_ONLY, hold: 'none' },
  {
    model: 'Verification',
    personalData: true,
    tie: 'emailIdentifier',
    deletion: { kind: 'step', step: 'user' },
    export: { kind: 'none', reason: 'one-time tokens that expire within 30 minutes; exporting them would hand out a way in' },
    takeover: ACCOUNT_ONLY,
    hold: 'none',
  },
  { model: 'TwoFactor', personalData: true, tie: 'userId', deletion: cascadeUser, export: { kind: 'section', section: 'security' }, takeover: ACCOUNT_ONLY, hold: 'none', note: 'export says whether 2FA is on, never the secret or backup codes' },
  { model: 'Passkey', personalData: true, tie: 'userId', deletion: cascadeUser, export: { kind: 'section', section: 'security' }, takeover: ACCOUNT_ONLY, hold: 'none' },
  { model: 'OauthClient', personalData: true, tie: 'optionalUserId', deletion: cascadeUser, export: { kind: 'section', section: 'assistants' }, takeover: ACCOUNT_ONLY, hold: 'none', note: 'a client without userId registered itself (RFC 7591); swept after 7 days without consent' },
  { model: 'OauthConsent', personalData: true, tie: 'optionalUserId', deletion: cascadeUser, export: { kind: 'section', section: 'assistants' }, takeover: ACCOUNT_ONLY, hold: 'none' },
  { model: 'OauthAccessToken', personalData: true, tie: 'optionalUserId', deletion: cascadeUser, export: { kind: 'section', section: 'assistants' }, takeover: ACCOUNT_ONLY, hold: 'none', note: 'export: scopes and dates only, never the token' },
  { model: 'OauthRefreshToken', personalData: true, tie: 'userId', deletion: cascadeUser, export: { kind: 'section', section: 'assistants' }, takeover: ACCOUNT_ONLY, hold: 'none', note: 'export: scopes and dates only, never the token' },
  {
    model: 'OauthResource',
    personalData: false,
    tie: 'none',
    deletion: { kind: 'none', reason: 'seeded catalogue of protected resources' },
    export: { kind: 'none', reason: 'no personal data' },
    takeover: { kind: 'none', reason: 'no personal data' },
    hold: 'none',
  },
  {
    model: 'OauthClientResource',
    personalData: false,
    tie: 'parentRow',
    deletion: { kind: 'cascade', from: 'OauthClient' },
    export: { kind: 'none', reason: 'which resource a client may ask for: client metadata, no personal data' },
    takeover: { kind: 'none', reason: 'no personal data' },
    hold: 'none',
  },
  {
    model: 'OauthClientAssertion',
    personalData: false,
    tie: 'none',
    deletion: { kind: 'none', reason: 'replay ids of client assertions (RFC 7523), no person' },
    export: { kind: 'none', reason: 'no personal data' },
    takeover: { kind: 'none', reason: 'no personal data' },
    hold: 'none',
  },
  {
    model: 'Jwks',
    personalData: false,
    tie: 'none',
    deletion: { kind: 'none', reason: 'the server signing keys' },
    export: { kind: 'none', reason: 'no personal data' },
    takeover: { kind: 'none', reason: 'no personal data' },
    hold: 'none',
  },
  // --- Records that outlive the person's rows ---------------------------------------------------
  {
    model: 'TaxDataAccessLog',
    personalData: true,
    tie: 'userId',
    deletion: { kind: 'step', step: 'anonymiseAudit' },
    export: { kind: 'section', section: 'accessLog' },
    takeover: { kind: 'moveAll' },
    hold: 'auditLog',
    note: 'anonymised to a tombstone on deletion (ADR-0013); every row is deleted after RETENTION.auditLogYears',
  },
  {
    model: 'LegalHold',
    personalData: true,
    tie: 'userId',
    deletion: { kind: 'kept', reason: 'the retention record itself — it must outlive the erasure it justifies; the hold sweep removes it when it ends' },
    export: { kind: 'section', section: 'legalHolds' },
    takeover: { kind: 'none', reason: 'a guest has no payment or submission to hold' },
    hold: 'none',
  },
  {
    model: 'User',
    personalData: true,
    tie: 'userPrimaryKey',
    deletion: { kind: 'step', step: 'user' },
    export: { kind: 'section', section: 'identity' },
    takeover: { kind: 'accountOnly', reason: 'the account itself' },
    hold: 'none',
  },
  {
    model: 'keystore.UserDataKey',
    personalData: true,
    tie: 'keystoreSubject',
    deletion: { kind: 'step', step: 'keys' },
    export: { kind: 'none', reason: 'key material; the files it opens are in the export decrypted' },
    takeover: { kind: 'step', step: 'receipts' },
    hold: 'taxData',
    note: 'destroyed first (crypto-shredding, ADR-0059); kept while tax data is held',
  },
]

/**
 * Stores outside the two Prisma schemas (table 2, rows 61–69). Not enumerable from a schema, so listed by
 * hand; each has a TTL or bound instead of a deletion path.
 */
export const NON_DATABASE_STORES: readonly { readonly store: string; readonly lifecycle: string }[] = [
  { store: 'Redis rate-limit keys (e-mail, address, userId)', lifecycle: 'TTL ≤ 24 h (rate-limit-storage.ts)' },
  { store: 'Redis owl-run streams', lifecycle: 'TTL 15 min / 5 min, events sealed with AES-256-GCM (H2-9)' },
  { store: 'Process: printout jobs', lifecycle: 'TTL 10 min' },
  { store: 'Process: MCP sessions and counters', lifecycle: 'forgotten when idle' },
  { store: 'Process: owl-run log without Redis', lifecycle: '5 min' },
  { store: 'Process: guest activity notes', lifecycle: 'cleared at 10,000 entries' },
  { store: 'Process: upload admission', lifecycle: 'only during the upload' },
  { store: 'Telemetry spans (user.id attribute)', lifecycle: 'no exporter registered in src (telemetry/tracer.ts)' },
  { store: 'Error log (Cloud Logging)', lifecycle: '30 days (Google Cloud Logging default), no bodies (ADR-0109 §8)' },
]

export const SHADOW_PREFIX = 'spouse_'
/** The first tax year a route accepts (`ParseTaxYearPipe`). */
const FIRST_TAX_YEAR = 2000

export function shadowIdOf(userId: string, taxYear: number): string {
  return `${SHADOW_PREFIX}${userId}_${taxYear}`
}

export function isShadowId(id: string): boolean {
  return id.startsWith(SHADOW_PREFIX)
}

/** The account a shadow id belongs to (`spouse_<userId>_<year>` → userId); any other id is its own owner. */
export function ownerOf(id: string): string {
  if (!isShadowId(id)) return id
  const rest = id.slice(SHADOW_PREFIX.length)
  const cut = rest.lastIndexOf('_')
  return cut > 0 ? rest.slice(0, cut) : rest
}

/**
 * The person's id set: the id itself and every shadow id of a Person B the person may keep (one per tax
 * year a route accepts). Shadow ids are deterministic, so no row has to remember them: a shadow left behind
 * by a switch to a single return, or by B joining with an own account, is still found here.
 */
export function personIds(userId: string, now = new Date()): string[] {
  if (isShadowId(userId)) return [userId]
  const ids = [userId]
  for (let year = FIRST_TAX_YEAR; year <= now.getUTCFullYear() + 1; year += 1) ids.push(shadowIdOf(userId, year))
  return ids
}

export function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

export function entriesWhere(predicate: (entry: PersonalDataEntry) => boolean): readonly PersonalDataEntry[] {
  return PERSONAL_DATA_REGISTRY.filter(predicate)
}

/** The entries account deletion removes generically, in deletion order. */
export function genericDeletionEntries(): readonly PersonalDataEntry[] {
  return entriesWhere((entry) => entry.deletion.kind === 'rows' || entry.deletion.kind === 'rowsUnlessHeld')
}
