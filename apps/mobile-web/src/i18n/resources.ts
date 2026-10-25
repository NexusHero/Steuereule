// App-level i18n (the `app` namespace). German base + English, both complete (ADR-0006).
// Tax terms stay German in both; "Steuerjahr" is soft enough to translate as "tax year".
export const APP_NS = 'app'

export const appResources = {
  de: {
    [APP_NS]: {
      brand: { steuer: 'Steuer', eule: 'Eule' },
      tabs: { cockpit: 'Cockpit', belege: 'Belege', profil: 'Profil' },
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
        // REQ-008 (Apple half) — the button is wired but only ever rendered when the deployment
        // flips its flag (an Apple Developer account + a shipped iOS build). See useSocialSignInAvailable.
        apple: 'Weiter mit Apple',
        // #283 §3(a) — the DS's own honest fallback for a provider the deployment genuinely
        // doesn't have configured (auth.html), shown in the button's own place rather than
        // silence. `googleUnknown` is the distinct case: the probe itself can't currently answer
        // (only shown once the shared-outage banner is already up — see LoginScreen.tsx).
        googleNotConfigured: 'Google ist auf diesem Gerät nicht eingerichtet — die anderen Wege stehen dir offen.',
        googleUnknown: 'Wir können gerade nicht prüfen, ob Google verfügbar ist.',
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
        // REQ-007 — 2FA challenge shown after the primary factor (email+password) succeeds.
        twoFactor: {
          heading: 'Zweiter Faktor',
          body: 'Dein Konto ({{email}}) ist mit einem zweiten Faktor geschützt. Gib den Code aus deiner Authenticator-App ein.',
          codeLabel: 'Code aus der Authenticator-App',
          submit: 'Bestätigen',
        },
        errEmail: 'Das sieht noch nicht nach einer E-Mail aus.',
        errPass: 'Mindestens 6 Zeichen fürs Passwort.',
        // #283 AC-A — the single shared alert for a genuine, transport-level API outage (not a
        // real answer like a wrong password or a rate limit — AC-B keeps those on their own
        // copy). Wording follows the same voice Musti cited from AuthGeraete.jsx's own `fehler`
        // state (names the cause, takes the blame, reassures), generalised beyond "no QR code"
        // since this banner now also covers the login form — final wording is Suhay's to bless.
        //
        // #298 review, F2 — two bodies, not one: `bodyRetrying`'s "wir versuchen es automatisch
        // weiter" is only true while the QR column actually has a retry scheduled
        // (`autoRetryStatus === 'scheduled'`). At `bp === 's'` (or embedded usage) the column
        // never even starts, and once §4(1)'s attempt cap is spent nothing is retrying either —
        // `body` (no retry claim) is what shows then. LoginScreen picks between the two live,
        // never both.
        apiUnreachable: {
          heading: 'Gerade nicht erreichbar — das liegt an uns.',
          body: 'Unsere Server antworten nicht. Deine Daten sind sicher, es ist nichts verloren.',
          bodyRetrying: 'Unsere Server antworten nicht. Deine Daten sind sicher, es ist nichts verloren. Wir versuchen es automatisch weiter.',
        },
        // #238 — the QR column next to the login form. A phone that opens the code's URL uses
        // its own native camera + browser, never this app's camera — so there is nothing here
        // about permissions, only about what happens once the phone gets there.
        qr: {
          heading: 'Mit dem Handy anmelden',
          body: 'Scanne den Code mit der Kamera deines Handys — dort bist du schon angemeldet.',
          accessibilityLabel: 'QR-Code zum Anmelden mit dem Handy',
          loading: 'Code wird erzeugt …',
          // Task 6 (Salih's T1 gate) — the desktop's own polling loop (`useDeviceQrCode`)
          // reaching `access_denied` (RFC 8628 §3.5): the phone confirmed a *different* code,
          // or (once a decline affordance exists) explicitly said no. Distinct from `error`
          // deliberately — nothing here broke, the answer was just "not this one".
          denied: 'Anmeldung wurde nicht bestätigt.',
          expired: 'Code abgelaufen.',
          requestNew: 'Neuen Code anzeigen',
          error: 'Code konnte nicht erzeugt werden.',
          retry: 'Erneut versuchen',
          // #283 §3(b)/AC-B — a deliberate server-side brake (ADR-0024), never an outage: its
          // own specific copy, manual retry only, never the "that's on us" framing above.
          rateLimited: 'Gerade zu viele Anfragen. Versuch es in ein paar Sekunden noch mal.',
          retryingAuto: 'Wir versuchen es automatisch erneut …',
          // #298 review, F1(b) — once the bounded auto-retry has genuinely given up (the attempt
          // cap, not just a long delay), the copy must say so rather than keep claiming an
          // ongoing retry that stopped.
          retryExhausted: 'Die automatischen Versuche sind pausiert — bitte versuch es manuell noch einmal.',
          // #283 §5, state 3 ("knapp") — the amber pre-warning under 20s, and the ordinary
          // countdown otherwise. `{{time}}` is already formatted mm:ss.
          knapp: 'Läuft gleich ab — noch {{time}}',
          remaining: 'Gilt noch {{time}}',
          copy: 'Kopieren',
          copied: '✓ Kopiert',
          // #298 review, F3 — dropped: the DS demo's "Keine Kamera? …tipp den Code ein" promises
          // a manual-entry capability this product does not have. `steuereule.de/koppeln` isn't
          // even the right domain/route (the real one is `/device?user_code=…`) — but fixing
          // just the URL wouldn't make the claim true either: `DeviceScreen.tsx` has no
          // code-entry field at all, and visiting `/device` without a `user_code` renders
          // `device.missingCode` ("open the link/QR again"), which is worse than useless advice
          // for someone who followed this exact line because they have no camera. Same
          // discipline as "Passwort vergessen?" elsewhere in this file: a capability that
          // doesn't exist doesn't ship copy promising it, DS reference notwithstanding.
          // #283 §5, state 7 — the confirmation beat before `onApproved` actually fires.
          approved: {
            heading: 'Das war’s — du bist drin.',
            body: 'Freigegeben über dein Telefon. Dein Steuerjahr lädt.',
          },
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
        // The reverse of LoginScreen's "Neu hier? Konto anlegen" — closes the dead branch where
        // a user on Registrierung had no way back (Phase 0.3 AC-2).
        backToLogin: 'Schon ein Konto? Einloggen',
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
          help: 'Genau wie im Perso — damit beim Finanzamt alles passt.',
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
          later: 'Hab ich gerade nicht da — später im Profil',
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
          steuerIdLater: 'später',
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
      // #238 — the match-verification screen a phone lands on after opening the QR/link
      // (`/device?user_code=…`). Match-verification, not one-tap: the question is whether
      // the code is currently on the *other* screen, never "approve?".
      funnel: {
        kontoWand: {
          sticker: 'Weg gefunden',
          titleBefore: 'Dein Weg: ',
          titleAfter: '',
          pfad: { angestellte: 'Angestellte', rente: 'Rente', ch: 'Grenzgänger CH' },
          help: 'Drei Antworten, und wir wissen, welche Erklärung zu dir passt. So geht es weiter:',
          nextLabel: 'Als Nächstes',
          schritte: {
            lstb: 'Lohnsteuerbescheinigung abtippen oder scannen',
            lebenslagen: 'Umzug, Nebenjob, Abfindung? Kurz abhaken',
            sonderausgaben: 'Spenden, Versicherungen, Riester',
            rentenbescheid: 'Rentenbezugsmitteilung übernehmen',
            kvpv: 'Kranken- und Pflegeversicherung prüfen',
            lohnausweis: 'Schweizer Lohnausweis übernehmen',
            nichtrueckkehrtage: 'Nichtrückkehrtage zählen',
          },
          honest: 'Eine Erstattung zeigen wir erst, wenn wir sie wirklich rechnen können — nicht vorher.',
          register: 'Konto anlegen und weitermachen',
          login: 'Ich hab schon ein Konto',
          later: 'Später — erst mal ins Cockpit',
          note: 'Deine Antworten wandern mit ins Konto. Bis dahin liegen sie verschlüsselt in deiner Gast-Sitzung.',
        },
      },
      device: {
        sessionChecking: 'Wir prüfen deine Anmeldung …',
        // #349 — distinct from both `missingCode` (we know there's no code) and the embedded
        // LoginScreen (we know there's no session): here we genuinely do not know whether this
        // phone is signed in, because `/get-session` itself didn't answer (429, a 5xx, no
        // connection). Voiced like `login.googleUnknown` — "we can't currently tell", never
        // "check your connection", which would overclaim on a 429 the connection had nothing to
        // do with.
        sessionUnknown: {
          heading: 'Das können wir gerade nicht prüfen.',
          body: 'Wir können gerade nicht feststellen, ob du angemeldet bist. Versuch es noch mal.',
          retry: 'Noch mal versuchen',
        },
        missingCode: {
          heading: 'Kein Code angegeben',
          body: 'Öffne den Link oder QR-Code noch einmal von dem Bildschirm, der sich anmelden möchte.',
        },
        approval: {
          loading: 'Wir laden die Anfrage …',
          error: {
            heading: 'Code ungültig oder abgelaufen',
            body: 'Fordere auf dem anderen Bildschirm einen neuen Code an.',
          },
          question: 'Steht dieser Code gerade auf deinem Bildschirm?',
          // The explicit, persistent statement Decision 4 requires — never approved from a
          // code received via message/link, only from what this screen itself resolved.
          warning: 'Ein Code, den du per Nachricht oder Link bekommen hast, wird hier niemals bestätigt — nur ein Code, der gerade auf einem anderen Bildschirm steht.',
          context: {
            browser: 'Browser',
            os: 'Betriebssystem',
            region: 'Region',
            time: 'Zeitpunkt',
            unknownBrowser: 'Unbekannter Browser',
            unknownOs: 'Unbekanntes Betriebssystem',
            unknownRegion: 'Region unbekannt',
            unknownTime: 'Zeitpunkt unbekannt',
          },
          confirm: 'Ja, das ist mein Code',
          confirming: 'Wird bestätigt …',
          approveError: 'Das hat nicht geklappt. Versuch es noch einmal.',
          approved: {
            heading: 'Erledigt',
            body: 'Der andere Bildschirm meldet sich jetzt an.',
          },
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
        sicherheit: {
          rowLabel: 'Sicherheit (Zwei-Faktor)',
        },
        // #238, Decision 6 — every session on the account, not just QR-authorized ones. No
        // region here (see DeviceListSection.tsx's header comment) — Musti's ADR-0021 control
        // test showed the only deployment-config candidate for a trustworthy client IP still
        // returns a spoofable address, so `Session.region` was never built; fail-closed.
        devices: {
          heading: 'Angemeldete Geräte',
          loading: 'Geräte werden geladen …',
          // #306 — one string used to serve every failure, so it named a cause it had not
          // established: it told the stakeholder to check a connection that had just rendered
          // his name and Steuer-ID, when better-auth had in fact answered 403. Each variant may
          // only assert what its `FailureReason` actually establishes; `unknown` asserts nothing.
          loadError: {
            unreachable: 'Deine Geräte konnten nicht geladen werden. Prüf die Verbindung und versuch es noch mal.',
            // Suhay's ruling, #336 — "abgelehnt" (a deliberate refusal) is true for 401/403 but
            // misleads for 500, which `classifyByStatus` also routes here (failure-reason.ts):
            // the server didn't decline, it broke. This wording asserts only what all four
            // statuses share — it answered, and that answer didn't get you your devices — and
            // keeps the retraction Musti flagged as the load-bearing clause.
            refused: 'Deine Geräte konnten nicht geladen werden — der Server hat sich gemeldet, aber das hat nicht geklappt. An deiner Verbindung liegt es nicht.',
            unknown: 'Deine Geräte konnten nicht geladen werden. Versuch es noch mal.',
          },
          empty: 'Keine weiteren Geräte angemeldet.',
          browser: 'Browser',
          os: 'Betriebssystem',
          lastActive: 'Letzte Aktivität',
          unknownBrowser: 'Unbekannter Browser',
          unknownOs: 'Unbekanntes Betriebssystem',
          unknownTime: 'Zeitpunkt unbekannt',
          currentDevice: 'Dieses Gerät',
          signOut: 'Abmelden',
          revoking: 'Wird abgemeldet …',
          revokeError: 'Das hat nicht geklappt. Versuch es noch einmal.',
        },
      },
      // REQ-007 — Sicherheit (2FA), reached from Profil. Wording stays honest: enabling shows a
      // QR + backup codes and requires confirming one code; disabling requires the password again.
      sicherheit: {
        title: 'Sicherheit',
        back: 'Zurück zu Profil',
        loading: 'Wird geladen …',
        requiresAccount: 'Zwei-Faktor-Authentifizierung gibt es nur für ein echtes Konto — im Gast-Modus ist sie nicht verfügbar.',
        password: 'Passwort',
        busy: 'Wird geprüft …',
        enabled: 'Zwei-Faktor-Authentifizierung ist jetzt aktiv.',
        disabled: 'Zwei-Faktor-Authentifizierung ist aus.',
        twoFactor: {
          title: 'Zwei-Faktor-Authentifizierung',
          on: 'Aktiv',
          off: 'Aus',
          body: 'Ein zweiter Faktor schützt dein Konto zusätzlich zum Passwort. Beim Anmelden wirst du nach dem Code aus deiner Authenticator-App gefragt.',
        },
        enable: {
          explainer: 'Schütze dein Konto mit einem zusätzlichen Faktor. Du bestätigst die Aktivierung mit einem Code aus deiner Authenticator-App.',
          start: 'Zwei-Faktor aktivieren',
          passwordTitle: 'Passwort bestätigen',
          confirm: 'Weiter',
          setupTitle: 'In deine Authenticator-App eintragen',
          qrLabel: 'QR-Code zum Einrichten der Zwei-Faktor-Authentifizierung',
          backupCodes: 'Backup-Codes (gut aufbewahren — für den Fall, dass du die App nicht zur Hand hast):',
          codeLabel: 'Code aus der App',
          verify: 'Code bestätigen',
        },
        disable: {
          explainer: 'Der zweite Faktor wird entfernt. Dafür musst du dein Passwort erneut eingeben.',
          start: 'Zwei-Faktor deaktivieren',
          passwordTitle: 'Passwort bestätigen',
          confirm: 'Deaktivieren',
        },
        passkey: {
          title: 'Passkeys',
          loading: 'Wird geladen …',
          count: '{{count}}',
          body: 'Ein Passkey ist ein zusätzlicher Anmeldeweg ganz ohne Passwort. Du bestätigst die Anmeldung mit deinem Gerät — zum Beispiel per Fingerabdruck oder Gesichtserkennung.',
          // Honest boundary (REQ-007 passkey half): the WebAuthn ceremony runs through the
          // browser's `navigator.credentials`; the native app has no such API yet.
          webOnly: 'Passkeys funktionieren im Browser. In der App folgen sie später.',
          empty: 'Noch keine Passkeys eingerichtet.',
          unnamed: 'Passkey',
          add: 'Passkey hinzufügen',
          remove: 'Entfernen',
          added: 'Passkey wurde hinzugefügt.',
          removed: 'Passkey wurde entfernt.',
          errGeneric: 'Das hat nicht geklappt. Versuch es noch einmal.',
          errCancelled: 'Abgebrochen.',
          errAlreadyRegistered: 'Dieser Passkey ist bereits eingerichtet.',
        },
        errWrongCode: 'Dieser Code ist nicht richtig. Prüf die App und versuch es noch mal.',
        errWrongPassword: 'Das Passwort ist nicht richtig.',
        errTooManyAttempts: 'Zu viele Versuche. Bitte fordere einen neuen Code an.',
        errLocked: 'Zu viele Fehlversuche — dein Konto ist vorübergehend gesperrt. Versuch es später noch mal.',
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
        // #349 — the honest "we don't know" state, distinct from `GuestNotice` (we know there's
        // no account) and the signed-in content below (we know there is). See `device.
        // sessionUnknown` for the full reasoning; this screen gets its own key rather than
        // sharing that one, matching every other pair of `device`/`datenschutz` strings here.
        sessionUnknown: {
          heading: 'Das können wir gerade nicht prüfen.',
          body: 'Wir können gerade nicht feststellen, ob du angemeldet bist. Versuch es noch mal.',
          retry: 'Noch mal versuchen',
        },
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
      // REQ-015 (#318, Segment 1 of ADR-0031) — the Minimal-Gate: three questions, one per
      // screen, rendered purely against `nextStep()` from `@steuereule/core`. Option *values*
      // stay the German domain vocabulary the graph and (later) the API persist
      // (`packages/core/src/interview.ts`) — only the *label* shown here is translated; see
      // InterviewScreen.tsx's option tables for the value/label split.
      // ADR-0032 removes two controls the DS reference (Interview.jsx) offers but this slice
      // cannot honour — the Gewerbe gate's notify-me button (#83 unbuilt) and the CH-only
      // gate's "Vormerken" button (no storage decided) — so neither has copy here.
      interview: {
        back: 'Zurück zur Frage',
        loading: 'Deine Antworten werden geladen …',
        loadError: {
          heading: 'Das hat nicht geklappt.',
          message: 'Deine Antworten konnten nicht geladen werden. Prüf die Verbindung und versuch es noch mal.',
          retry: 'Noch mal versuchen',
        },
        // #318 task 2 — the client and server disagreeing about the path (409) or the value
        // (400) "should not happen" for a well-behaved client; shown honestly rather than
        // swallowed, never a generic error. `network` covers a genuine connection failure.
        postError: {
          conflict: 'Deine Antwort passte nicht zum gespeicherten Stand. Wir haben deinen Fortschritt aktualisiert.',
          invalid: 'Diese Antwort wurde nicht akzeptiert. Wir haben deinen Fortschritt aktualisiert.',
          network: 'Deine Antwort konnte nicht gespeichert werden. Prüf die Verbindung und versuch es noch mal.',
        },
        job: {
          titleBefore: 'Woher kam dein ',
          titleMark: 'Geld',
          titleAfter: ' 2026?',
          help: 'Mehrfachjobs? Nimm die Hauptquelle — der Rest kommt später.',
          options: {
            angestellt: 'Angestellt',
            selbststaendig: 'Selbstständig',
            beides: 'Beides',
            rente: 'Rente',
          },
        },
        ausland: {
          titleBefore: 'Pendelst du zum Arbeiten ins ',
          titleMark: 'Ausland',
          titleAfter: '?',
          help: 'Grenzgänger haben Sonderregeln — in die Schweiz können wir sie komplett, inklusive 60-Tage-Tracking.',
          options: {
            schweiz: 'Ja, in die Schweiz',
            andereLand: 'In ein anderes Land',
            nein: 'Nein',
          },
        },
        kinder: {
          titleBefore: 'Hast du ',
          titleMark: 'Kinder',
          titleAfter: '?',
          help: 'Kindergeld, Freibeträge, Betreuungskosten — die Günstigerprüfung Kindergeld vs. Freibetrag läuft automatisch.',
          options: {
            nein: 'Nein',
            einKind: '1 Kind',
            mehrere: '2 oder mehr',
          },
        },
        gewerbe: {
          heading: 'Ehrlich: dafür sind wir noch nicht gut genug.',
          body1: 'Selbstständige brauchen EÜR, Anlage G/S und Umsatzsteuer — das kann SteuerEule in Version 1 nicht. Halbe Steuererklärungen liefern wir nicht.',
          body2: 'Was heute schon geht: vorbereiten. Bei „Beides“ sammeln wir deinen Angestellten-Teil komplett ein — abgegeben wird erst, wenn das Gewerbe drin ist. Eine Steuererklärung ist unteilbar.',
          prepareEmployeePart: 'Angestellten-Teil vorbereiten — Abgabe erst mit Gewerbe',
        },
        chOnly: {
          heading: 'Ehrlich: andere Länder können wir noch nicht.',
          body1: 'Jedes Land hat sein eigenes Abkommen mit eigenen Regeln — Österreich und Frankreich mit Grenzzonen, Luxemburg mit Bagatellgrenze. Halb gerechnet wäre falsch gerechnet.',
          body2: 'Was heute geht: die Schweiz komplett — und dein restliches Steuerjahr sowieso. Österreich, Frankreich und Luxemburg stehen auf der Liste.',
          continueWithoutForeign: 'Ohne Auslands-Teil weitermachen',
        },
      },
      // REQ-016 (ticket 08) — the LStB guided mask: three fields, each erfasst/offen/unklar,
      // and a named widerspruch (ADR-008) rather than a silent fix. The state comes from the
      // server (ADR-0033); this screen only renders it and sends whole-euro values.
      lstb: {
        back: 'Zurück',
        heading: 'Deine Lohnsteuerbescheinigung',
        help: 'Übertrag die drei Werte aus deiner Lohnsteuerbescheinigung — Feld für Feld, in der Reihenfolge des Papiers.',
        loading: 'Deine Lohnsteuerbescheinigung wird geladen …',
        loadError: {
          heading: 'Das hat nicht geklappt.',
          message: 'Deine Lohnsteuerbescheinigung konnte nicht geladen werden. Prüf die Verbindung und versuch es noch mal.',
          retry: 'Noch mal versuchen',
        },
        felder: {
          bruttoarbeitslohn: 'Bruttoarbeitslohn (Zeile 3)',
          lohnsteuer: 'Einbehaltene Lohnsteuer (Zeile 4)',
          sozialversicherung: 'SV-Arbeitnehmeranteil (Zeilen 22/23)',
        },
        feld: {
          placeholder: 'Ganzzahlige Euro',
          unklar: 'unlesbar',
        },
        zustand: {
          unvollstaendig: 'Noch {{offen}} offen, {{unklar}} unlesbar.',
          widerspruch: 'Das passt nicht zusammen:',
          vollstaendig: 'Alles erfasst ✓',
        },
        widerspruch: {
          'lohnsteuer-uebersteigt-brutto': 'Die Lohnsteuer ist höher als der Bruttoarbeitslohn.',
          'sozialversicherung-uebersteigt-brutto': 'Die SV-Beiträge sind höher als der Bruttoarbeitslohn.',
        },
        weiter: 'Weiter',
      },
      // REQ-022 (ticket 10.4) — the Rentner guided mask (product ADR-034, Anlage R). The
      // Rentenart values are the German domain vocabulary; only the labels live here (ADR-0033).
      rente: {
        back: 'Zurück',
        heading: 'Deine Rente',
        help: 'Übertrag die Angaben aus deiner Rentenbezugsmitteilung — Rentenart, Jahresbetrag und Rentenbeginn.',
        loading: 'Deine Rente wird geladen …',
        loadError: {
          heading: 'Das hat nicht geklappt.',
          message: 'Deine Rente konnte nicht geladen werden. Prüf die Verbindung und versuch es noch mal.',
          retry: 'Noch mal versuchen',
        },
        artHeading: 'Welche Rente beziehst du?',
        arten: {
          GesetzlicheRente: 'Gesetzliche Rente',
          Betriebsrente: 'Betriebsrente / PK',
          PrivateRentenversicherung: 'Private Rentenversicherung',
          WitwenWaisenrente: 'Witwen-/Waisenrente',
          AuslaendischeRente: 'Ausländische Rente (CH AHV)',
        },
        felder: {
          jahresbetrag: 'Jahresbetrag der Rente',
          rentenbeginnJahr: 'Jahr des Rentenbeginns',
          alterBeiRentenbeginn: 'Alter bei Rentenbeginn',
        },
        feld: {
          placeholder: 'Ganzzahliger Wert',
          unklar: 'unlesbar',
        },
        posten: {
          heading: 'Steuerpflichtiger Anteil',
          offen: 'Noch nicht ermittelbar — trag die fehlenden Angaben ein.',
        },
        weiter: 'Weiter',
      },
      // REQ-025 (ticket 10.5) — the Kapital guided mask + § 32d Abs. 6 Günstigerprüfung
      // (product ADR-032, Anlage KAP). The depot kinds are the server-derived Einordnung;
      // only the labels live here (ADR-0033).
      kapital: {
        back: 'Zurück',
        heading: 'Kapital & Depot',
        help: 'Übertrag deine Kapitalerträge aus der Jahressteuerbescheinigung deiner Bank.',
        loading: 'Deine Kapitalerträge werden geladen …',
        loadError: {
          heading: 'Das hat nicht geklappt.',
          message: 'Deine Kapitalerträge konnten nicht geladen werden. Prüf die Verbindung und versuch es noch mal.',
          retry: 'Noch mal versuchen',
        },
        depot: {
          deutscherBroker: 'Deine Bank hat Abgeltungsteuer einbehalten. Unten rechnen wir ehrlich nach, ob die Abgeltungsteuer oder dein persönlicher Steuersatz günstiger ist.',
          auslaendischerBroker: 'Ausländischer Broker: Es wurde keine deutsche Steuer abgeführt. Diese Kapitalerträge musst du in Anlage KAP erklären — sie werden mit deinem persönlichen Steuersatz versteuert. Wir erfinden hier keine Abgeltungsteuer.',
          krypto: 'Krypto bleibt in 1.0 ehrlich außen vor: Haltefristen und Anschaffungskosten rechnen wir noch nicht. Kein halbes Feature.',
          unbekannt: 'Sag uns im Interview zuerst, ob dein Depot bei einem deutschen oder ausländischen Broker liegt.',
        },
        feld: {
          label: 'Kapitalerträge (Einkünfte aus Kapitalvermögen)',
          placeholder: 'Ganzzahliger Wert',
          unklar: 'unlesbar',
        },
        posten: {
          heading: 'Deine Kapitalerträge',
          herkunft: 'Eingabe aus deiner Jahressteuerbescheinigung',
          offen: 'Noch nicht ermittelbar — trag deine Kapitalerträge ein.',
        },
        guenstigerpruefung: {
          heading: 'Günstigerprüfung (§ 32d Abs. 6 EStG)',
          eindeutigAbgeltung: 'Die Abgeltungsteuer ist günstiger.',
          eindeutigPersoenlich: 'Dein persönlicher Steuersatz ist günstiger.',
          zuKnapp: 'Zu knapp, um das zu sagen.',
          unbestimmt: 'Das können wir noch nicht sagen.',
          abgeltung: 'Abgeltungsteuer (25 % + Soli)',
          persoenlich: 'Persönlicher Steuersatz (Tarif)',
          progressionsvorbehaltHinweis: 'Ehrlich: der Progressionsvorbehalt (Lohnersatz) ist hier noch nicht berücksichtigt.',
          keineAbgeltungEinbehalten: 'Keine Abgeltungsteuer einbehalten — die Günstigerprüfung stellt sich hier nicht.',
          kryptoGegated: 'Krypto bleibt 2.0 — keine Günstigerprüfung für Krypto.',
          kapDepotNichtBeantwortet: 'Erst die Depot-Frage im Interview beantworten — dann wissen wir, ob die Günstigerprüfung anwendbar ist.',
          keineKapitalertraege: 'Trag zuerst deine Kapitalerträge ein — dann rechnen wir den Vergleich.',
        },
        weiter: 'Weiter',
      },
      // REQ-026 (ticket 10.6) — the Vermietung guided mask (product ADR-033, Anlage V einfach).
      vermietung: {
        back: 'Zurück',
        heading: 'Deine Vermietung',
        help: 'Erfass deine ganzjährig vermieteten Objekte — je Objekt eine Anlage V mit linearer AfA.',
        loading: 'Deine Vermietung wird geladen …',
        loadError: {
          heading: 'Das hat nicht geklappt.',
          message: 'Deine Vermietung konnte nicht geladen werden. Prüf die Verbindung und versuch es noch mal.',
          retry: 'Noch mal versuchen',
        },
        einordnung: {
          berechenbar: 'Ganzjährig vermietete Objekte rechnen wir: je Objekt eine Anlage V, lineare AfA nach § 7 Abs. 4 EStG.',
          verkaufOderMoebliert: 'Verkauf oder möbliert-auf-Zeit bleibt in 1.0 ehrlich außen vor: Fristen und Abgrenzung rechnen wir noch nicht. Kein halbes Feature.',
          unbekannt: 'Sag uns im Interview zuerst, ob du vermietest — und ob du verkauft oder möbliert-auf-Zeit vermietest.',
        },
        felder: {
          mieteinnahmen: 'Mieteinnahmen (Jahreskaltmiete)',
          anschaffungskosten: 'Anschaffungskosten (Gebäudeanteil)',
          baujahr: 'Baujahr (Fertigstellung)',
          werbungskosten: 'Laufende Werbungskosten',
        },
        feld: {
          placeholder: 'Ganzzahliger Wert',
          unklar: 'unlesbar',
        },
        objektHeading: 'Objekt {{index}}',
        addObjekt: 'Weiteres Objekt hinzufügen',
        fakten: {
          leer: 'Noch nichts erfasst — trag die Felder ein.',
          miete: 'Mieteinnahmen: {{betrag}}',
          werbungskosten: 'Werbungskosten: {{betrag}}',
          afa: 'Lineare AfA: {{betrag}}',
          offen: 'Noch offen: {{count}} Angabe(n) fehlen.',
        },
        stand: {
          heading: 'Summe über alle Objekte',
          einnahmen: 'Mieteinnahmen: {{betrag}}',
          werbungskosten: 'Werbungskosten: {{betrag}}',
          afa: 'Lineare AfA: {{betrag}}',
          offen: 'Noch offen: {{count}} Angabe(n) — die Summen zeigen nur das Erfasste.',
          gated: 'Ehrlich: Verkauf oder möbliert rechnen wir in 1.0 noch nicht.',
        },
        weiter: 'Weiter',
      },
      // REQ-027 (ticket 10.7) — der Fristen-Warnmodus (§ 149/§ 152 AO). Nüchtern (ADR-023),
      // ein Banner, NIE ein Status (ADR-0039).
      fristen: {
        warnung: 'Abgabefrist: {{frist}} (noch {{tage}} Tage). Bei Verspätung fällt ein Verspätungszuschlag an — mindestens {{mindestsatz}} pro Monat (§ 152 AO).',
        abgelaufen: 'Die Abgabefrist {{frist}} ist um {{tage}} Tage überschritten. Verspätungszuschlag (§ 152 AO): mindestens {{mindestsatz}} pro Monat — reich die Erklärung bald ein.',
      },
      // REQ-017 (ticket 08) — the on-demand catalogue (Lebenslagen + Sonderausgaben), walked by
      // the same engine as the Minimal-Gate. Question ids are the German domain vocabulary;
      // only the labels live here (the values persist byte-equal, ADR-0033).
      katalog: {
        back: 'Zurück',
        loading: 'Wird geladen …',
        loadError: {
          heading: 'Das hat nicht geklappt.',
          message: 'Deine Angaben konnten nicht geladen werden. Prüf die Verbindung und versuch es noch mal.',
          retry: 'Noch mal versuchen',
        },
        conflict: 'Deine Antwort passte nicht zum gespeicherten Stand. Wir haben deinen Fortschritt aktualisiert.',
        progress: '{{done}} von {{total}}',
        amountPlaceholder: 'Ganzzahlige Euro',
        questions: {
          dhf: 'Hast du eine doppelte Haushaltsführung?',
          'dhf-miete': 'Monatliche Miete am Arbeitsort',
          umzug: 'Bist du beruflich umgezogen?',
          'umzug-kosten': 'Umzugskosten',
          abfindung: 'Hast du eine Abfindung bekommen?',
          'abfindung-betrag': 'Abfindungsbetrag',
          lohnersatz: 'Hattest du Lohnersatz (Kurzarbeit, Elterngeld …)?',
          'lohnersatz-betrag': 'Lohnersatz-Betrag',
          nebenjob: 'Hast du einen Nebenjob?',
          'nebenjob-brutto': 'Nebenjob-Brutto',
          spenden: 'Hast du gespendet?',
          'spenden-betrag': 'Spendenbetrag',
          'kv-pv': 'Zahlst du Kranken-/Pflegeversicherung?',
          'kv-pv-betrag': 'KV/PV-Beiträge',
          riester: 'Hast du einen Riester-Vertrag?',
          'riester-betrag': 'Riester-Beitrag',
        },
        options: {
          Ja: 'Ja',
          Nein: 'Nein',
          Minijob: 'Minijob',
          Midijob: 'Midijob',
          Nebenjob: 'Nebenjob',
        },
      },
      // M4 (ticket 08) — the Arbeitstage assistant: calendar logic from the core, no free text.
      arbeitstage: {
        back: 'Zurück',
        heading: 'Deine Arbeitstage',
        help: 'Wähl deine Arbeitstage und trag Urlaub, Krankheit und Homeoffice ein. Wir zählen aus dem echten Kalender — kein Schätzwert.',
        weekdays: 'An welchen Tagen arbeitest du?',
        weekdayNames: { 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa', 7: 'So' },
        urlaub: 'Urlaubstage',
        krank: 'Krankheitstage',
        homeoffice: 'Homeoffice-Tage',
        daysPlaceholder: '0',
        wochentage: 'Wochentage im Jahr',
        werktage: 'Werktage',
        pendlertage: 'Pendlertage',
        honestyNote: 'Ehrlich: gesetzliche Feiertage sind noch nicht abgezogen — die Zahlen sind Werktage, keine Arbeitstage.',
        widerspruch: 'Das passt nicht zusammen.',
        widerspruchBody: 'Mehr Urlaubs-/Krankheitstage als Werktage — prüf deine Eingaben.',
        weiter: 'Weiter',
      },
      // M2 (ticket 08) — the Plausibilitäts-Prüfung: honest Widersprüche/Hinweise, no fake Ampel.
      plausibilitaet: {
        back: 'Zurück',
        loading: 'Deine Prüfung wird geladen …',
        loadError: {
          heading: 'Das hat nicht geklappt.',
          message: 'Deine Prüfung konnte nicht geladen werden. Prüf die Verbindung und versuch es noch mal.',
          retry: 'Noch mal versuchen',
        },
        heading: 'Prüfung vor Abgabe',
        einreichbar: 'Alles klar — du kannst abgeben.',
        nichtEinreichbar: 'Da ist noch etwas offen:',
        weiterZumVergleich: 'Weiter zum Veranlagungsartenvergleich',
        // Ticket 15 review F3 — the werktage/Pendlerpauschale check is not run this slice; the
        // screen says so instead of letting "einreichbar" read as "everything was checked".
        werktageNote: 'Ehrlich: die Arbeitstage- und Pendlerpauschale-Prüfung folgt in einem späteren Schritt.',
        widersprueche: 'Widersprüche',
        hinweise: 'Hinweise',
        widerspruch: {
          'lstb-offen': 'Lohnsteuerbescheinigung noch nicht vollständig.',
          'lstb-unklar': 'Lohnsteuerbescheinigung: ein Feld ist unlesbar.',
          'lstb-widerspruch': 'Lohnsteuerbescheinigung widerspricht sich.',
          'werktage-widerspruch': 'Die Arbeitstage widersprechen sich.',
          'gated-einkunftsart': 'Eine Einkunftsart können wir noch nicht rechnen.',
        },
        hinweis: {
          'erfasst-nicht-gerechnet': 'Erfasste, aber noch nicht gerechnete Beträge sind vorhanden.',
          'werbungskosten-uebersteigt-einnahmen': 'Deine Werbungskosten übersteigen die Einnahmen.',
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
          message: 'Für dieses Steuerjahr liegen noch keine Angaben vor. Sobald deine Daten da sind, zeigen wir dir hier dein erfasstes Einkommen.',
        },
        hero: {
          // Ticket 15 — the Schätz-Platzhalter is gone; the hero now shows the deterministic
          // fold from @steuereule/core (berechne + cockpitSpanne). The number is the settled
          // INCOME (LStB Brutto + Nebenjob), never a refund — the tariff/Erstattung formula is a
          // later slice, stated honestly rather than faked (ADR-0032).
          label: 'Erfasstes Einkommen',
          openItems_one: '{{count}} Frage offen',
          openItems_other: '{{count}} Fragen offen',
          offenePosten_one: '{{count}} Posten offen',
          offenePosten_other: '{{count}} Posten offen',
          herkunftRegel: 'Spannen-Regel · ADR-015',
          herkunftRechenweg_one: '{{count}} offener Posten × {{perItem}} Unsicherheit',
          herkunftRechenweg_other: '{{count}} offene Posten × {{perItem}} Unsicherheit',
          // ADR-032 — a declared-but-uncomputable Einkunftsart is named, never widened into a
          // numeric range. `{{name}}` is the German domain vocabulary (e.g. "Gewerbe").
          gatedHeading: 'Ehrlich: dafür sind wir noch nicht gut genug.',
          gatedBody: '{{name}} kann SteuerEule in Version 1 noch nicht rechnen. Dein erfasstes Einkommen bleibt sichtbar — abgegeben wird erst, wenn alles drin ist.',
          refundLater: 'Die Erstattung rechnen wir in einem späteren Schritt.',
        },
        refresh: 'Aktualisieren',
        refreshing: 'Wird aktualisiert …',
        // #318 task 2 — the Minimal-Gate is now reachable from here (the revisit CockpitScreen.tsx
        // itself named): the one primary action while items are open, demoting "Aktualisieren" to
        // the secondary slot (one primary action per screen, design-system CLAUDE.md).
        answerQuestions: 'Fragen beantworten',
        // REQ-023 — the Bescheidprüfung entry (eigener Bereich, ticket 10.3).
        checkBescheid: 'Bescheid prüfen',
        checkKapital: 'Kapital & Depot prüfen',
        checkVermietung: 'Vermietung prüfen',
      },
      // Ticket 10 (Phase 2, Slice 1) — Beleg-Posteingang (ADR-007/008). The upload affordance is
      // deliberately a HONEST placeholder, not a scan/PDF button: binary storage is a follow-up
      // (ADR-036/045), so a button that promises a stored file would be exactly the fake the
      // honesty rule (ADR-032 §2) forbids.
      belege: {
        appbarTitle: 'Belege',
        loading: 'Deine Belege werden geladen …',
        loadError: {
          heading: 'Das hat nicht geklappt.',
          message: 'Deine Belege konnten nicht geladen werden. Prüf die Verbindung und versuch es noch mal.',
          retry: 'Noch mal versuchen',
        },
        offen_one: '{{count}} offen',
        offen_other: '{{count}} offen',
        empty: {
          heading: 'Noch keine Belege.',
          message: 'Wirf Belege übers ganze Jahr rein — hier landen sie und warten auf das richtige Steuerjahr.',
        },
        scanFolgt: {
          heading: 'Wirf alles rein — wir sortieren',
          body: 'Das Scannen und Fotografieren der Belege folgt noch. Sobald es da ist, landen deine Belege hier und ordnen sich automatisch dem richtigen Steuerjahr zu.',
        },
        zuordnung: {
          ungebunden: 'Unzugeordnet',
          vorgeschlagen: 'Vorschlag: {{jahr}}',
          zugeordnet: 'Zugeordnet: {{jahr}}',
          regelZahlungsdatum: 'Regel: Zahlungsdatum',
          regelBelegdatum: 'Regel: Belegdatum',
          confirm: 'Zuordnen zu {{jahr}}',
          otherYear: 'Anderes Jahr',
          otherYearLabel: 'Steuerjahr',
          otherYearConfirm: 'Diesem Jahr zuordnen',
          otherYearCancel: 'Abbrechen',
          yearInvalid: 'Bitte ein Jahr mit vier Ziffern eingeben.',
          konflikt: {
            heading: 'Zwei Jahre für diesen Beleg — du entscheidest.',
            body: 'Zugeordnet: {{zugeordnet}} · Vorschlag: {{vorschlag}}. Bis das geklärt ist, zählt dieser Beleg nicht.',
            resolve: 'Vorschlag {{jahr}} übernehmen',
            keep: 'Bei {{jahr}} bleiben',
          },
        },
        art: {
          generic: 'Beleg',
          lohnausweis: 'Lohnausweis',
          quellensteuer: 'Quellensteuer',
          pensionskasse: 'Pensionskasse',
          saeule3a: 'Säule 3a',
          krankenkasse: 'Krankenkasse',
          familienzulage: 'Familienzulage',
          rentenbezugsmitteilung: 'Rentenbezugsmitteilung',
          sonstiges: 'Sonstiges',
        },
        datum: {
          belegdatum: 'Belegdatum',
          zahlungsdatum: 'Zahlungsdatum',
        },
      },
      // REQ-023 (ticket 10.3) — Bescheidprüfung: der Steuerbescheid wird Feld für Feld
      // eingetippt (ADR-036), gegen den Kern abgeglichen (Diff, nie still) und nach dem Bescheid
      // gibt es den Einspruch-Flow (§ 355 AO). KEIN „Korrigieren" nach dem Bescheid (ADR-009/032).
      bescheid: {
        back: 'Zurück',
        heading: 'Dein Steuerbescheid',
        help: 'Übertrag die Beträge aus deinem Steuerbescheid — Feld für Feld, wie auf dem Papier.',
        loading: 'Dein Bescheid wird geladen …',
        loadError: {
          heading: 'Das hat nicht geklappt.',
          message: 'Dein Bescheid konnte nicht geladen werden. Prüf die Verbindung und versuch es noch mal.',
          retry: 'Noch mal versuchen',
        },
        felder: {
          einnahmen: 'Einkünfte laut Bescheid',
          vorsorgeaufwand: 'Vorsorgeaufwendungen laut Bescheid',
          anrechnung: 'Anrechenbare Steuern laut Bescheid',
          festgesetzteSteuer: 'Festgesetzte Einkommensteuer',
          erstattung: 'Erstattung / Nachzahlung',
        },
        feld: {
          placeholder: 'Ganzzahlige Euro',
          unklar: 'unlesbar',
        },
        datum: {
          label: 'Bescheiddatum (JJJJ-MM-TT)',
        },
        frist: {
          nochKeinDatum: 'Trag das Bescheiddatum ein, damit wir deine Einspruchsfrist zählen.',
          heading: 'Einspruchsfrist',
          verbleibend: 'Noch {{tage}} Tage — bis {{ende}}.',
          abgelaufen: 'Die Einspruchsfrist (bis {{ende}}) ist abgelaufen.',
        },
        abgleich: {
          heading: 'Abgleich mit deiner Berechnung',
          stimmt: 'Alles stimmt überein ✓',
          unvollstaendig: 'Ehrlich: deine Berechnung ist noch nicht vollständig — der Abgleich ist vorläufig.',
          zeile: 'Bescheid: {{bescheid}} · berechnet: {{berechnet}}',
        },
        status: {
          heading: 'Stand',
          eingegangen: 'Bescheid eingegangen',
          geprüft: 'Geprüft',
          'einspruch-eingelegt': 'Einspruch eingelegt',
          alsGeprueft: 'Als geprüft markieren',
        },
        einspruch: {
          heading: 'Einspruch',
          help: 'Weicht der Bescheid von deiner Berechnung ab, kannst du innerhalb der Frist Einspruch einlegen. Wähl den Grund:',
          eingelegt: 'Einspruch eingelegt: {{grund}}.',
          grund: {
            'betrag-falsch': 'Ein Betrag ist falsch',
            'beleg-nicht-beruecksichtigt': 'Ein Beleg wurde nicht berücksichtigt',
            sonstiges: 'Sonstiges',
          },
        },
        done: 'Fertig',
      },
      grenzgaenger: {
        back: 'Zurück',
        weiter: 'Weiter',
        loading: 'Deine Angaben werden geladen …',        loadError: {
          heading: 'Das hat nicht geklappt.',
          message: 'Deine Angaben konnten nicht geladen werden. Prüf die Verbindung und versuch es noch mal.',
          retry: 'Noch mal versuchen',
        },
        interview: {
          wohnsitz: {
            titleBefore: 'Wo wohnst ',
            titleMark: 'du',
            titleAfter: '?',
            help: 'Ein Grenzgänger wohnt in Deutschland und arbeitet in der Schweiz.',
            deutschland: 'Deutschland',
            schweiz: 'Schweiz',
          },
          tage: {
            titleBefore: 'Wie viele Tage bist du ',
            titleMark: 'nicht',
            titleAfter: ' nach Hause zurückgekehrt?',
            help: 'Mehr als 45 Tage beenden den Grenzgänger-Status (ADR-013).',
            label: 'Nichtrückkehrtage',
            placeholder: '0',
          },
        },
        lohnausweis: {
          title: 'CH-Lohnausweis',
          help: 'Übertrage die Ziffern Feld für Feld — wie auf dem Papier. Beträge in CHF.',
          felder: {
            lohn: 'Lohn (Grundlohn)',
            gehaltsnebenleistungen: 'Gehaltsnebenleistungen',
            'unregelmaessige-leistungen': 'Unregelmäßige Leistungen',
            kapitalleistungen: 'Kapitalleistungen',
            beteiligungsrechte: 'Beteiligungsrechte',
            sitzungsgelder: 'Sitzungsgelder',
            'andere-leistungen': 'Andere Leistungen',
            'bruttolohn-total': 'Total Bruttolohn',
            'ahv-beitraege': 'AHV/IV/EO/ALV/NBUV',
            'berufliche-vorsorge': 'Berufliche Vorsorge (PK)',
            nettolohn: 'Nettolohn',
            quellensteuer: 'Quellensteuerabzug',
            spesen: 'Spesen',
            'weitere-nebenleistungen': 'Weitere Nebenleistungen',
            bemerkungen: 'Bemerkungen',
          },
          ziffer: 'Ziffer {{n}}',
          wechselkurs: {
            title: 'Wechselkurs',
            help: 'Amtlicher BMF-Monatskurs als Standard — ein tatsächlicher Kurs braucht einen Beleg.',
            monat: 'Monat (JJJJ-MM)',
            kurs: 'Kurs (EUR pro 1 CHF)',
            amtlich: 'Amtlich',
          },
          status: {
            label: 'Status',
            echterGrenzgaenger: 'Echter Grenzgänger (≤ 45 Nichtrückkehrtage)',
            keinGrenzgaenger: 'Kein Grenzgänger',
            offen: 'Noch offen — beantworte die zwei Fragen.',
          },
          stand: {
            label: 'Faltung',
            einnahmen: 'Einnahmen',
            vorsorgeaufwand: 'Vorsorgeaufwand',
            anrechnung: 'Quellensteuer-Anrechnung',
            offen: 'Noch {{count}} Pflichtfeld(er) offen',
          },
          done: 'Fertig',
        },
      },
      // Ticket 10.2 (M1) — Veranlagungsartenvergleich (ADR-0034). `aussage`/`kind` zuerst:
      // eine Empfehlung nur, wenn `eindeutig` — sonst ehrlich "zu knapp"/"können wir noch nicht".
      veranlagungsartenvergleich: {
        back: 'Zurück',
        loading: 'Dein Vergleich wird berechnet …',
        loadError: {
          heading: 'Das hat nicht geklappt.',
          message: 'Der Vergleich konnte nicht berechnet werden. Prüf die Verbindung und versuch es noch mal.',
          retry: 'Noch mal versuchen',
        },
        heading: 'Einzel oder zusammen?',
        verheiratetLabel: 'Bist du verheiratet?',
        ja: 'Ja',
        nein: 'Nein',
        partnerEinkommenLabel: 'Partner-Einkommen (zvE-Basis, €)',
        partnerEinkommenPlaceholder: 'z. B. 40000',
        eindeutigZusammen: 'Zusammenveranlagung ist günstiger.',
        eindeutigEinzel: 'Einzelveranlagung ist günstiger.',
        zuKnapp: 'Zu knapp, um das zu sagen.',
        unbestimmt: 'Das können wir noch nicht sagen.',
        nichtVerheiratet: 'Nur Verheiratete können zwischen Einzel- und Zusammenveranlagung wählen.',
        keineEinnahmen: 'Noch kein Einkommen erfasst — es gibt nichts zu vergleichen.',
        einzel: 'Einzelveranlagung',
        zusammen: 'Zusammenveranlagung',
        herkunftRegelEinzel: '§32a EStG Grundtarif + Soli §4 SolZG',
        herkunftRegelZusammen: '§32a Abs. 5 Splitting + Soli §4 SolZG',
        herkunftRechenweg: 'zvE-Basis: {{zveA}} + {{zveB}} (Einnahmen — noch kein echtes zvE)',
        progressionsvorbehaltHinweis: 'Ehrlich: der Progressionsvorbehalt (Lohnersatz) ist hier noch nicht berücksichtigt.',
      },
    },
  },
  en: {
    [APP_NS]: {
      brand: { steuer: 'Steuer', eule: 'Eule' },
      tabs: { cockpit: 'Cockpit', belege: 'Receipts', profil: 'Profile' },
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
        apple: 'Continue with Apple',
        googleNotConfigured: "Google isn't set up on this device — the other ways are still open to you.",
        googleUnknown: "We can't tell right now whether Google is available.",
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
        // REQ-007 — 2FA challenge shown after the primary factor (email+password) succeeds.
        twoFactor: {
          heading: 'Second factor',
          body: 'Your account ({{email}}) is protected by a second factor. Enter the code from your authenticator app.',
          codeLabel: 'Code from your authenticator app',
          submit: 'Confirm',
        },
        errEmail: "That doesn't look like an email yet.",
        errPass: 'At least 6 characters for the password.',
        apiUnreachable: {
          heading: "Not reachable right now — that's on us.",
          body: "Our servers aren't answering. Your data is safe, nothing is lost.",
          bodyRetrying: "Our servers aren't answering. Your data is safe, nothing is lost. We're automatically trying again.",
        },
        qr: {
          heading: 'Sign in with your phone',
          body: "Scan the code with your phone's camera — you're already signed in there.",
          accessibilityLabel: 'QR code to sign in with your phone',
          loading: 'Generating code …',
          denied: 'Sign-in was not confirmed.',
          expired: 'Code expired.',
          requestNew: 'Show a new code',
          error: 'Could not generate a code.',
          retry: 'Try again',
          rateLimited: 'Too many requests just now. Try again in a few seconds.',
          retryingAuto: 'Automatically trying again …',
          retryExhausted: 'Automatic retries are paused — please try again yourself.',
          knapp: 'Expiring soon — {{time}} left',
          remaining: '{{time}} left',
          copy: 'Copy',
          copied: '✓ Copied',
          approved: {
            heading: "That's it — you're in.",
            body: 'Approved via your phone. Your tax year is loading.',
          },
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
        backToLogin: 'Already have an account? Log in',
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
          later: "Don't have it right now — add it later in Profile",
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
          steuerIdLater: 'later',
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
      funnel: {
        kontoWand: {
          sticker: 'Path found',
          titleBefore: 'Your path: ',
          titleAfter: '',
          pfad: { angestellte: 'Employee', rente: 'Pension', ch: 'Swiss cross-border' },
          help: 'Three answers, and we know which return fits you. Here is what comes next:',
          nextLabel: 'Up next',
          schritte: {
            lstb: 'Type in or scan your Lohnsteuerbescheinigung',
            lebenslagen: 'Moved, side job, severance? Tick it off',
            sonderausgaben: 'Donations, insurance, Riester',
            rentenbescheid: 'Take over your pension statement',
            kvpv: 'Check health and care insurance',
            lohnausweis: 'Take over your Swiss Lohnausweis',
            nichtrueckkehrtage: 'Count your non-return days',
          },
          honest: 'We only show a refund once we can actually calculate it — not before.',
          register: 'Create account and continue',
          login: 'I already have an account',
          later: 'Later — take me to the Cockpit',
          note: 'Your answers move into your account. Until then they sit encrypted in your guest session.',
        },
      },
      device: {
        sessionChecking: 'Checking your sign-in …',
        sessionUnknown: {
          heading: "We can't check that right now.",
          body: "We can't tell right now whether you're signed in. Try again.",
          retry: 'Try again',
        },
        missingCode: {
          heading: 'No code given',
          body: 'Open the link or QR code again from the screen that wants to sign in.',
        },
        approval: {
          loading: 'Loading the request …',
          error: {
            heading: 'Code invalid or expired',
            body: 'Request a new code on the other screen.',
          },
          question: 'Is this code currently on your screen?',
          warning: 'A code you received by message or link is never approved here — only a code that is currently shown on another screen.',
          context: {
            browser: 'Browser',
            os: 'Operating system',
            region: 'Region',
            time: 'Time',
            unknownBrowser: 'Unknown browser',
            unknownOs: 'Unknown operating system',
            unknownRegion: 'Unknown region',
            unknownTime: 'Unknown time',
          },
          confirm: 'Yes, this is my code',
          confirming: 'Confirming …',
          approveError: "That didn't work. Please try again.",
          approved: {
            heading: 'Done',
            body: 'The other screen is signing in now.',
          },
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
        sicherheit: {
          rowLabel: 'Security (two-factor)',
        },
        devices: {
          heading: 'Signed-in devices',
          loading: 'Loading devices …',
          loadError: {
            unreachable: "Your devices couldn't be loaded. Check your connection and try again.",
            // Suhay's ruling, #336 — follows the German (ADR-0006); see the `de` block for why.
            refused: "Your devices couldn't be loaded — the server responded, but that didn't work. It isn't your connection.",
            unknown: "Your devices couldn't be loaded. Try again.",
          },
          empty: 'No other devices signed in.',
          browser: 'Browser',
          os: 'Operating system',
          lastActive: 'Last active',
          unknownBrowser: 'Unknown browser',
          unknownOs: 'Unknown operating system',
          unknownTime: 'Unknown time',
          currentDevice: 'This device',
          signOut: 'Sign out',
          revoking: 'Signing out …',
          revokeError: "That didn't work. Please try again.",
        },
      },
      // REQ-007 — Sicherheit (2FA), reached from Profil.
      sicherheit: {
        title: 'Security',
        back: 'Back to profile',
        loading: 'Loading …',
        requiresAccount: 'Two-factor authentication requires a real account — it is not available in guest mode.',
        password: 'Password',
        busy: 'Checking …',
        enabled: 'Two-factor authentication is now on.',
        disabled: 'Two-factor authentication is off.',
        twoFactor: {
          title: 'Two-factor authentication',
          on: 'On',
          off: 'Off',
          body: 'A second factor protects your account in addition to your password. When you sign in, you are asked for the code from your authenticator app.',
        },
        enable: {
          explainer: 'Protect your account with an extra factor. You confirm activation with a code from your authenticator app.',
          start: 'Enable two-factor',
          passwordTitle: 'Confirm your password',
          confirm: 'Continue',
          setupTitle: 'Add to your authenticator app',
          qrLabel: 'QR code to set up two-factor authentication',
          backupCodes: 'Backup codes (keep them safe — for when you don\u2019t have the app to hand):',
          codeLabel: 'Code from the app',
          verify: 'Confirm code',
        },
        disable: {
          explainer: 'The second factor will be removed. You must enter your password again to do this.',
          start: 'Disable two-factor',
          passwordTitle: 'Confirm your password',
          confirm: 'Disable',
        },
        passkey: {
          title: 'Passkeys',
          loading: 'Loading …',
          count: '{{count}}',
          body: 'A passkey is an extra way to sign in with no password at all. You confirm sign-in with your device — for example with your fingerprint or face.',
          // Honest boundary (REQ-007 passkey half): the WebAuthn ceremony runs through the
          // browser's `navigator.credentials`; the native app has no such API yet.
          webOnly: 'Passkeys work in the browser. In the app they will follow later.',
          empty: 'No passkeys set up yet.',
          unnamed: 'Passkey',
          add: 'Add passkey',
          remove: 'Remove',
          added: 'Passkey was added.',
          removed: 'Passkey was removed.',
          errGeneric: "That didn't work. Please try again.",
          errCancelled: 'Cancelled.',
          errAlreadyRegistered: 'This passkey is already set up.',
        },
        errWrongCode: "That code isn't right. Check the app and try again.",
        errWrongPassword: "That password isn't right.",
        errTooManyAttempts: 'Too many attempts. Please request a new code.',
        errLocked: 'Too many failed attempts — your account is temporarily locked. Try again later.',
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
        sessionUnknown: {
          heading: "We can't check that right now.",
          body: "We can't tell right now whether you're signed in. Try again.",
          retry: 'Try again',
        },
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
      interview: {
        back: 'Back to the question',
        loading: 'Loading your answers …',
        loadError: {
          heading: "That didn't work.",
          message: "Your answers couldn't be loaded. Check your connection and try again.",
          retry: 'Try again',
        },
        postError: {
          conflict: "Your answer didn't match what was already saved. We've refreshed your progress.",
          invalid: "That answer wasn't accepted. We've refreshed your progress.",
          network: "Your answer couldn't be saved. Check your connection and try again.",
        },
        job: {
          titleBefore: 'Where did your ',
          titleMark: 'money',
          titleAfter: ' come from in 2026?',
          help: 'Multiple jobs? Use your main source — the rest comes later.',
          options: {
            angestellt: 'Employed',
            selbststaendig: 'Self-employed',
            beides: 'Both',
            rente: 'Pension',
          },
        },
        ausland: {
          titleBefore: 'Do you commute abroad for ',
          titleMark: 'work',
          titleAfter: '?',
          help: 'Cross-border commuters have special rules — we can do Switzerland completely, including 60-day tracking.',
          options: {
            schweiz: 'Yes, to Switzerland',
            andereLand: 'To another country',
            nein: 'No',
          },
        },
        kinder: {
          titleBefore: 'Do you have ',
          titleMark: 'children',
          titleAfter: '?',
          help: 'Child benefit, allowances, childcare costs — the child-benefit-vs-allowance comparison runs automatically.',
          options: {
            nein: 'No',
            einKind: '1 child',
            mehrere: '2 or more',
          },
        },
        gewerbe: {
          heading: "Honestly: we're not good enough for that yet.",
          body1: "Self-employed returns need EÜR, Anlage G/S and VAT — SteuerEule can't do that in version 1. We don't ship half tax returns.",
          body2: 'What works today: preparing. For "Both" we collect your employee part completely — filing only happens once your business return is in too. A tax return is indivisible.',
          prepareEmployeePart: 'Prepare the employee part — filing waits for the business return',
        },
        chOnly: {
          heading: "Honestly: we can't do other countries yet.",
          body1: "Every country has its own treaty with its own rules — Austria and France with border zones, Luxembourg with a minor-amount threshold. Half-computed would be wrong.",
          body2: 'What works today: Switzerland, completely — and the rest of your tax year regardless. Austria, France and Luxembourg are on the list.',
          continueWithoutForeign: 'Continue without the foreign part',
        },
      },
      lstb: {
        back: 'Back',
        heading: 'Your wage tax statement',
        help: 'Copy the three figures from your wage tax statement (Lohnsteuerbescheinigung) — field by field, in the paper\u2019s own order.',
        loading: 'Loading your wage tax statement …',
        loadError: {
          heading: "That didn't work.",
          message: "Your wage tax statement couldn't be loaded. Check your connection and try again.",
          retry: 'Try again',
        },
        felder: {
          bruttoarbeitslohn: 'Gross pay (line 3)',
          lohnsteuer: 'Withheld income tax (line 4)',
          sozialversicherung: 'Employee social-insurance share (lines 22/23)',
        },
        feld: {
          placeholder: 'Whole euros',
          unklar: 'unreadable',
        },
        zustand: {
          unvollstaendig: 'Still {{offen}} open, {{unklar}} unreadable.',
          widerspruch: "This doesn't add up:",
          vollstaendig: 'All entered ✓',
        },
        widerspruch: {
          'lohnsteuer-uebersteigt-brutto': 'The withheld income tax exceeds the gross pay.',
          'sozialversicherung-uebersteigt-brutto': 'The social-insurance share exceeds the gross pay.',
        },
        weiter: 'Continue',
      },
      // REQ-022 (ticket 10.4) — the Rentner guided mask (product ADR-034, Anlage R).
      rente: {
        back: 'Back',
        heading: 'Your pension',
        help: 'Copy the figures from your pension notification (Rentenbezugsmitteilung) — pension type, annual amount and start.',
        loading: 'Loading your pension …',
        loadError: {
          heading: "That didn't work.",
          message: "Your pension couldn't be loaded. Check your connection and try again.",
          retry: 'Try again',
        },
        artHeading: 'Which pension do you receive?',
        arten: {
          GesetzlicheRente: 'Statutory pension',
          Betriebsrente: 'Company pension',
          PrivateRentenversicherung: 'Private pension plan',
          WitwenWaisenrente: 'Widow\u2019s/orphan\u2019s pension',
          AuslaendischeRente: 'Foreign pension (CH AHV)',
        },
        felder: {
          jahresbetrag: 'Annual pension amount',
          rentenbeginnJahr: 'Year the pension started',
          alterBeiRentenbeginn: 'Age when the pension started',
        },
        feld: {
          placeholder: 'Whole number',
          unklar: 'unreadable',
        },
        posten: {
          heading: 'Taxable share',
          offen: 'Not yet determinable — enter the missing figures.',
        },
        weiter: 'Continue',
      },
      // REQ-025 (ticket 10.5) — the Kapital guided mask + § 32d Abs. 6 Günstigerprüfung (EN).
      kapital: {
        back: 'Back',
        heading: 'Capital & brokerage',
        help: 'Copy your capital income from your bank\u2019s annual tax certificate (Jahressteuerbescheinigung).',
        loading: 'Loading your capital income …',
        loadError: {
          heading: "That didn't work.",
          message: "Your capital income couldn't be loaded. Check your connection and try again.",
          retry: 'Try again',
        },
        depot: {
          deutscherBroker: 'Your bank withheld withholding tax (Abgeltungsteuer). Below we honestly compare it with your personal tax rate.',
          auslaendischerBroker: 'Foreign broker: no German tax was withheld. You must declare this income in Anlage KAP — it is taxed at your personal rate. We never invent a withholding tax here.',
          krypto: 'Crypto honestly stays out of 1.0: holding periods and acquisition costs are not computed yet. No half feature.',
          unbekannt: 'First tell us in the interview whether your brokerage is German or foreign.',
        },
        feld: {
          label: 'Capital income (Einkünfte aus Kapitalvermögen)',
          placeholder: 'Whole number',
          unklar: 'unreadable',
        },
        posten: {
          heading: 'Your capital income',
          herkunft: 'Entered from your Jahressteuerbescheinigung',
          offen: 'Not yet determinable — enter your capital income.',
        },
        guenstigerpruefung: {
          heading: 'Günstigerprüfung (§ 32d Abs. 6 EStG)',
          eindeutigAbgeltung: 'The flat withholding tax is cheaper.',
          eindeutigPersoenlich: 'Your personal tax rate is cheaper.',
          zuKnapp: 'Too close to call.',
          unbestimmt: "We can't say that yet.",
          abgeltung: 'Withholding tax (25 % + solidarity surcharge)',
          persoenlich: 'Personal tariff',
          progressionsvorbehaltHinweis: 'Honestly: the progression proviso (wage replacement benefits) is not factored in yet.',
          keineAbgeltungEinbehalten: 'No withholding tax was withheld — the comparison does not arise.',
          kryptoGegated: 'Crypto stays 2.0 — no comparison for crypto.',
          kapDepotNichtBeantwortet: 'Answer the brokerage question in the interview first — then we know whether the comparison applies.',
          keineKapitalertraege: 'Enter your capital income first — then we compute the comparison.',
        },
        weiter: 'Continue',
      },
      // REQ-026 (ticket 10.6) — the Vermietung guided mask (product ADR-033, Anlage V einfach). EN.
      vermietung: {
        back: 'Back',
        heading: 'Your rental property',
        help: 'Enter your year-round rented objects — one Anlage V each, with linear depreciation.',
        loading: 'Loading your rental property …',
        loadError: {
          heading: "That didn't work.",
          message: "Your rental property couldn't be loaded. Check your connection and try again.",
          retry: 'Try again',
        },
        einordnung: {
          berechenbar: 'Year-round rented objects we compute: one Anlage V each, linear depreciation per § 7 Abs. 4 EStG.',
          verkaufOderMoebliert: 'Sale or furnished short-term rental honestly stays out of 1.0: deadlines and delineation are not computed yet. No half feature.',
          unbekannt: 'First tell us in the interview whether you rent out property — and whether you sold or rent furnished short-term.',
        },
        felder: {
          mieteinnahmen: 'Rental income (annual cold rent)',
          anschaffungskosten: 'Acquisition costs (building share)',
          baujahr: 'Year of construction (completion)',
          werbungskosten: 'Running income-related expenses',
        },
        feld: {
          placeholder: 'Whole number',
          unklar: 'unreadable',
        },
        objektHeading: 'Object {{index}}',
        addObjekt: 'Add another object',
        fakten: {
          leer: 'Nothing entered yet — fill in the fields.',
          miete: 'Rental income: {{betrag}}',
          werbungskosten: 'Income-related expenses: {{betrag}}',
          afa: 'Linear depreciation: {{betrag}}',
          offen: 'Still open: {{count}} figure(s) missing.',
        },
        stand: {
          heading: 'Total across all objects',
          einnahmen: 'Rental income: {{betrag}}',
          werbungskosten: 'Income-related expenses: {{betrag}}',
          afa: 'Linear depreciation: {{betrag}}',
          offen: 'Still open: {{count}} figure(s) — the totals show only what was entered.',
          gated: 'Honestly: sale or furnished short-term rental is not computed in 1.0.',
        },
        weiter: 'Continue',
      },
      // REQ-027 (ticket 10.7) — the deadline warning mode (§ 149/§ 152 AO). Sober (ADR-023),
      // a banner, NEVER a status (ADR-0039).
      fristen: {
        warnung: 'Filing deadline: {{frist}} ({{tage}} days left). Late filing incurs a late-filing surcharge — at least {{mindestsatz}} per month (§ 152 AO).',
        abgelaufen: 'The filing deadline {{frist}} passed {{tage}} days ago. Late-filing surcharge (§ 152 AO): at least {{mindestsatz}} per month — file soon.',
      },
      katalog: {
        back: 'Back',
        loading: 'Loading …',
        loadError: {
          heading: "That didn't work.",
          message: "Your details couldn't be loaded. Check your connection and try again.",
          retry: 'Try again',
        },
        conflict: "Your answer didn't match what was saved. We've updated your progress.",
        progress: '{{done}} of {{total}}',
        amountPlaceholder: 'Whole euros',
        questions: {
          dhf: 'Do you keep a second household for work?',
          'dhf-miete': 'Monthly rent at your place of work',
          umzug: 'Did you move for work?',
          'umzug-kosten': 'Moving costs',
          abfindung: 'Did you receive a severance payment?',
          'abfindung-betrag': 'Severance amount',
          lohnersatz: 'Did you receive wage replacement (short-time work, parental allowance …)?',
          'lohnersatz-betrag': 'Wage replacement amount',
          nebenjob: 'Do you have a side job?',
          'nebenjob-brutto': 'Side job gross pay',
          spenden: 'Did you donate?',
          'spenden-betrag': 'Donation amount',
          'kv-pv': 'Do you pay health/long-term care insurance?',
          'kv-pv-betrag': 'Health/care insurance contributions',
          riester: 'Do you have a Riester contract?',
          'riester-betrag': 'Riester contribution',
        },
        options: {
          Ja: 'Yes',
          Nein: 'No',
          Minijob: 'Minijob',
          Midijob: 'Midijob',
          Nebenjob: 'Side job',
        },
      },
      arbeitstage: {
        back: 'Back',
        heading: 'Your work days',
        help: "Pick your work days and enter vacation, sick and home-office days. We count from the real calendar — no estimate.",
        weekdays: 'Which days do you work?',
        weekdayNames: { 1: 'Mo', 2: 'Tu', 3: 'We', 4: 'Th', 5: 'Fr', 6: 'Sa', 7: 'Su' },
        urlaub: 'Vacation days',
        krank: 'Sick days',
        homeoffice: 'Home-office days',
        daysPlaceholder: '0',
        wochentage: 'Weekdays in the year',
        werktage: 'Work days',
        pendlertage: 'Commute days',
        honestyNote: 'Honestly: public holidays are not yet subtracted — these are weekdays, not work days.',
        widerspruch: "This doesn't add up.",
        widerspruchBody: 'More vacation/sick days than work days — check your entries.',
        weiter: 'Continue',
      },
      plausibilitaet: {
        back: 'Back',
        loading: 'Loading your check …',
        loadError: {
          heading: "That didn't work.",
          message: "Your check couldn't be loaded. Check your connection and try again.",
          retry: 'Try again',
        },
        heading: 'Check before filing',
        einreichbar: "All clear — you're ready to file.",
        nichtEinreichbar: 'Something is still open:',
        weiterZumVergleich: 'Continue to the assessment-type comparison',
        werktageNote: "Honestly: the work-days and commuting-allowance check comes in a later step.",
        widersprueche: 'Blockers',
        hinweise: 'Warnings',
        widerspruch: {
          'lstb-offen': 'Wage tax statement not complete yet.',
          'lstb-unklar': 'Wage tax statement: one field is unreadable.',
          'lstb-widerspruch': 'Wage tax statement contradicts itself.',
          'werktage-widerspruch': 'The work days contradict themselves.',
          'gated-einkunftsart': "One income category we can't calculate yet.",
        },
        hinweis: {
          'erfasst-nicht-gerechnet': 'Some captured amounts are not yet calculated.',
          'werbungskosten-uebersteigt-einnahmen': 'Your work-related expenses exceed your income.',
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
          message: "There's nothing on record for this tax year yet. Once your data is in, your recorded income shows up here.",
        },
        hero: {
          label: 'Recorded income',
          openItems_one: '{{count}} question still open',
          openItems_other: '{{count}} questions still open',
          offenePosten_one: '{{count}} item still open',
          offenePosten_other: '{{count}} items still open',
          herkunftRegel: 'Range rule · ADR-015',
          herkunftRechenweg_one: '{{count}} open item × {{perItem}} uncertainty',
          herkunftRechenweg_other: '{{count}} open items × {{perItem}} uncertainty',
          gatedHeading: "Honestly: we're not good enough for this yet.",
          gatedBody: "{{name}} is something SteuerEule can't calculate in version 1 yet. Your recorded income stays visible — nothing is filed until everything is in.",
          refundLater: "We'll calculate the refund in a later step.",
        },
        refresh: 'Refresh',
        refreshing: 'Refreshing …',
        answerQuestions: 'Answer questions',
        checkBescheid: 'Review assessment',
        checkKapital: 'Review capital & brokerage',
        checkVermietung: 'Review rental property',
      },
      // Ticket 10 (Phase 2, Slice 1) — Beleg-Posteingang (ADR-007/008). See the `de` block for
      // why the upload affordance is an honest placeholder, not a fake scan button.
      belege: {
        appbarTitle: 'Receipts',
        loading: 'Loading your receipts …',
        loadError: {
          heading: "That didn't work.",
          message: "Your receipts couldn't be loaded. Check your connection and try again.",
          retry: 'Try again',
        },
        offen_one: '{{count}} open',
        offen_other: '{{count}} open',
        empty: {
          heading: 'No receipts yet.',
          message: 'Throw receipts in all year round — they land here and wait for the right tax year.',
        },
        scanFolgt: {
          heading: 'Throw everything in — we sort it',
          body: 'Scanning and photographing receipts is still to come. Once it is here, your receipts land in this inbox and sort themselves into the right tax year.',
        },
        zuordnung: {
          ungebunden: 'Unassigned',
          vorgeschlagen: 'Suggestion: {{jahr}}',
          zugeordnet: 'Assigned: {{jahr}}',
          regelZahlungsdatum: 'Rule: payment date',
          regelBelegdatum: 'Rule: invoice date',
          confirm: 'Assign to {{jahr}}',
          otherYear: 'Different year',
          otherYearLabel: 'Tax year',
          otherYearConfirm: 'Assign to this year',
          otherYearCancel: 'Cancel',
          yearInvalid: 'Please enter a four-digit year.',
          konflikt: {
            heading: 'Two years for this receipt — you decide.',
            body: 'Assigned: {{zugeordnet}} · Suggestion: {{vorschlag}}. Until resolved, this receipt does not count.',
            resolve: 'Adopt suggestion {{jahr}}',
            keep: 'Keep {{jahr}}',
          },
        },
        art: {
          generic: 'Receipt',
          lohnausweis: 'Salary statement',
          quellensteuer: 'Withholding tax',
          pensionskasse: 'Pension fund',
          saeule3a: 'Pillar 3a',
          krankenkasse: 'Health insurance',
          familienzulage: 'Family allowance',
          rentenbezugsmitteilung: 'Pension notification',
          sonstiges: 'Other',
        },
        datum: {
          belegdatum: 'Invoice date',
          zahlungsdatum: 'Payment date',
        },
      },
    },
      bescheid: {
        back: 'Back',
        heading: 'Your tax assessment',
        help: 'Copy the figures from your tax assessment — field by field, like on the paper.',
        loading: 'Loading your assessment …',
        loadError: {
          heading: "That didn't work.",
          message: "Your assessment couldn't be loaded. Check your connection and try again.",
          retry: 'Try again',
        },
        felder: {
          einnahmen: 'Income per assessment',
          vorsorgeaufwand: 'Pension expenses per assessment',
          anrechnung: 'Creditable taxes per assessment',
          festgesetzteSteuer: 'Assessed income tax',
          erstattung: 'Refund / additional payment',
        },
        feld: {
          placeholder: 'Whole euros',
          unklar: 'unreadable',
        },
        datum: {
          label: 'Assessment date (YYYY-MM-DD)',
        },
        frist: {
          nochKeinDatum: 'Enter the assessment date so we can count your appeal deadline.',
          heading: 'Appeal deadline',
          verbleibend: '{{tage}} days left — until {{ende}}.',
          abgelaufen: 'The appeal deadline (until {{ende}}) has passed.',
        },
        abgleich: {
          heading: 'Comparison with your calculation',
          stimmt: 'Everything matches ✓',
          unvollstaendig: 'Honest: your calculation is not complete yet — the comparison is provisional.',
          zeile: 'Assessment: {{bescheid}} · calculated: {{berechnet}}',
        },
        status: {
          heading: 'Status',
          eingegangen: 'Assessment received',
          geprüft: 'Reviewed',
          'einspruch-eingelegt': 'Appeal filed',
          alsGeprueft: 'Mark as reviewed',
        },
        einspruch: {
          heading: 'Appeal',
          help: 'If the assessment deviates from your calculation, you can appeal within the deadline. Choose the reason:',
          eingelegt: 'Appeal filed: {{grund}}.',
          grund: {
            'betrag-falsch': 'An amount is wrong',
            'beleg-nicht-beruecksichtigt': 'A receipt was not considered',
            sonstiges: 'Other',
          },
        },
        done: 'Done',
      },
      grenzgaenger: {
        back: 'Back',
        weiter: 'Continue',
        loading: 'Loading your details …',
        loadError: {
          heading: "That didn't work.",
          message: "Your details couldn't be loaded. Check your connection and try again.",
          retry: 'Try again',
        },
        interview: {
          wohnsitz: {
            titleBefore: 'Where do ',
            titleMark: 'you',
            titleAfter: ' live?',
            help: 'A Grenzgänger lives in Germany and works in Switzerland.',
            deutschland: 'Germany',
            schweiz: 'Switzerland',
          },
          tage: {
            titleBefore: 'How many days did you ',
            titleMark: 'not',
            titleAfter: ' return home?',
            help: 'More than 45 days ends Grenzgänger status (ADR-013).',
            label: 'Non-return days',
            placeholder: '0',
          },
        },
        lohnausweis: {
          title: 'CH wage statement',
          help: 'Transcribe the boxes field by field — like on paper. Amounts in CHF.',
          felder: {
            lohn: 'Salary (basic)',
            gehaltsnebenleistungen: 'Salary side benefits',
            'unregelmaessige-leistungen': 'Irregular benefits',
            kapitalleistungen: 'Capital benefits',
            beteiligungsrechte: 'Employee share rights',
            sitzungsgelder: 'Meeting fees',
            'andere-leistungen': 'Other benefits',
            'bruttolohn-total': 'Total gross salary',
            'ahv-beitraege': 'AHV/IV/EO/ALV/NBUV',
            'berufliche-vorsorge': 'Occupational pension (PK)',
            nettolohn: 'Net salary',
            quellensteuer: 'Withholding tax',
            spesen: 'Expenses',
            'weitere-nebenleistungen': 'Further side benefits',
            bemerkungen: 'Remarks',
          },
          ziffer: 'Box {{n}}',
          wechselkurs: {
            title: 'Exchange rate',
            help: 'Official BMF monthly rate as standard — an actual rate needs a receipt.',
            monat: 'Month (YYYY-MM)',
            kurs: 'Rate (EUR per 1 CHF)',
            amtlich: 'Official',
          },
          status: {
            label: 'Status',
            echterGrenzgaenger: 'Genuine Grenzgänger (≤ 45 non-return days)',
            keinGrenzgaenger: 'Not a Grenzgänger',
            offen: 'Still open — answer the two questions.',
          },
          stand: {
            label: 'Fold',
            einnahmen: 'Income',
            vorsorgeaufwand: 'Pension/insurance contributions',
            anrechnung: 'Withholding tax credit',
            offen: '{{count}} required field(s) still open',
          },
          done: 'Done',
        },
      },
      veranlagungsartenvergleich: {
        back: 'Back',
        loading: 'Working out your comparison …',
        loadError: {
          heading: "That didn't work.",
          message: "The comparison couldn't be calculated. Check your connection and try again.",
          retry: 'Try again',
        },
        heading: 'Separate or joint?',
        verheiratetLabel: 'Are you married?',
        ja: 'Yes',
        nein: 'No',
        partnerEinkommenLabel: 'Partner income (zvE basis, €)',
        partnerEinkommenPlaceholder: 'e.g. 40000',
        eindeutigZusammen: 'Joint assessment is cheaper.',
        eindeutigEinzel: 'Separate assessment is cheaper.',
        zuKnapp: 'Too close to call.',
        unbestimmt: "We can't say that yet.",
        nichtVerheiratet: 'Only married couples can choose between separate and joint assessment.',
        keineEinnahmen: 'No income recorded yet — there is nothing to compare.',
        einzel: 'Separate assessment',
        zusammen: 'Joint assessment',
        herkunftRegelEinzel: '§32a EStG basic tariff + Soli §4 SolZG',
        herkunftRegelZusammen: '§32a §5 splitting + Soli §4 SolZG',
        herkunftRechenweg: 'zvE basis: {{zveA}} + {{zveB}} (income — not a real zvE yet)',
        progressionsvorbehaltHinweis: 'Honestly: the progression clause (wage-replacement benefits) is not yet factored in here.',
      },
  },
} as const

export type AppLocale = keyof typeof appResources
