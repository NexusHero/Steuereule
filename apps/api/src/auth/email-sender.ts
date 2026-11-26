export interface VerificationEmail {
  to: string
  subject: string
  url: string
  token: string
}

/** Tells the owner of an address that someone tried to register with it. Carries no token: it is no way in. */
export interface ExistingAccountNotice {
  to: string
  subject: string
  /** The web app's sign-in screen, where "forgot password" lives. */
  url: string
}

/**
 * ADR-0030: the account was never verified and will be deleted. Sent twice — about a week before (T-7) and
 * about a day before (T-1); the deadline is a floor ("in about"), never a date, because the sweep rides on
 * traffic (ADR-0029). Carries no token: the link is the sign-in screen, where the user can verify and export.
 */
export interface UnverifiedAccountWarning {
  to: string
  subject: string
  url: string
  final: boolean
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER')

/** The email-delivery seam. */
export interface EmailSender {
  sendVerificationEmail(email: VerificationEmail): Promise<void>
  sendPasswordResetEmail(email: VerificationEmail): Promise<void>
  sendExistingAccountNotice(email: ExistingAccountNotice): Promise<void>
  sendUnverifiedAccountWarning(email: UnverifiedAccountWarning): Promise<void>
}
