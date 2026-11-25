import { AsyncLocalStorage } from 'node:async_hooks'

const currentSource = new AsyncLocalStorage<string>()

/**
 * Who acts in the work that runs here: every audit row appended through `AuditService` while it runs names
 * that source, also the rows the services below write for themselves (ADR-0052 §10, beta P4 MCP-3).
 */
export function runWithAuditSource<T>(source: string, work: () => T): T {
  return currentSource.run(source, work)
}

export function currentAuditSource(): string | undefined {
  return currentSource.getStore()
}

/** The source an assistant's rows carry: its client id, which it cannot choose, never its name, which it can. */
export function assistantAuditSource(clientId: string): string {
  return `assistent:${clientId}`
}

/** The client id behind a source written by `assistantAuditSource`, or null for any other source. */
export function clientIdOfAuditSource(source: string | null | undefined): string | null {
  return source?.startsWith('assistent:') === true ? source.slice('assistent:'.length) : null
}
