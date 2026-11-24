// `User.email` is ciphertext at rest (ADR-0109), so a gate cannot find an account by its address in SQL.
// It finds it by `emailHash`, computed here exactly as the API's field-encryption extension does:
// sha256 over the trimmed, lower-cased address, then the salt, hex. The salt is the API's own setting.
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

// The API's fallback outside production (apps/api/src/prisma/field-encryption-key.ts).
const DEV_ONLY_FALLBACK_HASH_SALT = 'dev-only-email-hash-salt'

export function emailHash(email, salt = process.env.PRISMA_FIELD_ENCRYPTION_HASH_SALT || DEV_ONLY_FALLBACK_HASH_SALT) {
  return createHash('sha256').update(email.trim().toLowerCase(), 'utf8').update(salt, 'utf8').digest('hex')
}

/** The WHERE clause that selects the account of an address. */
export const whereEmail = (email) => `"emailHash" = '${emailHash(email)}'`

/** Marks an address verified, as the link in the mail would (sign-up returns no session, ADR-0109). */
export const verifyEmailSql = (email) => `UPDATE "User" SET "emailVerified" = true WHERE ${whereEmail(email)}`

// `node e2e/harness/email-hash.mjs <address>` prints the statement, for the psql steps of the workflows.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const email = process.argv[2]
  if (!email) {
    console.error('usage: node e2e/harness/email-hash.mjs <address>')
    process.exit(2)
  }
  console.log(verifyEmailSql(email))
}
