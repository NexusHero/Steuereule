export interface VerificationEmail {
  to: string
  subject: string
  url: string
  token: string
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER')

/** The email-delivery seam. */
export interface EmailSender {
  sendVerificationEmail(email: VerificationEmail): Promise<void>
  sendPasswordResetEmail(email: VerificationEmail): Promise<void>
}
