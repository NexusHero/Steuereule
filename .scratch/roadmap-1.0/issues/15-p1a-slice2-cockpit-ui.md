# 15 — 08-Slice 2: Cockpit-Echtdaten + mobile-web-Screens (LStB, Katalog, Arbeitstage, M2)

**What to build:** Die Angestellte-Vertikale wird sichtbar: Der Cockpit zeigt die Spanne aus
dem deterministischen Kern (kein Schätz-Platzhalter mehr), und die mobile-web bekommt die
Screens für LStB-Maske, Interview-Katalog (Lebenslagen/Sonderausgaben), Arbeitstage-Assistent
und Plausibilitäts-Prüfung — alles gegen die echte API, mit ehrlichen Zuständen.

**Blocked by:** 08 gemerged (Slice 1: core + API + Acceptance sind auf main).

**Status:** done

- [x] Cockpit: `GET /v1/steuerjahre/{jahr}/cockpit` liefert die Spanne aus dem Kern
      (`berechne`), offen wo der Kern offen ist — kein Schätz-Platzhalter mehr; Cockpit-UI
      rendert die echten Werte mit ehrlichen Lade-/Leer-/Fehlerzuständen
- [x] LStB-Masken-Screen: 3 Felder mit `erfasst`/`offen`/`unklar`, Widerspruch benannt
      (ADR-008); persistiert via `PUT /v1/steuerjahre/{jahr}/lstb`
- [x] Interview-Katalog-Screens: Lebenslagen + Sonderausgaben über die Engine
      (`GET .../interview?eintrag=...`), Server-Admission sichtbar (409-Resync wie Minimal-Gate)
- [x] Arbeitstage-Assistent-Screen (M4): Kalenderlogik aus dem Kern, keine Freitext-Eingabe
- [x] Plausibilitäts-Screen (M2): Widersprüche/Hinweise/einreichbar — ehrlich, kein Fake-Ampel
- [x] Tests: mobile-web MSW-Screens + App-Flow; typecheck + lint grün; Posture-Zeile

**Stand (Kaan, 2026-10-24, Ticket 15):**

- **Cockpit-Echtdaten:** neue Datei `packages/core/src/cockpit-spanne.ts` (importiert aus
  `berechnung.ts`, kein Edit an berechnung.ts — t16-Konfliktvermeidung). Die Cockpit-API liest
  jetzt die echten LStB- + Interview-Daten, faltet die settled income Posten (Bruttoarbeitslohn
  + Nebenjob) und liefert einen ehrlichen `stand` (`bestimmt`/`spanne`/`gated`) statt des
  `baseEstimate`-Platzhalters. Die Erstattung/Tarif-Formel bleibt offen (ADR-032/048) und wird
  als "späterer Schritt" benannt, nie gefälscht.
- **Register-REQs 016/017 unverändert** (auf Slice 1 gemappt): keine neuen REQ-Klauseln
  angelegt, keine neuen REQs ohne Rücksprache — die neuen UI-Klauseln sind reine
  Screen-Anbindungen bestehender, schon abgenommener REQs (016 LStB, 017 Katalog).
- **Ehrliche Grenzen (nicht gebaut, bewusst):** Arbeitstage/Pendlerpauschale haben KEINE
  Persistenz (kein werktage-Endpoint/-Modell) — der M4-Screen rechnet aus dem Kern und zeigt das
  Ergebnis ehrlich ("Werktage, keine Feiertage", ADR-0032), ohne Speichern-Button. Der
  Plausibilitäts-Screen kann deshalb den werktage-Widerspruch noch nicht prüfen (dokumentiert im
  Screen-Header). Scan/OCR (ADR-045) bleibt draußen.
- **Posture-Zeile (Steuerdaten-Flows):** LStB persistiert serverseitig feldverschlüsselt
  (ADR-0008, `/// @encrypted` im Prisma-Schema); die mobile-web-Screens speichern NICHTS
  client-seitig — LStB/Katalog schicken nur via `PUT`/`POST` an die echte API, der Server ist
  die einzige Persistenz. Kein `localStorage`/`AsyncStorage`-Write in den neuen Screens.
