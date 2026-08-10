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
  { model: 'Profile', field: 'steuerId', encrypt: true, strictDecryption: true },
  { model: 'Profile', field: 'steuernummer', encrypt: true, strictDecryption: true },
  { model: 'InterviewAnswer', field: 'value', encrypt: true, strictDecryption: true },
].sort(byModelField)

// prisma-field-encryption's hash annotation (`@encryption:hash(field)`, dist/dmmf.js:79)
// has the same unanchored-regex shape per Musti's #325 ruling. None is in use today —
// this list going non-empty without a matching schema.prisma change would be exactly
// the kind of silent drift this test exists to catch.
const EXPECTED_HASHED_FIELDS: ExpectedHashedField[] = []

// `@encryption:cursor` (dist/dmmf.js:14) is the third annotation sharing the same
// unanchored-substring shape. It doesn't encrypt anything, but it silently redirects
// which column prisma-field-encryption's migration/rotation tooling iterates a model
// on — worth covering here too since it costs nothing once the DMMF is already parsed.
// Every model here relies on its default (the `@id` field), so every value is "id".
const EXPECTED_CURSORS: Record<string, string> = {
  Profile: 'id',
  TaxDataAccessLog: 'id',
  User: 'id',
  Session: 'id',
  Account: 'id',
  Verification: 'id',
  RateLimit: 'id',
  TaxYear: 'id',
  InterviewAnswer: 'id',
  DeviceCode: 'id',
  LegalHold: 'id',
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
})
