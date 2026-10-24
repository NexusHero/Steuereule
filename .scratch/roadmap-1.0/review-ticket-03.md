# Review — Ticket 03 (Phase 0.3 Verdrahtung), Branch `ticket-03-p0-3-verdrahtung` (HEAD 64ed348)

## 1. Verdict

**REQUEST-CHANGES** — eng gefasst. Die Zerlegung ist mechanisch sauber, die Tests decken die
Übergänge, i18n/DoD/ADR-0023 sind eingehalten. Ein Befund blockiert: die einzige verbliebene
rohe Session-Lese (`useDeviceSessions.ts`) ist nicht so begründet, wie das Ticket behauptet, und
ihr Kommentar verweist auf Screens, die den Mechanismus inzwischen *nicht mehr* verwenden. Der
Fix ist klein (Seam konsumieren oder Kommentar/Dateikopf ehrlich korrigieren).

## 2. Findings

### F1 (blocking) — `useDeviceSessions.ts:35-37`: Begründung für die rohe `useSession()`-Lese ist falsch dokumentiert
`apps/mobile-web/src/screens/device/useDeviceSessions.ts`

Das Ticket (`.scratch/roadmap-1.0/issues/03-p0-3-verdrahtung.md:15-17`) behauptet, der direkte
`authClient.useSession()` sei „im Dateikopf begründet", weil er „den rohen `session.token` zum
Vergleich, nicht den abgeleiteten Zustand" brauche. Drei Punkte stimmen so nicht:

1. **Der Dateikopf begründet es nicht.** Der Header (Zeilen 1-12) handelt vollständig von der
   Region-/IP-Adress-Frage (ADR-0021, `ipAddressHeaders`). Über den Grund, warum hier nicht
   `useAccountSession()` konsumiert wird, steht dort nichts.
2. **Der eigentliche Kommentar (Zeile 35-36) ist nach #349 veraltet.** „the same `useSession()`
   read DatenschutzScreen/DeviceScreen already use" — beide Screens nutzen seit diesem Umbau
   `useAccountSession()` (`DatenschutzScreen.tsx:19/45`, `DeviceScreen.tsx:15/29`). Der Kommentar
   ist faktisch falsch und führt den nächsten Leser in die Irre.
3. **Das technische Argument ist schwach.** Der rohe Token ist über die Seam erreichbar:
   `useAccountSession()` liefert im `signed-in`-Zustand `state.session.session.token`. Der
   `isCurrent`-Vergleich (`useDeviceSessions.ts:98`, `currentSession?.session.token ===
   session.token`) funktioniert identisch über die Seam — kein Verhaltensunterschied.

Der ehrliche Grund ist „diese Datei ist älter als #349 und wurde nicht migriert" — tragfähig als
Grund, aber es ist nicht der im Ticket genannte, und er ist nirgends so festgehalten. Zugleich ist
das die exakte Anti-Pattern-Klasse, für die die Seam gebaut wurde (`useAccountSession.ts:1-18`):
ein Konsument, der `data` direkt von `useSession()` liest und `error` stillschweigend fallen
lässt. Für `isCurrent` ist das heutige Verhalten korrekt (im `unknown`/Cold-Start-Fall ist `data`
null → keine Zeile markiert, ehrlich), aber „eine Session-Quelle" (AC-1) ist damit nicht
wortwörtlich erfüllt.

**Vorschlag (eine der beiden Varianten):**
- **A (bevorzugt):** `useAccountSession()` konsumieren und im `signed-in`-Zweig
  `state.session.session.token` lesen — macht die Seam tatsächlich universell, Verhalten
  unverändert.
- **B:** rohe Lese bewusst behalten, aber den Dateikopf um den *echten* Grund ergänzen und den
  Zeile-35-36-Kommentar auf `useAccountSession()` umschreiben (kein Verweis auf Screens, die den
  Mechanismus nicht mehr nutzen).

### F2 (minor) — zwei konkurrierende i18n-Idiome in den Extrakten
Ein Teil der Extrakte nimmt `tr` als Prop (`DeviceQrColumn`, `PageHeader`, `DeleteSection`,
`ExportSection`, die Inline-Sektionen in `DatenschutzScreen`, plus `shared/tr.ts` als Typ dafür);
der andere ruft `useTranslation()` intern auf (`OnboardingSummary`, `ProfilView`, `ProfilEdit`,
`GateScreen`, `PostErrorNotice`, `EmailVerificationBanner`, `SocialSignInSection`). Beide sind
legitim, aber die Zerlegung führt jetzt zwei Stile für denselben Zweck nebeneinander. Kein
Blocker — nur eine Konsistenz-Entscheidung für später.

### F3 (minor) — AC-3 nennt vier Zustände, `ScreenState` deckt drei
`shared/ScreenState.tsx` modelliert nur Loading/Error/Success. Der vierte in AC-3 genannte
Zustand („offline"/„unknown") hat kein gemeinsames Muster; `DatenschutzScreen.tsx:172-199`
rendert sein `SessionChecking`/`SessionUnknown` weiter inline (privat). Das Ticket engt AC-3
selbst ehrlich auf „Lade-/Fehlerzustände" ein, und der dritte „unknown"-Zustand lässt sich in das
dreigliedrige `ScreenState` nicht sauber pressen — daher nur Hinweis, keine Aktion nötig, falls
die Absicht wirklich „loading/error" (nicht „empty/offline") war.

### F4 (nit) — Ticket-Text ist intern inkonsistent bei den „vorher"-Zeilenzahlen
Issue Zeile 32 nennt „`LoginScreen` 727 / `DatenschutzScreen` 520", Zeile 33 „`LoginScreen`
771→227, `DatenschutzScreen` 548→226". Die *aktuellen* Werte (227/226) sind per `wc -l` bestätigt;
die beiden „vorher"-Zahlen widersprechen sich. Kosmetik im Ticket, kein Code-Thema.

## 3. Bestätigt (positiv)

- **Zeilenzahlen stimmen.** `wc -l`: Login 227, Datenschutz 226, Interview 174, Onboarding 201,
  Profil 123, Registrierung 188, Cockpit 229, Device 56, Geraetefreigabe 192 — exakt die
  Ticket-Angaben; alle Screens ≤ ~230 Zeilen.
- **Eine Session-Quelle (außer F1).** Grep über `apps/mobile-web/src/screens` + `App.tsx`:
  der einzige direkte `authClient.useSession()` ist `useDeviceSessions.ts:37`; übrige
  `authClient.*`-Aufrufe sind Aktionen (`signIn`/`signUp`/`sendVerificationEmail`), keine
  Session-Reads. Kein Screen hält einen eigenen authClient-/Session-Aufruf.
- **Navigation als ein Flow.** `RegistrierungScreen` bekommt `onLogin`
  (`RegistrierungScreen.tsx:29/134-137`), in `App.tsx:154` auf `navigation.replace('Login')`
  verdrahtet; Link rendert nur bei vorhandenem Handler (kein toter Affordance, konsistent mit
  `LoginScreen` `onRegister?`). Neuer Test `App.test.tsx:105-121` deckt Login↔Registrierung
  bidirektional ab.
- **ADR-0023 respektiert.** Kein Screen importiert `@react-navigation/*` (nur `App.tsx`); Screens
  bleiben prop-getrieben (`onLogin`/`onRegister`/`onDone`). `useBreakpoint` genau einmal je Screen
  (ADR-0014); Unterkomponenten nehmen `bp` als Prop.
- **i18n sauber.** `registrierung.backToLogin` in `de` und `en` ergänzt; keine harten deutschen
  Strings in neuem Code.
- **Kein neuer Client-Storage.** Diff enthält keine `localStorage`/`AsyncStorage`-Einführung →
  Posture „n/a" (ADR-0008) ist ehrlich.
- **Keine verwaisten Dateien.** Alle neuen Extrakte (`DeleteSection`, `ExportSection`, `GateScreen`,
  `PostErrorNotice`, `QuestionScreen`, `DeviceQrColumn`, `PageHeader`, `OnboardingSummary`,
  `ProfilEdit`, `ProfilView`, `BackButton`, `EmailVerificationBanner`, `ScreenState`,
  `SocialSignInSection`, `StepIndicator`, `styles.ts` × 5, `tr.ts`) werden importiert.
- **Commit-Konvention sauber.** Autor `NexusHero`, `Co-authored-by: Kaan`, kein Tool-Footer.

## 4. Nicht re-verifiziert (Gates)

- **`pnpm -r typecheck` / `pnpm lint` / Testlauf nicht neu ausgeführt** (langsam, wie beauftragt).
  Plausibilität geprüft: Grep über `apps/mobile-web` zählt exakt **380** `it(`/`test(`-Aufrufe,
  deckt sich mit der Agent-Angabe „380 Tests". Der **Grün-Status** selbst ist damit nicht belegt —
  als „nicht re-verifiziert" markiert.
- **DoD-Posture-Zeile** liegt in der PR-Beschreibung (wird erst beim PR-Öffnen sichtbar); aus dem
  Branch allein nicht verifizierbar. Substanz geprüft (kein neuer Client-Storage) → „n/a" wäre
  ehrlich.
