// #325 — the expected-set control for ADR-0008's encrypted-column set.
//
// prisma-field-encryption's own doc-comment regex is unanchored and has no negation
// awareness (installed `prisma-field-encryption@1.6.0`, dist/dmmf.js:78):
//
//   const encryptedAnnotationRegex = /@encrypted(?<query>\?[\w=&]+)?/
//
// It is matched against a field's *entire* `///` documentation string. A doc comment
// that merely *explains* why a field is NOT encrypted, but happens to contain the
// literal string "@encrypted" while doing so, silently becomes the annotation — the
// column gets encrypted. Nothing fails at `prisma generate`, at boot, or in any type;
// the failure is invisible in a code review, because a prose comment about encryption
// reads as documentation, not as a directive. See #325 for the full account (found
// building #318's InterviewAnswer model, fixed there before it landed on `main`).
//
// This test does NOT read schema.prisma's comment text and does NOT try to guess
// intent from prose (that "looser form" was proposed and explicitly declined per
// Musti's #325 ruling, aligned with ADR-0028: a check should aim at the hazard, not
// at something upstream of it). Instead it derives the *actual* encrypted/hashed
// field set the exact way prisma-field-encryption itself does — from `Prisma.dmmf`,
// the same object ENCRYPTED_PRISMA's fieldEncryptionExtension() reads at runtime —
// and asserts it against a checked-in expected list below. Any unintended change to
// the encrypted/hashed set, from this trap or any other cause, turns this red.
//
// Red path proof (see #325's PR/commit for the measured run): temporarily add
// `@encrypted` anywhere in a `///` doc comment on a field not in the expected list
// below (or remove an expected entry) and this test fails; revert and it is green
// again.
import { Prisma } from '@prisma/client'
import { analyseDMMF } from 'prisma-field-encryption/dist/dmmf.js'
import { describe, expect, it } from 'vitest'

interface ExpectedField {
  model: string
  field: string
}

interface ExpectedEncryptedField extends ExpectedField {
  encrypt: boolean
  strictDecryption: boolean
}

interface ExpectedHashedField extends ExpectedField {
  // `targetField` is the actual column that materialises in Postgres (e.g.
  // "steuerIdHash") — analyseDMMF attaches hash config to the SOURCE field
  // (`modelDescriptor.fields[hashConfig.sourceField].hash = hash`, dist/dmmf.js:64),
  // so `field` alone names the encrypted column, not the hash column it protects.
  targetField: string
  algorithm: string
  // Deliberately NOT asserting `hash.salt` here: parseHashAnnotation resolves it from
  // `process.env.PRISMA_FIELD_ENCRYPTION_HASH_SALT` at analyse time (dist/dmmf.js:132),
  // so asserting it would make this test's verdict depend on the CI environment rather
  // than on the schema.
}

function byModelField(a: ExpectedField, b: ExpectedField): number {
  return `${a.model}.${a.field}`.localeCompare(`${b.model}.${b.field}`)
}

// The full, intended encrypted-column set (ADR-0008). Update this list in the SAME
// commit as any intentional change to what schema.prisma encrypts — that is the
// entire point: an unintended change to this set, from any cause, must go red here.
const EXPECTED_ENCRYPTED_FIELDS: ExpectedEncryptedField[] = [
  // ADR-0101: the business, the book, its assets, the bank import and the booking rules.
  { model: 'BusinessProfile', field: 'professionAnswers', encrypt: true, strictDecryption: true },
  { model: 'BusinessProfile', field: 'suggestion', encrypt: true, strictDecryption: true },
  { model: 'BusinessProfile', field: 'name', encrypt: true, strictDecryption: true },
  { model: 'BusinessProfile', field: 'municipalityAgs', encrypt: true, strictDecryption: true },
  { model: 'BusinessProfile', field: 'multiplierOverride', encrypt: true, strictDecryption: true },
  { model: 'BusinessProfile', field: 'startDate', encrypt: true, strictDecryption: true },
  { model: 'BusinessProfile', field: 'vatPrepayments', encrypt: true, strictDecryption: true },
  { model: 'BusinessProfile', field: 'vatPeriodFacts', encrypt: true, strictDecryption: true },
  { model: 'BusinessProfile', field: 'disposalFacts', encrypt: true, strictDecryption: true },
  { model: 'BusinessProfile', field: 'retainedFacts', encrypt: true, strictDecryption: true },
  { model: 'PayrollRun', field: 'employee', encrypt: true, strictDecryption: true },
  { model: 'PayrollRun', field: 'amounts', encrypt: true, strictDecryption: true },
  { model: 'BusinessProfile', field: 'tradeTaxInputs', encrypt: true, strictDecryption: true },
  { model: 'BusinessProfile', field: 'lossFacts', encrypt: true, strictDecryption: true },
  { model: 'BusinessProfile', field: 'partnershipShares', encrypt: true, strictDecryption: true },
  { model: 'BusinessProfile', field: 'procedureDoc', encrypt: true, strictDecryption: true },
  { model: 'JournalEntry', field: 'documentNumber', encrypt: true, strictDecryption: true },
  { model: 'JournalEntry', field: 'receiptRef', encrypt: true, strictDecryption: true },
  { model: 'JournalEntry', field: 'counterpartyVatId', encrypt: true, strictDecryption: true },
  { model: 'JournalEntry', field: 'text', encrypt: true, strictDecryption: true },
  { model: 'JournalEntry', field: 'regularPayment', encrypt: true, strictDecryption: true },
  { model: 'JournalEntry', field: 'draft', encrypt: true, strictDecryption: true },
  { model: 'JournalLine', field: 'amount', encrypt: true, strictDecryption: true },
  { model: 'LedgerLogRecord', field: 'payload', encrypt: true, strictDecryption: true },
  { model: 'FixedAsset', field: 'label', encrypt: true, strictDecryption: true },
  { model: 'FixedAsset', field: 'acquisitionDate', encrypt: true, strictDecryption: true },
  { model: 'FixedAsset', field: 'acquisitionCost', encrypt: true, strictDecryption: true },
  { model: 'FixedAsset', field: 'specialDepreciation', encrypt: true, strictDecryption: true },
  { model: 'FixedAsset', field: 'disposal', encrypt: true, strictDecryption: true },
  { model: 'FixedAsset', field: 'buildingFacts', encrypt: true, strictDecryption: true },
  { model: 'FixedAsset', field: 'vatCorrection', encrypt: true, strictDecryption: true },
  { model: 'BankTransaction', field: 'amount', encrypt: true, strictDecryption: true },
  { model: 'BankTransaction', field: 'details', encrypt: true, strictDecryption: true },
  { model: 'BookingRule', field: 'criteria', encrypt: true, strictDecryption: true },
  { model: 'BookingRule', field: 'text', encrypt: true, strictDecryption: true },
  { model: 'MasterData', field: 'geburtsdatum', encrypt: true, strictDecryption: true },
  { model: 'MasterData', field: 'strasse', encrypt: true, strictDecryption: true },
  { model: 'MasterData', field: 'hausnummer', encrypt: true, strictDecryption: true },
  { model: 'MasterData', field: 'hausnummerZusatz', encrypt: true, strictDecryption: true },
  { model: 'MasterData', field: 'plz', encrypt: true, strictDecryption: true },
  { model: 'MasterData', field: 'wohnort', encrypt: true, strictDecryption: true },
  { model: 'MasterData', field: 'beruf', encrypt: true, strictDecryption: true },
  { model: 'MasterData', field: 'religion', encrypt: true, strictDecryption: true },
  { model: 'MasterData', field: 'familienstand', encrypt: true, strictDecryption: true },
  { model: 'MasterData', field: 'familienstandSeit', encrypt: true, strictDecryption: true },
  { model: 'MasterData', field: 'iban', encrypt: true, strictDecryption: true },
  { model: 'MasterData', field: 'kontoinhaber', encrypt: true, strictDecryption: true },
  { model: 'MasterData', field: 'finanzamt', encrypt: true, strictDecryption: true },
  { model: 'MasterData', field: 'telefon', encrypt: true, strictDecryption: true },
  // ADR-0107 H3: the legal name is now field-encrypted too (non-strict — pre-existing columns, so
  // reads decrypt-or-pass-through during migration, unlike the strict steuerId/steuernummer).
  { model: 'Profile', field: 'firstName', encrypt: true, strictDecryption: false },
  { model: 'Profile', field: 'lastName', encrypt: true, strictDecryption: false },
  { model: 'Profile', field: 'steuerId', encrypt: true, strictDecryption: true },
  { model: 'Profile', field: 'steuernummer', encrypt: true, strictDecryption: true },
  { model: 'InterviewAnswer', field: 'value', encrypt: true, strictDecryption: true },
  { model: 'Receipt', field: 'fileName', encrypt: true, strictDecryption: true },
  // ADR-0092: whose the document is (A, B or a child) — a family relation.
  { model: 'Receipt', field: 'holders', encrypt: true, strictDecryption: true },
  { model: 'Lstb', field: 'bruttoarbeitslohn', encrypt: true, strictDecryption: true },
  { model: 'Lstb', field: 'lohnsteuer', encrypt: true, strictDecryption: true },
  { model: 'Lstb', field: 'sozialversicherung', encrypt: true, strictDecryption: true },
  { model: 'Lstb', field: 'kirchensteuer', encrypt: true, strictDecryption: true },
  { model: 'Lstb', field: 'kirchensteuerEhegatte', encrypt: true, strictDecryption: true },
  { model: 'Lstb', field: 'zuschuesseKvPv', encrypt: true, strictDecryption: true },
  { model: 'Lstb', field: 'rvArbeitnehmer', encrypt: true, strictDecryption: true },
  { model: 'Lstb', field: 'rvArbeitgeber', encrypt: true, strictDecryption: true },
  { model: 'Lstb', field: 'kvArbeitnehmer', encrypt: true, strictDecryption: true },
  { model: 'Lstb', field: 'pvArbeitnehmer', encrypt: true, strictDecryption: true },
  { model: 'Lstb', field: 'avArbeitnehmer', encrypt: true, strictDecryption: true },
  { model: 'Lstb', field: 'zuschussPv', encrypt: true, strictDecryption: true },
  { model: 'Lstb', field: 'solidaritaetszuschlag', encrypt: true, strictDecryption: true },
  // ADR-0099 §8: the employer on the certificate.
  { model: 'Lstb', field: 'arbeitgeber', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'lohn', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'gehaltsnebenleistungen', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'irregularBenefits', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'kapitalleistungen', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'beteiligungsrechte', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'sitzungsgelder', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'otherBenefits', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'grossWageTotal', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'ahvContributions', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'occupationalPension', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'nettolohn', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'quellensteuer', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'spesen', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'otherFringeBenefits', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'bemerkungen', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'saeule3aChf', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'krankenkasseChf', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'krankenkasseZusatzChf', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'arbeitgeberName', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'arbeitgeberStrasse', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'arbeitgeberPlzOrt', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'familienzulagenChf', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'krankentaggeldChf', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'pkArbeitnehmerChf', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'pkArbeitgeberChf', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'pkArbeitgeberGesamtChf', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'steuerfreiesKrankentaggeldChf', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'steuerfreiesUnfalltaggeldChf', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'taggeldQuelle', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'krankentaggeldArbeitgeberProzent', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'krankentaggeldArbeitgeberChf', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'nbuvArbeitgeberProzent', encrypt: true, strictDecryption: true },
  { model: 'ChSalaryCertificate', field: 'nbuvArbeitgeberChf', encrypt: true, strictDecryption: true },
  { model: 'Pension', field: 'jahresbetrag', encrypt: true, strictDecryption: true },
  { model: 'Pension', field: 'rentenbeginnJahr', encrypt: true, strictDecryption: true },
  { model: 'Pension', field: 'alterBeiRentenbeginn', encrypt: true, strictDecryption: true },
  { model: 'Capital', field: 'kapitalertraege', encrypt: true, strictDecryption: true },
  { model: 'Capital', field: 'sparerPauschbetrag', encrypt: true, strictDecryption: true },
  { model: 'Capital', field: 'kapitalertragsteuer', encrypt: true, strictDecryption: true },
  { model: 'Capital', field: 'solidaritaetszuschlag', encrypt: true, strictDecryption: true },
  { model: 'Capital', field: 'kirchensteuer', encrypt: true, strictDecryption: true },
  { model: 'Commute', field: 'workplace', encrypt: true, strictDecryption: true },
  { model: 'Commute', field: 'secondWorkplace', encrypt: true, strictDecryption: true },
  { model: 'Commute', field: 'professionalBodiesEur', encrypt: true, strictDecryption: true },
  { model: 'Commute', field: 'professionalBodiesNote', encrypt: true, strictDecryption: true },
  { model: 'Commute', field: 'workEquipmentEur', encrypt: true, strictDecryption: true },
  { model: 'Commute', field: 'workEquipmentNote', encrypt: true, strictDecryption: true },
  { model: 'Commute', field: 'accountFeesEur', encrypt: true, strictDecryption: true },
  { model: 'Commute', field: 'otherWorkExpensesEur', encrypt: true, strictDecryption: true },
  { model: 'Commute', field: 'otherWorkExpensesNote', encrypt: true, strictDecryption: true },
  { model: 'Marking', field: 'proposalValue', encrypt: true, strictDecryption: true },
  { model: 'RentalProperty', field: 'mieteinnahmen', encrypt: true, strictDecryption: true },
  { model: 'RentalProperty', field: 'anschaffungskosten', encrypt: true, strictDecryption: true },
  { model: 'RentalProperty', field: 'baujahr', encrypt: true, strictDecryption: true },
  { model: 'RentalProperty', field: 'werbungskosten', encrypt: true, strictDecryption: true },
  { model: 'RentalProperty', field: 'strasse', encrypt: true, strictDecryption: true },
  { model: 'RentalProperty', field: 'hausnummer', encrypt: true, strictDecryption: true },
  { model: 'RentalProperty', field: 'plz', encrypt: true, strictDecryption: true },
  { model: 'RentalProperty', field: 'city', encrypt: true, strictDecryption: true },
  { model: 'RentalProperty', field: 'livingArea', encrypt: true, strictDecryption: true },
  { model: 'RentalProperty', field: 'umlagen', encrypt: true, strictDecryption: true },
  { model: 'RentalProperty', field: 'schuldzinsen', encrypt: true, strictDecryption: true },
  { model: 'RentalProperty', field: 'einheiten', encrypt: true, strictDecryption: true },
  { model: 'RentalProperty', field: 'anteilA', encrypt: true, strictDecryption: true },
  // ADR-0099 §8: purchase date and the year's repairs.
  { model: 'RentalProperty', field: 'anschaffungsdatum', encrypt: true, strictDecryption: true },
  { model: 'RentalProperty', field: 'erhaltungsaufwand', encrypt: true, strictDecryption: true },
  { model: 'Child', field: 'firstName', encrypt: true, strictDecryption: true },
  { model: 'Child', field: 'lastName', encrypt: true, strictDecryption: true },
  { model: 'Child', field: 'geburtsdatum', encrypt: true, strictDecryption: true },
  { model: 'Child', field: 'taxId', encrypt: true, strictDecryption: true },
  { model: 'Child', field: 'childBenefitClaimEur', encrypt: true, strictDecryption: true },
  { model: 'Child', field: 'familyBenefitsOffice', encrypt: true, strictDecryption: true },
  { model: 'Child', field: 'otherParentName', encrypt: true, strictDecryption: true },
  { model: 'Child', field: 'otherParentBirthDate', encrypt: true, strictDecryption: true },
  { model: 'Child', field: 'otherParentAddress', encrypt: true, strictDecryption: true },
  { model: 'Child', field: 'otherParentDiedOn', encrypt: true, strictDecryption: true },
  { model: 'Child', field: 'healthBasicEur', encrypt: true, strictDecryption: true },
  { model: 'Child', field: 'careEur', encrypt: true, strictDecryption: true },
  { model: 'Child', field: 'swissFamilyAllowanceEur', encrypt: true, strictDecryption: true },
  { model: 'Child', field: 'childcareEur', encrypt: true, strictDecryption: true },
  { model: 'Child', field: 'childcareProvider', encrypt: true, strictDecryption: true },
  { model: 'Child', field: 'childcareFrom', encrypt: true, strictDecryption: true },
  { model: 'Child', field: 'childcareTo', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'einnahmen', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'vorsorgeaufwand', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'anrechnung', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'festgesetzteSteuer', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'erstattung', encrypt: true, strictDecryption: true },
  // ADR-0098 §8: the Besteuerungsgrundlagen of the Bescheid and its Erläuterungen.
  { model: 'Assessment', field: 'bruttoarbeitslohnA', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'bruttoarbeitslohnB', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'fahrtwegA', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'homeofficeA', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'arbeitsmittelA', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'sonstigeWerbungskostenA', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'werbungskostenA', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'fahrtwegB', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'homeofficeB', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'arbeitsmittelB', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'sonstigeWerbungskostenB', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'werbungskostenB', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'sonderausgaben', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'aussergewoehnlicheBelastungen', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'zuVersteuerndesEinkommen', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'steuerermaessigung35a', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'solidaritaetszuschlag', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'kirchensteuer', encrypt: true, strictDecryption: true },
  { model: 'Assessment', field: 'erlaeuterungen', encrypt: true, strictDecryption: true },
  // ADR-0099 §8: what the outcome of an Einspruch changed.
  { model: 'Assessment', field: 'appealOutcomeAmount', encrypt: true, strictDecryption: true },
  // ADR-0098 §8: the frozen version of a return.
  { model: 'FilingVersion', field: 'positions', encrypt: true, strictDecryption: true },
  { model: 'AdvisorChatMessage', field: 'content', encrypt: true, strictDecryption: true },
  { model: 'AdvisorChatMessage', field: 'metaJson', encrypt: true, strictDecryption: true },
  { model: 'AdvisorChatMessage', field: 'reasoning', encrypt: true, strictDecryption: true },
  { model: 'AdvisorConversation', field: 'title', encrypt: true, strictDecryption: true },
  { model: 'AdvisorConversation', field: 'summary', encrypt: true, strictDecryption: true },
  { model: 'AdvisorNote', field: 'text', encrypt: true, strictDecryption: true },
  { model: 'AdvisorSituation', field: 'text', encrypt: true, strictDecryption: true },
  { model: 'AdvisorInterview', field: 'progress', encrypt: true, strictDecryption: true },
  { model: 'AssistantTask', field: 'text', encrypt: true, strictDecryption: true },
  // ADR-0109: who the customers are. A database leak alone must not say.
  { model: 'User', field: 'name', encrypt: true, strictDecryption: true },
  { model: 'User', field: 'email', encrypt: true, strictDecryption: true },
  { model: 'Session', field: 'ipAddress', encrypt: true, strictDecryption: true },
  { model: 'Session', field: 'userAgent', encrypt: true, strictDecryption: true },
  // API-19: the desktop's address and browser of a device sign-in, like the session's own.
  { model: 'DeviceCode', field: 'requestIp', encrypt: true, strictDecryption: true },
  { model: 'DeviceCode', field: 'requestUserAgent', encrypt: true, strictDecryption: true },
].sort(byModelField)

// prisma-field-encryption's hash annotation (`@encryption:hash(field)`, dist/dmmf.js:79)
// has the same unanchored-regex shape per Musti's #325 ruling. Only the e-mail is hashed
// (ADR-0109): it must be found by exact match, which random ciphertext cannot do.
const EXPECTED_HASHED_FIELDS: ExpectedHashedField[] = [{ model: 'User', field: 'email', targetField: 'emailHash', algorithm: 'sha256' }]

// `@encryption:cursor` (dist/dmmf.js:14) is the third annotation sharing the same
// unanchored-substring shape. It doesn't encrypt anything, but it silently redirects
// which column prisma-field-encryption's migration/rotation tooling iterates a model
// on — worth covering here too since it costs nothing once the DMMF is already parsed.
// Every model here relies on its default (the `@id` field), so every value is "id".
const EXPECTED_CURSORS: Record<string, string> = {
  BusinessProfile: 'id',
  Ledger: 'id',
  JournalEntry: 'id',
  JournalLine: 'id',
  LedgerLogRecord: 'id',
  FixedAsset: 'id',
  BankTransaction: 'id',
  BookingRule: 'id',
  PayrollRun: 'id',
  Profile: 'id',
  TaxDataAccessLog: 'id',
  User: 'id',
  Session: 'id',
  Account: 'id',
  Verification: 'id',
  TaxYear: 'id',
  InterviewAnswer: 'id',
  DeviceCode: 'id',
  GuestActivity: 'userId',
  LegalHold: 'id',
  TwoFactor: 'id',
  Passkey: 'id',
  Receipt: 'id',
  Lstb: 'id',
  ChSalaryCertificate: 'id',
  Pension: 'id',
  Capital: 'id',
  Commute: 'id',
  RentalProperty: 'id',
  Marking: 'id',
  Assessment: 'id',
  FilingVersion: 'id',
  Unlock: 'id',
  MasterData: 'id',
  Child: 'id',
  TaxYearLink: 'id',
  HouseholdPerson: 'id',
  TaxYearMembership: 'id',
  PartnerLink: 'id',
  HouseholdMergeCandidate: 'id',
  OwlSetting: 'id',
  OwlCardDismissal: 'id',
  OwlPersonalDataConsent: 'id',
  YearTakeover: 'id',
  OauthClient: 'id',
  OauthResource: 'id',
  OauthClientResource: 'id',
  OauthRefreshToken: 'id',
  OauthAccessToken: 'id',
  OauthConsent: 'id',
  OauthClientAssertion: 'id',
  Jwks: 'id',
  AdvisorChatMessage: 'id',
  AdvisorConversation: 'id',
  AdvisorNote: 'id',
  AdvisorSituation: 'id',
  AdvisorInterview: 'id',
  AssistantTask: 'id',
  ReceiptFile: 'id',
}

describe('encrypted/hashed field set (#325) — derived from Prisma.dmmf, not comment text', () => {
  // `Prisma.dmmf` is the generated client's static datamodel description — reading it
  // needs no database connection, no PrismaService, nothing but `prisma generate`
  // having run (postinstall). analyseDMMF() is the exact function
  // encrypted-prisma.provider.ts's fieldEncryptionExtension() runs internally.
  const analysis = analyseDMMF(Prisma.dmmf)

  it('the encrypted-field set matches the checked-in expected list exactly', () => {
    const actual: ExpectedEncryptedField[] = Object.entries(analysis)
      .flatMap(([model, descriptor]) =>
        Object.entries(descriptor.fields).map(([field, config]) => ({
          model,
          field,
          encrypt: config.encrypt,
          strictDecryption: config.strictDecryption,
        })),
      )
      .sort(byModelField)

    expect(actual).toEqual(EXPECTED_ENCRYPTED_FIELDS)
  })

  it('the hashed-field set matches the checked-in expected list exactly', () => {
    const actual: ExpectedHashedField[] = Object.entries(analysis)
      .flatMap(([model, descriptor]) =>
        Object.entries(descriptor.fields).map(([field, config]) => ({ model, field, hash: config.hash })),
      )
      .filter((entry): entry is typeof entry & { hash: NonNullable<(typeof entry)['hash']> } => entry.hash !== undefined)
      .map(({ model, field, hash }) => ({
        model,
        field,
        targetField: hash.targetField,
        algorithm: hash.algorithm,
      }))
      .sort(byModelField)

    expect(actual).toEqual(EXPECTED_HASHED_FIELDS)
  })

  it('every model still uses its default cursor (no field accidentally carries @encryption:cursor)', () => {
    const actual = Object.fromEntries(
      Object.entries(analysis).map(([model, descriptor]) => [model, descriptor.cursor]),
    )

    expect(actual).toEqual(EXPECTED_CURSORS)
  })

  it('every userId-scoped model is governed by either @encrypted fields or the explicit metadata allowlist', () => {
    // Models that carry a `userId` column but store only non-PII operational metadata/tokens/flags
    // (never raw tax amounts, names, addresses, IBANs, or Steuer-IDs). Any NEW userId-scoped model
    // added to schema.prisma must either encrypt its sensitive fields (joining EXPECTED_ENCRYPTED_FIELDS)
    // or be consciously reviewed and added here.
    const UNENCRYPTED_METADATA_MODELS = new Set([
      'Account',
      'AdvisorChatSession',
      'DeviceCode',
      // ADR-0109: a guest id and the time of its last write, nothing else.
      'GuestActivity',
      'LegalHold',
      // ADR-0101: the book's frame only (chart, mode, Festschreibung date); its entries are encrypted.
      'Ledger',
      'OauthAccessToken',
      'OauthClient',
      'OauthConsent',
      'OauthRefreshToken',
      'OwlCardDismissal',
      // ADR-0091: the decision and its timestamps only, no personal data.
      'OwlPersonalDataConsent',
      'OwlSetting',
      'Passkey',
      'ReceiptFile',
      'Session',
      'TaxDataAccessLog',
      'TaxYear',
      'TaxYearLink',
      'TwoFactor',
      'Unlock',
      'YearTakeover',
    ])

    const encryptedModels = new Set(EXPECTED_ENCRYPTED_FIELDS.map((f) => f.model))
    const userScopedModels = Prisma.dmmf.datamodel.models
      .filter((m) => m.fields.some((f) => f.name === 'userId' && f.kind === 'scalar'))
      .map((m) => m.name)
      .sort()

    const ungoverned = userScopedModels.filter(
      (model) => !encryptedModels.has(model) && !UNENCRYPTED_METADATA_MODELS.has(model),
    )

    expect(ungoverned).toEqual([])
  })
})
