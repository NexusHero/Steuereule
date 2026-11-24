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

export const EMAIL_SENDER = Symbol('EMAIL_SENDER')

/** The email-delivery seam. */
export interface EmailSender {
  sendVerificationEmail(email: VerificationEmail): Promise<void>
  sendPasswordResetEmail(email: VerificationEmail): Promise<void>
  sendExistingAccountNotice(email: ExistingAccountNotice): Promise<void>
}
