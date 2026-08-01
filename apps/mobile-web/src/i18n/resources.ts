// App-level i18n (the `app` namespace). German base + English, both complete (ADR-0006).
// Tax terms stay German in both; "Steuerjahr" is soft enough to translate as "tax year".
export const APP_NS = 'app'

export const appResources = {
  de: {
    [APP_NS]: {
      brand: { steuer: 'Steuer', eule: 'Eule' },
      tabs: { cockpit: 'Cockpit', profil: 'Profil' },
      splash: {
        greeting: 'Steuern? Zack, erledigt.',
        skipLabel: 'Weiter zur App',
      },
      login: {
        greetingBefore: 'Schön, dass du ',
        greetingMark: 'da',
        greetingAfter: ' bist.',
        subtitle: 'Dein Steuerjahr wartet — weiter, wo du aufgehört hast.',
        // REQ-008: Google sign-in is now live (matching DS auth.html's "Weiter mit Google" ghost button).
        // Apple sign-in (#45) stays hidden until its gate opens.
        google: 'Weiter mit Google',
        orEmail: 'oder mit E-Mail',
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
        // #238 — the QR column next to the login form. A phone that opens the code's URL uses
        // its own native camera + browser, never this app's camera — so there is nothing here
        // about permissions, only about what happens once the phone gets there.
        qr: {
          heading: 'Mit dem Handy anmelden',
          body: 'Scanne den Code mit der Kamera deines Handys — dort bist du schon angemeldet.',
          accessibilityLabel: 'QR-Code zum Anmelden mit dem Handy',
          loading: 'Code wird erzeugt …',
          expired: 'Code abgelaufen.',
          requestNew: 'Neuen Code anzeigen',
          error: 'Code konnte nicht erzeugt werden.',
          retry: 'Erneut versuchen',
        },
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
        // Shown in the verify banner's place once the session confirms verification (#194,
        // stakeholder ruling — a deliberate DS deviation, the reference has no such artifact).
        verifiedBanner: {
          heading: 'E-Mail bestätigt ✓',
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
      profil: {
        loading: 'Dein Profil wird geladen …',
        loadError: {
          heading: 'Das hat nicht geklappt.',
          message: 'Dein Profil konnte nicht geladen werden. Prüf die Verbindung und versuch es noch mal.',
          retry: 'Noch mal versuchen',
        },
        namePlaceholder: 'Noch kein Name gespeichert',
        emptyNote: 'Noch keine Angaben gespeichert.',
        cardLabel: 'Deine Angaben',
        rowFirstName: 'Vorname',
        rowLastName: 'Nachname',
        rowSteuerId: 'Steuer-ID',
        rowSteuerNr: 'Steuernummer',
        steuerNrEmpty: 'nicht angegeben',
        edit: 'Bearbeiten',
        editHeading: 'Angaben bearbeiten',
        firstNameLabel: 'Vorname',
        firstNamePlaceholder: 'Kim',
        lastNameLabel: 'Nachname',
        lastNamePlaceholder: 'Yilmaz',
        steuerIdLabel: 'Steuer-Identifikationsnummer',
        steuerIdPlaceholder: '12 345 678 901',
        steuerIdCounter: '{{count}}/11 Ziffern',
        steuerIdConfirmed: 'sitzt ✓',
        steuerNrLabel: 'Steuernummer (optional)',
        steuerNrPlaceholder: '12/345/67890',
        save: 'Speichern',
        saving: 'Wird gespeichert …',
        cancel: 'Abbrechen',
        savedNotice: 'Gespeichert.',
        saveError: {
          validation: 'Deine Angaben konnten nicht gespeichert werden. Bitte prüf die Steuer-ID und versuch es noch mal.',
          network: 'Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.',
        },
        deineDaten: {
          rowLabel: 'So schützen wir deine Daten (DSGVO)',
        },
      },
      // REQ-011 (ADR-0013) — Datenschutz screen: DSGVO export (Art. 15/20) + account deletion
      // (Art. 17), reached from Profil. The delete copy is corrected, not ported from the DS
      // demo (Datenschutz.jsx/Profil.jsx): profile + account are permanently erased
      // server-side; the access-log record is anonymised and *retained* (Art. 30), never
      // deleted; anything under active Löschschutz is retained under legal obligation; the
      // export offers JSON and PDF, never "Belege (ZIP)" — no receipts model exists yet.
      datenschutz: {
        back: 'Zurück',
        title: 'Datenschutz',
        badge: 'DSGVO',
        hero: {
          kicker: 'Ernst gemeint, nicht kleingedruckt',
          heading: 'Deine Daten.\nDeine Regeln.',
          body: 'Steuerdaten sind das Privateste, was eine App anfassen kann. Deshalb steht hier alles — kurz, konkret, nachprüfbar.',
        },
        sessionChecking: 'Wird geprüft …',
        // #238, ADR-0024 (task 0c) — two disclosures, both new to this text, neither new to
        // what the server actually stores: Session.ipAddress/userAgent are collected for
        // every session since day one (see prisma/schema.prisma), and what's new here is
        // that a signed-in user can now see that data themselves, in their own Geräte-Liste
        // (Profil). The geo-IP resolution is genuinely new processing, added for the
        // QR-Code-Login's match-verification screen — see attribution below for the source.
        deviceSessions: {
          heading: 'Anmeldungen & Geräte',
          sessionData:
            'Bei jeder Anmeldung speichern wir die IP-Adresse und den Gerätetyp (User-Agent) der jeweiligen Sitzung — das war schon immer so. Neu ist: Wenn du dich per QR-Code von einem neuen Gerät aus anmeldest, siehst du diese Angaben jetzt selbst — als Vergleichshilfe auf dem Bestätigungsbildschirm und in deiner eigenen Geräte-Liste in Profil, wo du jede Sitzung einzeln abmelden kannst.',
          geoIp:
            'Für die QR-Code-Anmeldung lösen wir die IP-Adresse des anfragenden Geräts zusätzlich auf Länderebene auf (z. B. "Deutschland"), nie genauer — das hilft dir, eine fremde Anfrage von deiner eigenen zu unterscheiden. Diese Auflösung läuft vollständig auf unseren eigenen EU-Servern, mit einer selbst gehosteten, regelmäßig aktualisierten Datenbank; deine IP-Adresse verlässt dafür nie unsere Infrastruktur und geht an keinen externen Anbieter. Ist die Datenbank veraltet oder eine Adresse nicht zuordenbar, zeigen wir ehrlich "Region unbekannt" statt zu raten.',
          geoIpAttribution: 'Länderdaten: DB-IP.com, Lizenz CC BY 4.0.',
        },
        guest: {
          heading: 'Noch kein Konto',
          body: 'Für ein Gast-Profil ohne Konto gibt es weder einen Export noch eine Kontolöschung. Leg ein Konto an, um dein Recht auf Auskunft (Art. 15) und Löschung (Art. 17) wahrzunehmen.',
        },
        export: {
          title: 'Auskunft & Export',
          subtitle: 'Art. 15 (Auskunft) und Art. 20 (Übertragbarkeit): lade eine vollständige Kopie deiner Daten herunter.',
          jsonButton: 'Als JSON herunterladen',
          jsonHint: 'Maschinenlesbar — zum Weitergeben oder Archivieren.',
          pdfButton: 'Als PDF-Bericht herunterladen',
          pdfHint: 'Zum Lesen, Ausdrucken oder Ablegen.',
          preparing: 'Wird erstellt …',
          success: 'Heruntergeladen.',
          error: 'Der Export hat gerade nicht geklappt. Versuch es noch mal.',
        },
        delete: {
          title: 'Löschen',
          subtitle: 'Art. 17: entfernt dein Profil und dein Konto endgültig von unseren Servern.',
          openButton: 'Konto & Daten löschen',
          offer: {
            heading: 'Bevor du löschst',
            warning1:
              'Dein Profil und dein Konto werden endgültig von unseren Servern gelöscht — das lässt sich nicht rückgängig machen. Einträge deines Zugriffsprotokolls bleiben anonymisiert erhalten: Wir entfernen deine Kennung daraus, behalten die Einträge selbst aber als gesetzlich vorgeschriebenen Nachweis (Art. 30 DSGVO) — sie lassen sich danach niemandem mehr zuordnen. Daten unter gesetzlichem Löschschutz (z. B. bereits eingereichte Fassungen) bleiben ebenfalls erhalten, bis die Aufbewahrungspflicht endet.',
            warning2:
              'Falls du bereits Fassungen beim Finanzamt eingereicht hast, verlierst du mit der Kontolöschung deinen Zugriff auf diese Nachweise. Exportiere sie dir vorher.',
            exportFirstButton: 'Erst als JSON exportieren (empfohlen)',
            exportedNote: 'Export gestartet.',
            continueButton: 'Weiter ohne Export',
            cancelButton: 'Abbrechen',
          },
          confirm: {
            heading: 'Bist du sicher?',
            warning: 'Diesen Schritt kannst du nicht rückgängig machen. Dein Profil und dein Konto werden jetzt endgültig gelöscht.',
            confirmButton: 'Ja, endgültig löschen',
            cancelButton: 'Abbrechen',
            genericError: 'Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.',
          },
          password: {
            heading: 'Bestätige mit deinem Passwort',
            explain: 'Deine Sitzung ist nicht mehr aktuell genug für diesen unwiderruflichen Schritt. Gib dein Passwort ein, um fortzufahren.',
            label: 'Passwort',
            submitButton: 'Bestätigen',
            cancelButton: 'Abbrechen',
            wrongPasswordError: 'Das Passwort stimmt nicht. Versuch es noch mal.',
            rateLimitedError: 'Zu viele Versuche. Warte kurz und versuch es dann noch mal.',
            genericError: 'Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.',
          },
          deleting: 'Wird gelöscht …',
          guestBlocked: 'Für Gast-Zugänge gibt es kein Konto zum Löschen.',
        },
      },
      cockpit: {
        appbarTitle: 'Steuerjahr',
        loading: 'Dein Cockpit wird geladen …',
        loadError: {
          heading: 'Das hat nicht geklappt.',
          message: 'Dein Cockpit konnte nicht geladen werden. Prüf die Verbindung und versuch es noch mal.',
          retry: 'Noch mal versuchen',
        },
        empty: {
          heading: 'Noch keine Angaben.',
          message: 'Für dieses Steuerjahr liegen noch keine Angaben vor. Sobald deine Daten da sind, zeigen wir dir hier deine Erstattung.',
        },
        hero: {
          label: 'Voraussichtliche Erstattung',
          openItems_one: '{{count}} Angabe offen',
          openItems_other: '{{count}} Angaben offen',
          herkunftRegel: 'Spannen-Regel · ADR-015',
          herkunftRechenweg_one: '{{count}} offene Angabe × {{perItem}} Unsicherheit',
          herkunftRechenweg_other: '{{count}} offene Angaben × {{perItem}} Unsicherheit',
        },
        refresh: 'Aktualisieren',
        refreshing: 'Wird aktualisiert …',
      },
    },
  },
  en: {
    [APP_NS]: {
      brand: { steuer: 'Steuer', eule: 'Eule' },
      tabs: { cockpit: 'Cockpit', profil: 'Profile' },
      splash: {
        greeting: 'Taxes? Sorted, just like that.',
        skipLabel: 'Continue to the app',
      },
      login: {
        greetingBefore: 'Good to see you ',
        greetingMark: 'here',
        greetingAfter: '.',
        subtitle: 'Your tax year is waiting — pick up where you left off.',
        // REQ-008: Google sign-in is now live.
        google: 'Continue with Google',
        orEmail: 'or with email',
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
        qr: {
          heading: 'Sign in with your phone',
          body: "Scan the code with your phone's camera — you're already signed in there.",
          accessibilityLabel: 'QR code to sign in with your phone',
          loading: 'Generating code …',
          expired: 'Code expired.',
          requestNew: 'Show a new code',
          error: 'Could not generate a code.',
          retry: 'Try again',
        },
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
        verifiedBanner: {
          heading: 'Email verified ✓',
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
      profil: {
        loading: 'Loading your profile …',
        loadError: {
          heading: "That didn't work.",
          message: "Your profile couldn't be loaded. Check your connection and try again.",
          retry: 'Try again',
        },
        namePlaceholder: 'No name saved yet',
        emptyNote: 'Nothing saved yet.',
        cardLabel: 'Your details',
        rowFirstName: 'First name',
        rowLastName: 'Last name',
        rowSteuerId: 'Steuer-ID',
        rowSteuerNr: 'Steuernummer',
        steuerNrEmpty: 'not provided',
        edit: 'Edit',
        editHeading: 'Edit details',
        firstNameLabel: 'First name',
        firstNamePlaceholder: 'Kim',
        lastNameLabel: 'Last name',
        lastNamePlaceholder: 'Yilmaz',
        steuerIdLabel: 'Steuer-Identifikationsnummer',
        steuerIdPlaceholder: '12 345 678 901',
        steuerIdCounter: '{{count}}/11 digits',
        steuerIdConfirmed: 'locked in ✓',
        steuerNrLabel: 'Steuernummer (optional)',
        steuerNrPlaceholder: '12/345/67890',
        save: 'Save',
        saving: 'Saving …',
        cancel: 'Cancel',
        savedNotice: 'Saved.',
        saveError: {
          validation: "Your details couldn't be saved. Please check the Steuer-ID and try again.",
          network: "That didn't work just now. Check your connection and try again.",
        },
        deineDaten: {
          rowLabel: 'How we protect your data (GDPR)',
        },
      },
      datenschutz: {
        back: 'Back',
        title: 'Privacy',
        badge: 'GDPR',
        hero: {
          kicker: 'We mean it, not just fine print',
          heading: 'Your data.\nYour rules.',
          body: "Tax data is about the most private thing an app can touch. So here's everything — short, concrete, checkable.",
        },
        sessionChecking: 'Checking …',
        deviceSessions: {
          heading: 'Sign-ins & devices',
          sessionData:
            "Every sign-in stores that session's IP address and device type (User-Agent) — that has always been true. What's new: when you sign in from a new device via QR code, you now see that data yourself — as a comparison aid on the confirmation screen, and in your own device list in Profile, where you can sign each session out individually.",
          geoIp:
            "For QR-code sign-in we additionally resolve the requesting device's IP address to a country (e.g. \"Germany\"), never anything more precise — this helps you tell a stranger's request apart from your own. That resolution runs entirely on our own EU servers, against a self-hosted database we keep up to date; your IP address never leaves our infrastructure and is never sent to a third-party provider. If the database is out of date or an address can't be matched, we honestly show \"Region unknown\" rather than guess.",
          geoIpAttribution: 'Country data: DB-IP.com, licensed CC BY 4.0.',
        },
        guest: {
          heading: 'No account yet',
          body: "A guest profile without an account has neither an export nor an account to delete. Create an account to exercise your right to access (Art. 15) and erasure (Art. 17).",
        },
        export: {
          title: 'Access & export',
          subtitle: 'Art. 15 (access) and Art. 20 (portability): download a full copy of your data.',
          jsonButton: 'Download as JSON',
          jsonHint: 'Machine-readable — for sharing or archiving.',
          pdfButton: 'Download as PDF report',
          pdfHint: 'For reading, printing, or filing.',
          preparing: 'Preparing …',
          success: 'Downloaded.',
          error: "That export didn't work just now. Try again.",
        },
        delete: {
          title: 'Delete',
          subtitle: 'Art. 17: permanently removes your profile and account from our servers.',
          openButton: 'Delete account & data',
          offer: {
            heading: 'Before you delete',
            warning1:
              "Your profile and account are permanently deleted from our servers — this can't be undone. Your access-log entries are retained, anonymised: we sever your identifier from them, but keep the entries themselves as a legally required record (GDPR Art. 30) — they can no longer be linked to anyone afterwards. Data under an active legal hold (e.g. filings you've already submitted) is likewise retained until the retention obligation ends.",
            warning2:
              "If you've already submitted filings to the tax office, deleting your account means losing access to that evidence. Export it first.",
            exportFirstButton: 'Export as JSON first (recommended)',
            exportedNote: 'Export started.',
            continueButton: 'Continue without exporting',
            cancelButton: 'Cancel',
          },
          confirm: {
            heading: 'Are you sure?',
            warning: "This step can't be undone. Your profile and account will now be permanently deleted.",
            confirmButton: 'Yes, delete permanently',
            cancelButton: 'Cancel',
            genericError: "That didn't work just now. Check your connection and try again.",
          },
          password: {
            heading: 'Confirm with your password',
            explain: "Your session isn't fresh enough for this irreversible step. Enter your password to continue.",
            label: 'Password',
            submitButton: 'Confirm',
            cancelButton: 'Cancel',
            wrongPasswordError: "That password doesn't match. Try again.",
            rateLimitedError: 'Too many attempts. Wait a moment and try again.',
            genericError: "That didn't work just now. Check your connection and try again.",
          },
          deleting: 'Deleting …',
          guestBlocked: 'Guest accounts have no account to delete.',
        },
      },
      cockpit: {
        appbarTitle: 'Tax year',
        loading: 'Loading your Cockpit …',
        loadError: {
          heading: "That didn't work.",
          message: "Your Cockpit couldn't be loaded. Check your connection and try again.",
          retry: 'Try again',
        },
        empty: {
          heading: 'No details yet.',
          message: "There's nothing on record for this tax year yet. Once your data is in, your refund shows up here.",
        },
        hero: {
          label: 'Estimated refund',
          openItems_one: '{{count}} item still open',
          openItems_other: '{{count}} items still open',
          herkunftRegel: 'Range rule · ADR-015',
          herkunftRechenweg_one: '{{count}} open item × {{perItem}} uncertainty',
          herkunftRechenweg_other: '{{count}} open items × {{perItem}} uncertainty',
        },
        refresh: 'Refresh',
        refreshing: 'Refreshing …',
      },
    },
  },
} as const

export type AppLocale = keyof typeof appResources
