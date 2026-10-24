# 15 — 08-Slice 2: Cockpit-Echtdaten + mobile-web-Screens (LStB, Katalog, Arbeitstage, M2)

**What to build:** Die Angestellte-Vertikale wird sichtbar: Der Cockpit zeigt die Spanne aus
dem deterministischen Kern (kein Schätz-Platzhalter mehr), und die mobile-web bekommt die
Screens für LStB-Maske, Interview-Katalog (Lebenslagen/Sonderausgaben), Arbeitstage-Assistent
und Plausibilitäts-Prüfung — alles gegen die echte API, mit ehrlichen Zuständen.

**Blocked by:** 08 gemerged (Slice 1: core + API + Acceptance sind auf main).

**Status:** ready-for-agent

- [ ] Cockpit: `GET /v1/steuerjahre/{jahr}/cockpit` liefert die Spanne aus dem Kern
      (`berechne`), offen wo der Kern offen ist — kein Schätz-Platzhalter mehr; Cockpit-UI
      rendert die echten Werte mit ehrlichen Lade-/Leer-/Fehlerzuständen
- [ ] LStB-Masken-Screen: 3 Felder mit `erfasst`/`offen`/`unklar`, Widerspruch benannt
      (ADR-008); persistiert via `PUT /v1/steuerjahre/{jahr}/lstb`
- [ ] Interview-Katalog-Screens: Lebenslagen + Sonderausgaben über die Engine
      (`GET .../interview?eintrag=...`), Server-Admission sichtbar (409-Resync wie Minimal-Gate)
- [ ] Arbeitstage-Assistent-Screen (M4): Kalenderlogik aus dem Kern, keine Freitext-Eingabe
- [ ] Plausibilitäts-Screen (M2): Widersprüche/Hinweise/einreichbar — ehrlich, kein Fake-Ampel
- [ ] Tests: mobile-web MSW-Screens + App-Flow; typecheck + lint grün; Posture-Zeile
