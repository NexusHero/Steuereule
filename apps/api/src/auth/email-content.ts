import type { VerificationEmail } from './email-sender.js'

export interface EmailContent {
  subject: string
  text: string
  html: string
}

export type EmailPurpose = 'verification' | 'password-reset'

const COPY: Record<EmailPurpose, { intro: string; action: string }> = {
  verification: {
    intro: 'Bitte bestätige deine E-Mail-Adresse, damit wir dein Konto absichern können.',
    action: 'E-Mail-Adresse bestätigen',
  },
  'password-reset': {
    intro: 'Du hast angefordert, dein Passwort zurückzusetzen. Wenn das nicht du warst, ignoriere diese E-Mail.',
    action: 'Neues Passwort festlegen',
  },
}

/** The one wording of every transactional email, shared by all delivery channels. */
export function renderEmail(email: VerificationEmail, purpose: EmailPurpose): EmailContent {
  const { intro, action } = COPY[purpose]
  return {
    subject: email.subject,
    text: `${intro}\n\n${action}: ${email.url}\n\nDeine SteuerEule`,
    html:
      `<p>${escapeHtml(intro)}</p>` +
      `<p><a href="${escapeHtml(email.url)}">${escapeHtml(action)}</a></p>` +
      '<p>Deine SteuerEule</p>',
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
