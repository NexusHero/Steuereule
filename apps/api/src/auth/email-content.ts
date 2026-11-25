import type { ExistingAccountNotice, UnverifiedAccountWarning, VerificationEmail } from './email-sender.js'

export interface EmailContent {
  subject: string
  text: string
  html: string
}

export type EmailPurpose = 'verification' | 'password-reset' | 'existing-account' | 'unverified-warning' | 'unverified-final'

const COPY: Record<EmailPurpose, { intro: string; action: string }> = {
  verification: {
    intro: 'Bitte bestätige deine E-Mail-Adresse, damit wir dein Konto absichern können.',
    action: 'E-Mail-Adresse bestätigen',
  },
  'password-reset': {
    intro: 'Du hast angefordert, dein Passwort zurückzusetzen. Wenn das nicht du warst, ignoriere diese E-Mail.',
    action: 'Neues Passwort festlegen',
  },
  'existing-account': {
    intro: 'Jemand hat versucht, mit deiner E-Mail-Adresse ein SteuerEule-Konto anzulegen. Du hast schon eines: melde dich an oder setze dein Passwort zurück. Warst du das nicht, kannst du diese E-Mail ignorieren.',
    action: 'Zur Anmeldung',
  },
  'unverified-warning': {
    intro: 'Deine E-Mail-Adresse für SteuerEule ist noch nicht bestätigt. Bestätigst du sie nicht, löschen wir dein Konto mit allen Daten darin frühestens in etwa 7 Tagen. Melde dich an, um sie zu bestätigen oder deine Daten vorher zu exportieren.',
    action: 'Zur Anmeldung',
  },
  'unverified-final': {
    intro: 'Deine E-Mail-Adresse für SteuerEule ist noch immer nicht bestätigt. Frühestens in etwa einem Tag löschen wir dein Konto mit allen Daten darin. Melde dich an, um sie zu bestätigen oder deine Daten vorher zu exportieren.',
    action: 'Zur Anmeldung',
  },
}

/** The one wording of every transactional email, shared by all delivery channels. */
export function renderEmail(email: Pick<VerificationEmail | ExistingAccountNotice | UnverifiedAccountWarning, 'subject' | 'url'>, purpose: EmailPurpose): EmailContent {
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
