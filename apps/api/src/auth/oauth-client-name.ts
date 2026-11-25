/**
 * A client registers itself and picks its own name (ADR-0052 amendment 5); the name stands on the consent screen,
 * on tasks and on every origin line. Registration refuses a longer one, and display cuts what is already stored
 * (beta P4, MCP-13).
 */
export const MAX_CLIENT_NAME_LENGTH = 100

/** The name of a client as the app shows it: trimmed, at most `MAX_CLIENT_NAME_LENGTH` characters, never empty. */
export function clientDisplayName(name: string | null | undefined, fallback = 'Assistent'): string {
  const trimmed = (name ?? '').replace(/\s+/g, ' ').trim()
  if (trimmed.length === 0) return fallback
  return trimmed.length > MAX_CLIENT_NAME_LENGTH ? `${trimmed.slice(0, MAX_CLIENT_NAME_LENGTH - 1)}…` : trimmed
}

/** Whether a registration's `client_name` is acceptable: absent, or a string within the limit. */
export function isAcceptableClientName(name: unknown): boolean {
  return name === undefined || name === null || (typeof name === 'string' && name.trim().length <= MAX_CLIENT_NAME_LENGTH)
}
