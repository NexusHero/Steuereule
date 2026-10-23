# 03 — Phase 0.3: Verdrahtung (ein Produkt statt Slices)

**What to build:** Die App fühlt sich als *ein* Produkt an: eine Navigation, ein gemeinsamer
Session-/Datenfluss, vereinheitlichte honest states (loading/empty/error). Kein Screen betreibt
mehr ein eigenes Daten-Silo; Profil, Cockpit, Geräte, Datenschutz, Onboarding sprechen dieselbe
Session-Quelle und dieselben UI-Zustände.

**Blocked by:** 02 — Phase 0.2: Framework-Ersatz

**Status:** ready-for-agent

- [ ] Ein Session-/Auth-Kontext (web + device) wird von allen Screens konsumiert; kein
      Pro-Screen-Eigenlogin oder Parallel-Query-State
- [ ] Navigation als ein zusammenhängender Flow (Gast → Onboarding → App → Profil/…):
      jeder Screen von jedem erreichbaren Zustand aus erreichbar ohne tote Äste
- [ ] Honest states (loading/empty/error/offline) vereinheitlicht über eine gemeinsame
      Komponente/ein gemeinsames Muster statt pro-Screen-Kopien
- [ ] Screens auf verantwortbare Größe geschnitten (Ziel: kein Screen > ~350 Zeilen;
      `LoginScreen` 727 / `DatenschutzScreen` 520 / `better-auth.ts` 539 werden zerlegt)
- [ ] Bestehende Screen-Tests grün nach der Zerlegung; neue Navigationstests decken die
      Übergänge ab

_Phasen-Ticket: wird beim Start per `to-spec`/`to-tickets` fein geschnitten (D11)._
