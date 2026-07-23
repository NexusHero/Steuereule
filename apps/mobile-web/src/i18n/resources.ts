// App-level i18n (the `app` namespace). German base + English, both complete (ADR-0006).
// Tax terms stay German in both; "Steuerjahr" is soft enough to translate as "tax year".
export const APP_NS = 'app'

export const appResources = {
  de: {
    [APP_NS]: {
      brand: { steuer: 'Steuer', eule: 'Eule' },
      splash: {
        greeting: 'Steuern? Zack, erledigt.',
        skipLabel: 'Weiter zur App',
      },
      login: {
        greetingBefore: 'Schön, dass du ',
        greetingMark: 'da',
        greetingAfter: ' bist.',
        subtitle: 'Dein Steuerjahr wartet — weiter, wo du aufgehört hast.',
        // steuereule#72 (ADR-0012, REQ-007/008) — Google/Apple sign-in is out of this slice; the
        // DS demo (auth.html) has both buttons calling straight through to onFertig, which faked
        // a login. Rather than ship a button that lies, they're hidden until REQ-007/008 lands
        // (no "coming soon" copy exists in the DS either, so no divider/label is invented here).
        emailLabel: 'E-Mail',
        emailPlaceholder: 'du@beispiel.de',
        passwordLabel: 'Passwort',
        submit: 'Einloggen',
        submitting: 'Wird geprüft …',
        continue: 'Weiter',
        // "Passwort vergessen?" is a dead link in the DS demo and password reset has no DS
        // artifact and isn't in REQ-005 scope — hidden rather than wired to nothing (steuereule#72).
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
      // Shared copy for both Login and Registrierung, driven by better-auth's own error codes
      // (authErrors.ts) and REQ-005's honest-unverified-state requirement — one place, not
      // duplicated per screen.
      auth: {
        errInvalidCredentials: 'E-Mail oder Passwort stimmen nicht.',
        errEmailTaken: 'Für diese E-Mail gibt es schon ein Konto.',
        errPasswordTooShort: 'Das Passwort ist zu kurz.',
        errPasswordCompromised: 'Dieses Passwort ist in einem bekannten Datenleck aufgetaucht — wähl bitte ein anderes.',
        errGeneric: 'Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.',
        verifyBanner: {
          heading: 'Bitte bestätige noch deine E-Mail.',
          body: 'Wir haben einen Bestätigungslink an {{email}} geschickt. Du kannst schon loslegen — bestätige, wenn du Zeit hast.',
          resend: 'Mail erneut senden',
          resendSending: 'Wird gesendet …',
          resendSent: 'Ist raus — schau in dein Postfach.',
          resendError: 'Das hat gerade nicht geklappt. Versuch es gleich noch mal.',
        },
      },
      registrierung: {
        titleBefore: 'Leg dein ',
        titleMark: 'Konto',
        titleAfter: ' an.',
        subtitle: 'E-Mail und Passwort — mehr braucht es nicht.',
        emailLabel: 'E-Mail',
        emailPlaceholder: 'du@beispiel.de',
        passwordLabel: 'Passwort',
        passwordPlaceholder: 'Mindestens 6 Zeichen',
        submit: 'Konto anlegen',
        submitting: 'Wird angelegt …',
        legalNote: 'Mit dem Anlegen akzeptierst du AGB & Datenschutz.',
        errEmail: 'Das sieht noch nicht nach einer E-Mail aus.',
        errPass: 'Mindestens 6 Zeichen fürs Passwort.',
        success: {
          badge: 'Konto steht ✓',
          heading: 'Willkommen bei SteuerEule.',
          subtitle: 'Jetzt noch drei Angaben, dann ist deine Maske vorgefüllt.',
          cta: 'Weiter zum Onboarding →',
        },
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
      splash: {
        greeting: 'Taxes? Sorted, just like that.',
        skipLabel: 'Continue to the app',
      },
      login: {
        greetingBefore: 'Good to see you ',
        greetingMark: 'here',
        greetingAfter: '.',
        subtitle: 'Your tax year is waiting — pick up where you left off.',
        // See the `de` entry above for the provenance note (steuereule#72, ADR-0012).
        emailLabel: 'Email',
        emailPlaceholder: 'you@example.com',
        passwordLabel: 'Password',
        submit: 'Log in',
        submitting: 'Checking …',
        continue: 'Continue',
        register: 'New here? Create account',
        guest: 'Look around as a guest',
        // See the `de` entry above for the provenance note (steuereule#65).
        guestNote: 'Guest mode: your details are saved securely, encrypted.',
        errEmail: "That doesn't look like an email yet.",
        errPass: 'At least 6 characters for the password.',
      },
      auth: {
        errInvalidCredentials: "Email or password doesn't match.",
        errEmailTaken: 'There is already an account for this email.',
        errPasswordTooShort: "That password's too short.",
        errPasswordCompromised: 'That password has shown up in a known data breach — please choose a different one.',
        errGeneric: "That didn't work just now. Check your connection and try again.",
        verifyBanner: {
          heading: 'Please verify your email.',
          body: "We've sent a verification link to {{email}}. You can already get started — verify whenever you have a moment.",
          resend: 'Resend email',
          resendSending: 'Sending …',
          resendSent: 'Sent — check your inbox.',
          resendError: "That didn't work just now. Try again in a moment.",
        },
      },
      registrierung: {
        titleBefore: 'Create your ',
        titleMark: 'account',
        titleAfter: '.',
        subtitle: 'Email and password — that’s all it takes.',
        emailLabel: 'Email',
        emailPlaceholder: 'you@example.com',
        passwordLabel: 'Password',
        passwordPlaceholder: 'At least 6 characters',
        submit: 'Create account',
        submitting: 'Creating …',
        legalNote: 'By creating an account you accept the terms & privacy policy.',
        errEmail: "That doesn't look like an email yet.",
        errPass: 'At least 6 characters for the password.',
        success: {
          badge: 'Account created ✓',
          heading: 'Welcome to SteuerEule.',
          subtitle: "Just three more details and your form is pre-filled.",
          cta: 'Continue to onboarding →',
        },
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
