# 03 — Phase 0.3: Verdrahtung (ein Produkt statt Slices)

**What to build:** Die App fühlt sich als *ein* Produkt an: eine Navigation, ein gemeinsamer
Session-/Datenfluss, vereinheitlichte honest states (loading/empty/error). Kein Screen betreibt
mehr ein eigenes Daten-Silo; Profil, Cockpit, Geräte, Datenschutz, Onboarding sprechen dieselbe
Session-Quelle und dieselben UI-Zustände.

**Blocked by:** 02 — Phase 0.2: Framework-Ersatz

**Status:** in-review (Frontend-Teil erledigt; `better-auth.ts` gehört zum API-Track)

- [x] Ein Session-/Auth-Kontext (web + device) wird von allen Screens konsumiert; kein
      Pro-Screen-Eigenlogin oder Parallel-Query-State
      — Session-Read läuft bereits seit #349 über die eine Seam `useAccountSession()`; der
      verbliebene direkte `authClient.useSession()` in `useDeviceSessions.ts` ist bewusst (braucht
      den rohen `session.token` zum Vergleich, nicht den abgeleiteten Zustand — im Dateikopf
      begründet). Neu: die doppelt gehaltene Auth-UI (Social-Slot + E-Mail-Verify-Banner) ist in
      `shared/SocialSignInSection.tsx` / `shared/EmailVerificationBanner.tsx` konsolidiert.
- [x] Navigation als ein zusammenhängender Flow (Gast → Onboarding → App → Profil/…):
      jeder Screen von jedem erreichbaren Zustand aus erreichbar ohne tote Äste
      — Der tote Ast „Registrierung hat keinen Weg zurück zu Login" ist geschlossen:
      `RegistrierungScreen` bekommt `onLogin` (Link „Schon ein Konto? Einloggen"), in `App.tsx`
      verdrahtet (`navigation.replace('Login')`). Gast→Onboarding→App und Device-Route waren
      bereits verlinkt/einreichbar (ADR-0023).
- [x] Honest states (loading/empty/error/offline) vereinheitlicht über eine gemeinsame
      Komponente/ein gemeinsames Muster statt pro-Screen-Kopien
      — Neu `shared/ScreenState.tsx` (`LoadingState`/`ErrorState`/`SuccessState`); Cockpit, Profil,
      Onboarding, Interview, Device, Geraetefreigabe rendern ihre Lade-/Fehlerzustände darüber
      statt über sechs private `XxxLoading`/`XxxLoadError`-Kopien. Ton (ehrlich, konkret) bleibt
      per-Screen in i18n (ADR-0006).
- [x] Screens auf verantwortbare Größe geschnitten (Ziel: kein Screen > ~350 Zeilen;
      `LoginScreen` 727 / `DatenschutzScreen` 520 / `better-auth.ts` 539 werden zerlegt)
      — Zerlegt: `LoginScreen` 771→227, `DatenschutzScreen` 548→226, `InterviewScreen` 565→174,
      `OnboardingScreen` 458→201, `ProfilScreen` 403→123, `RegistrierungScreen` 328→188,
      `CockpitScreen` 279→229, `DeviceScreen` 110→56, `GeraetefreigabeScreen` 244→192.
      **`better-auth.ts` (539, in `apps/api/`) ist nicht Teil dieses Frontend-Tickets** — gehört zum
      API-Track (t02), der `apps/api/` exklusiv bearbeitet; hier bewusst nicht angefasst.
- [x] Bestehende Screen-Tests grün nach der Zerlegung; neue Navigationstests decken die
      Übergänge ab
      — 380 Tests grün (29 Dateien). Neu in `App.test.tsx`: „Registrierung → Login → Registrierung"
      (der geschlossene Auth-Zweig); Gast→Onboarding→App und Device-Route waren bereits abgedeckt.

_Phasen-Ticket: wird beim Start per `to-spec`/`to-tickets` fein geschnitten (D11)._
