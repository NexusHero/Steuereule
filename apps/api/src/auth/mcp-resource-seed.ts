/** The part of better-auth's database adapter the seed uses. */
export interface ResourceAdapter {
  findOne(query: { model: string; where: { field: string; value: string }[] }): Promise<unknown>
  create(query: { model: string; data: Record<string, unknown> }): Promise<unknown>
  update(query: { model: string; where: { field: string; value: string }[]; update: Record<string, unknown> }): Promise<unknown>
}

const sameScopes = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((scope) => b.includes(scope))

/**
 * Makes sure the MCP endpoint exists as an OAuth resource (RFC 8707) before the first OAuth request
 * needs it. better-auth's own `resources` option seeds at startup and so opens a database connection
 * while the app boots, which the boot must never do (test/boot). This runs on the first /oauth2/
 * request instead, once per process, and again after a failure.
 */
export function ensureMcpResource(identifier: string, allowedScopes: readonly string[]): (adapter: ResourceAdapter) => Promise<void> {
  let done: Promise<void> | null = null
  return (adapter) => {
    done ??= (async () => {
      const where = [{ field: 'identifier', value: identifier }]
      const existing = (await adapter.findOne({ model: 'oauthResource', where })) as { allowedScopes?: readonly string[] | null } | null
      if (existing) {
        // A scope added later must reach the row, or better-auth drops it from every token for this resource.
        if (!sameScopes(existing.allowedScopes ?? [], allowedScopes)) await adapter.update({ model: 'oauthResource', where, update: { allowedScopes: [...allowedScopes], updatedAt: new Date() } })
        return
      }
      const now = new Date()
      await adapter.create({
        model: 'oauthResource',
        data: {
          identifier,
          name: 'SteuerEule MCP',
          // Listed explicitly: better-auth reads an empty list as "no scope allowed" for this resource.
          allowedScopes: [...allowedScopes],
          disabled: false,
          dpopBoundAccessTokensRequired: false,
          policyVersion: 1,
          createdAt: now,
          updatedAt: now,
        },
      })
    })().catch((error: unknown) => {
      done = null
      throw error
    })
    return done
  }
}
