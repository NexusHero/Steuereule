// App-level i18n (the `app` namespace). German base + English, both complete (ADR-0006).
// Tax terms stay German in both; "Steuerjahr" is soft enough to translate as "tax year".
export const APP_NS = 'app'

export const appResources = {
  de: {
    [APP_NS]: {
      brand: { steuer: 'Steuer', eule: 'Eule' },
      login: {
        greetingBefore: 'Schön, dass du ',
        greetingMark: 'da',
        greetingAfter: ' bist.',
        subtitle: 'Dein Steuerjahr wartet — weiter, wo du aufgehört hast.',
        google: 'Weiter mit Google',
        apple: 'Weiter mit Apple',
        orEmail: 'oder mit E-Mail',
        emailLabel: 'E-Mail',
        emailPlaceholder: 'du@beispiel.de',
        passwordLabel: 'Passwort',
        submit: 'Einloggen',
        forgot: 'Passwort vergessen?',
        register: 'Neu hier? Konto anlegen',
        guest: 'Erstmal als Gast umschauen',
        guestNote: 'Gast-Modus: deine Angaben bleiben nur auf diesem Gerät.',
        errEmail: 'Das sieht noch nicht nach einer E-Mail aus.',
        errPass: 'Mindestens 6 Zeichen fürs Passwort.',
      },
    },
  },
  en: {
    [APP_NS]: {
      brand: { steuer: 'Steuer', eule: 'Eule' },
      login: {
        greetingBefore: 'Good to see you ',
        greetingMark: 'here',
        greetingAfter: '.',
        subtitle: 'Your tax year is waiting — pick up where you left off.',
        google: 'Continue with Google',
        apple: 'Continue with Apple',
        orEmail: 'or with email',
        emailLabel: 'Email',
        emailPlaceholder: 'you@example.com',
        passwordLabel: 'Password',
        submit: 'Log in',
        forgot: 'Forgot password?',
        register: 'New here? Create account',
        guest: 'Look around as a guest',
        guestNote: 'Guest mode: your data stays on this device only.',
        errEmail: "That doesn't look like an email yet.",
        errPass: 'At least 6 characters for the password.',
      },
    },
  },
} as const

export type AppLocale = keyof typeof appResources
