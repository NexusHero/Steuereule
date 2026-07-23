// The email-delivery seam (ADR-0012 §6, REQ-005). better-auth's own
// emailVerification/sendResetPassword callbacks call this interface — never a
// provider SDK directly — so swapping in the real, EU-resident production
// provider (a forward-looking DSGVO data-residency decision, escalated to the
// stakeholder via ask-matt, not a dev-time call) touches only the provider
// registered under EMAIL_SENDER; better-auth.ts and its callbacks never change.
export interface VerificationEmail {
  to: string
  subject: string
  /**
   * The verification/reset URL better-auth generated, carrying the real,
   * server-issued token. Never a fixed demo code — the design-system
   * `registrierung.html` "Demo 123456" mock is explicitly not reproduced here;
   * every token this seam ever sees is one an attacker cannot predict.
   */
  url: string
  token: string
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER')

export interface EmailSender {
  sendVerificationEmail(email: VerificationEmail): Promise<void>
  sendPasswordResetEmail(email: VerificationEmail): Promise<void>
}
