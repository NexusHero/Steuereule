# 08 — Phase 1a: Angestellte-Vertikale (komplett durchgerechnet)

**What to build:** Ein echter Angestellten-Fall läuft von Anfang bis Ende durch die App:
LStB-Daten rein → Interview in den 5 Lebenslagen (ADR-031) → Sonderausgaben-Katalog →
Arbeitstage-Assistent (M4, Kalenderlogik statt Freitext) → Berechnung über den geteilten
Kern → Cockpit zeigt echte Werte statt Schätz-Platzhalter → ehrliche Gates (M8) →
Plausibilitäts-Prüfung vor Abgabe (M2). Demoable auf der echten URL (Phase-DoD).

**Blocked by:** 05 — Phase 0.5: Mantel-Abschluss · 06 — Infra-Track: #292

**Status:** ready-for-agent

- [x] LStB-Datenaufnahme (Scan/Import + geführte Fallback-Maske, ADR-036) mit
      ehrlichem Fehler-/Unklar-Zustand
- [x] Interview-Flow für die 5 Lebenslagen auf der Interview-Engine (0.4), on-demand-Katalog
      für Sonderausgaben (ADR-031)
- [ ] Arbeitstage-/Wegstrecken-Assistent mit Kalenderlogik (M4); Günstigerprüfungs-Vorbereitung
      aus ADR-M1 erst in Phase 2 — hier nur die Datengrundlage *(core `werktage.ts` fertig, ehrlich
      „vor Feiertagen" benannt: gesetzliche Feiertage = Folge-Slice (Feiertagskalender),
      API/UI-Anbindung Folge-Slice)*
- [ ] Berechnung über den deterministischen Kern (0.4); Cockpit-Werte stammen aus demselben
      Kern (eine Wahrheit, kein zweiter Rechenweg) *(core `angestellte.ts`-Faltung fertig,
      Cockpit-Echtdaten-Anbindung Folge-Slice)*
- [ ] Plausibilitäts-Prüfung vor Abgabe (M2): Widersprüche/Hinweise/einreichbar — auf
      echter Umgebung demoable *(core `plausibilitaet.ts` fertig, Screen/API-Anbindung
      Folge-Slice)*
- [x] Register: neue Produkt-REQs für die Vertikale angelegt und nach REQ-DoD abgenommen
      (REQ-016 LStB-Maske, REQ-017 Katalog-Einträge)

**Stand (Kaan, 2026-10-24, Ticket-08-Slice 1):** der ehrlich geschnittene Vertikal-Slice deckt die
LStB-Datenaufnahme und die Katalog-Einträge (5 Lebenslagen + Sonderausgaben) end-to-end — core pur
(TDD), API-Acceptance auf Register-Tier (REQ-016/017), mobile-web MSW-Handler generiert. Bewusst
NICHT gebaut (Folge-Slices): Scan/OCR (ADR-045), Arbeitstage/Pendler- und Cockpit-Echtdaten- sowie
Plausibilitäts-Anbindung an die API/UI (Kern-Logik dafür liegt bereits deterministisch in
`packages/core`). ADR-Entwurf: `0041-lstb-angestellte-vertikale.md`.

_Phasen-Ticket: wird beim Start per `to-spec`/`to-tickets` fein geschnitten (D11)._
