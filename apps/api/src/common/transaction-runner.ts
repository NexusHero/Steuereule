/**
 * Unit-of-work port: every repository call made inside `run` joins one transaction, so a
 * multi-repository write either commits as a whole or not at all. The Prisma adapter is
 * `prisma/transaction.ts`.
 */
export interface TransactionRunner {
  run<T>(work: () => Promise<T>): Promise<T>
  /** True when a throw inside `run` undoes every write made in it. A pass-through runner cannot. */
  readonly rollsBack: boolean
  /** Whether the caller already runs inside a transaction; `run` then joins it instead of opening its own. */
  isActive(): boolean
}

export const TRANSACTION_RUNNER = Symbol('TRANSACTION_RUNNER')

/** In-memory repositories have no transaction to join; tests and fakes use this. */
export const passThroughTransactionRunner: TransactionRunner = {
  run: (work) => work(),
  rollsBack: false,
  isActive: () => false,
}
