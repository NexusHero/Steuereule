/**
 * How the confirmation path reads and writes one screen's fields (ADR-0066). Each feature module
 * provides the access for its own screen from its repository port; the confirmation module composes them.
 */
export interface ScreenAccess {
  readonly fields: readonly string[]
  readonly withInstance: boolean
  read(userId: string, taxYear: number, instance: string | null): Promise<Readonly<Record<string, string | null>> | null>
  write(userId: string, taxYear: number, instance: string | null, field: string, value: string | null): Promise<boolean>
}
