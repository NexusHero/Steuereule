export const MODEL_CALL_COUNTER = Symbol('MODEL_CALL_COUNTER')

/**
 * A counter every API instance shares, as far as the day's model calls need it (ADR-0109). The app binds
 * its shared rate-limit storage to it; this module names only the one call it makes.
 */
export interface ModelCallCounter {
  /** Takes one of `max` places under `key` within `window` seconds; not allowed once they are spent. */
  consume(key: string, rule: { readonly window: number; readonly max: number }): Promise<{ readonly allowed: boolean }>
}
