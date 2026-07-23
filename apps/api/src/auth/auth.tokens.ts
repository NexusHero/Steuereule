// DI tokens for the auth module (mirrors PROFILE_REPOSITORY/AUDIT_REPOSITORY's
// explicit-symbol-token convention elsewhere in this codebase).
import type { BetterAuthBundle } from './better-auth.js'

export const BETTER_AUTH_BUNDLE = Symbol('BETTER_AUTH_BUNDLE')
export type { BetterAuthBundle }
