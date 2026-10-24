# 16 — 09-Slice 2: Vorsorge-Faltung + CH-Screen

**What to build:** Die CH-Vertikale wird vollständig: Vorsorgeaufwand (PK, Quellensteuer,
3a, KK, Zulagen) wird in den Posten-Kern gefaltet (geteilte Formel-Arbeit, mit 08
koordiniert), REQ-021 geht auf Done, und die mobile-web bekommt den CH-Screen
(Lohnausweis-Maske + CH-Interview).

**Blocked by:** 09 gemerged (Slice 1: Belegarten, Wechselkurs, CHF-Kern, segment-ch auf main).

**Status:** in-progress (Robin, 09-Vertikale)

- [x] Posten-Kern: Vorsorge-Posten (PK/3a/KK/Zulagen) + Quellensteuer-Anrechnung in
      `berechne` gefaltet, mit Herkunft (Lohnausweis Ziffer n × Kurs); offen wo unklar —
      keine Schätzung, kein fabricated zero
- [x] REQ-021 → Done (Summary + Traceability + Acceptance auf Register-Tier)
- [x] CH-Screen mobile-web: Lohnausweis-Maske (CH-Aufbau, ADR-036), CH-Interview
      (`ch-wohnsitz`/`ch-nichtrueckkehrtage`) gegen die echte API, Grenzgänger-Status
      abgeleitet angezeigt, Plausibilität sichtbar
- [ ] Cockpit/CH: CH-Eintrag und CH-Posten erscheinen in der Cockpit-Spanne (Faltung mit
      08s Slice-2-Cockpit koordiniert — geteilte Kern-Arbeit, ADR-0015-Lehre) — **t15 (Kaan),
      liest `berechne`; mein Kern liefert die CH-Posten via `grenzgaengerStand`.**
- [x] Tests: core pur + api acceptance + mobile-web MSW; typecheck + lint grün;
      Posture-Zeile
