/** What sign-in accepts: accounts made before the server raised the minimum (ADR-0103) still have shorter passwords. */
export const MIN_PASSWORD_LENGTH = 8

/** What a NEW password needs (sign-up, reset, change): better-auth's minPasswordLength on the server is 12. */
export const NEW_PASSWORD_MIN_LENGTH = 12
