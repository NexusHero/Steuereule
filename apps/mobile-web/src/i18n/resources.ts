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
        // Honest replacement for the pre-Slice-1 "stays on this device only" claim, which
        // became false once the guest path started flowing into Onboarding and its
        // server-side, encrypted profile persistence (steuereule#65, ADR-020 + REQ-003).
        // Final wording per Matthias (Product Owner), ruling on issue #65 — shorter than
        // Kaan's original proposal; drops the identity-at-filing clause since it sits one
        // screen before Onboarding collects the Steuer-ID and could be misread as "no
        // identifying data needed yet".
        guestNote: 'Gast-Modus: deine Angaben werden sicher verschlüsselt gespeichert.',
        errEmail: 'Das sieht noch nicht nach einer E-Mail aus.',
        errPass: 'Mindestens 6 Zeichen fürs Passwort.',
      },
      onboarding: {
        back: 'Zurück',
        weiter: 'Weiter',
        loading: 'Deine Angaben werden geladen …',
        loadError: {
          heading: 'Das hat nicht geklappt.',
          message: 'Deine Angaben konnten nicht geladen werden. Prüf die Verbindung und versuch es noch mal.',
          retry: 'Noch mal versuchen',
        },
        step1: {
          titleBefore: 'Wer bist ',
          titleMark: 'du',
          titleAfter: '?',
          help: 'Genau wie im Ausweis — damit die Maske exakt stimmt.',
          firstNameLabel: 'Vorname',
          firstNamePlaceholder: 'Kim',
          lastNameLabel: 'Nachname',
          lastNamePlaceholder: 'Yilmaz',
        },
        step2: {
          titleBefore: 'Deine ',
          titleMark: 'Steuer-ID',
          titleAfter: '',
          help: '11 Ziffern, lebenslang gleich — steht oben auf jedem Brief vom Finanzamt.',
          fieldLabel: 'Steuer-Identifikationsnummer',
          placeholder: '12 345 678 901',
          counter: '{{count}}/11 Ziffern',
          confirmed: 'sitzt ✓',
        },
        step3: {
          titleBefore: 'Noch die ',
          titleMark: 'Steuernummer',
          titleAfter: '',
          help: 'Steht auf deinem letzten Bescheid. Keinen zur Hand? Später geht auch.',
          fieldLabel: 'Steuernummer (optional)',
          placeholder: '12/345/67890',
          later: 'Hab ich nicht zur Hand — später',
        },
        summary: {
          heading: 'Zack.',
          badge: 'vorgefüllt',
          intro: 'Deine Maske ist vorbereitet — jede Angabe kannst du jederzeit ändern.',
          cardLabel: 'Deine Maske',
          rowFirstName: 'Vorname',
          rowLastName: 'Nachname',
          rowSteuerId: 'Steuer-ID',
          rowSteuerNr: 'Steuernummer',
          steuerNrLater: 'später',
          cta: 'Weiter',
          submitting: 'Wird gespeichert …',
          submitError: {
            validation: 'Deine Angaben konnten nicht gespeichert werden. Bitte prüf die Steuer-ID und versuch es noch mal.',
            network: 'Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.',
          },
          changeDetails: 'Angaben ändern',
          footerNote: 'Wird sicher gespeichert — du kannst jederzeit zurückkommen.',
        },
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
        // See the `de` entry above for the provenance note (steuereule#65).
        guestNote: 'Guest mode: your details are saved securely, encrypted.',
        errEmail: "That doesn't look like an email yet.",
        errPass: 'At least 6 characters for the password.',
      },
      onboarding: {
        back: 'Back',
        weiter: 'Continue',
        loading: 'Loading your details …',
        loadError: {
          heading: "That didn't work.",
          message: "Your details couldn't be loaded. Check your connection and try again.",
          retry: 'Try again',
        },
        step1: {
          titleBefore: 'Who are ',
          titleMark: 'you',
          titleAfter: '?',
          help: 'Just like on your ID — so the form matches exactly.',
          firstNameLabel: 'First name',
          firstNamePlaceholder: 'Kim',
          lastNameLabel: 'Last name',
          lastNamePlaceholder: 'Yilmaz',
        },
        step2: {
          titleBefore: 'Your ',
          titleMark: 'Steuer-ID',
          titleAfter: '',
          help: '11 digits, the same for life — printed at the top of every letter from the tax office.',
          fieldLabel: 'Steuer-Identifikationsnummer',
          placeholder: '12 345 678 901',
          counter: '{{count}}/11 digits',
          confirmed: 'locked in ✓',
        },
        step3: {
          titleBefore: 'Now the ',
          titleMark: 'Steuernummer',
          titleAfter: '',
          help: "It's on your last tax assessment. Don't have it handy? Later works too.",
          fieldLabel: 'Steuernummer (optional)',
          placeholder: '12/345/67890',
          later: "Don't have it handy — later",
        },
        summary: {
          heading: 'Done.',
          badge: 'pre-filled',
          intro: 'Your form is ready — you can change any detail anytime.',
          cardLabel: 'Your form',
          rowFirstName: 'First name',
          rowLastName: 'Last name',
          rowSteuerId: 'Steuer-ID',
          rowSteuerNr: 'Steuernummer',
          steuerNrLater: 'later',
          cta: 'Continue',
          submitting: 'Saving …',
          submitError: {
            validation: "Your details couldn't be saved. Please check the Steuer-ID and try again.",
            network: "That didn't work just now. Check your connection and try again.",
          },
          changeDetails: 'Edit details',
          footerNote: 'Saved securely — you can come back to it any time.',
        },
      },
    },
  },
} as const

export type AppLocale = keyof typeof appResources
