// describeDatabaseTarget — the credential-redaction half of the reachability guard,
// tested in isolation because it's the one piece Musti's review called non-negotiable:
// a fail-fast guard must never write the DSN (which carries the DB password) into
// process/container logs. Every case here asserts the password never appears in the
// output, not just that host:port does.
import { describe, expect, it } from 'vitest'
import { describeDatabaseTarget } from '../../src/config/assert-database-reachable.js'

describe('describeDatabaseTarget', () => {
  it('returns host:port, never the credentials in the URL', () => {
    const description = describeDatabaseTarget('postgresql://someuser:super-secret-password@db.internal:5432/steuereule')
    expect(description).toBe('db.internal:5432')
    expect(description).not.toContain('super-secret-password')
    expect(description).not.toContain('someuser')
  })

  it('defaults the port to 5432 when the URL omits it, still without the credentials', () => {
    const description = describeDatabaseTarget('postgresql://someuser:super-secret-password@db.internal/steuereule')
    expect(description).toBe('db.internal:5432')
    expect(description).not.toContain('super-secret-password')
  })

  it('falls back to a redacted description for an unparseable value, never echoing the raw string', () => {
    const raw = 'not-a-url-but-still-has-a-fake-password=hunter2'
    const description = describeDatabaseTarget(raw)
    expect(description).not.toContain('hunter2')
    expect(description).not.toBe(raw)
    expect(description).toMatch(/not.*parseable/i)
  })
})
