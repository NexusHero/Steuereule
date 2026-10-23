# 08 — Phase 1a: Angestellte-Vertikale (komplett durchgerechnet)

**What to build:** Ein echter Angestellten-Fall läuft von Anfang bis Ende durch die App:
LStB-Daten rein → Interview in den 5 Lebenslagen (ADR-031) → Sonderausgaben-Katalog →
Arbeitstage-Assistent (M4, Kalenderlogik statt Freitext) → Berechnung über den geteilten
Kern → Cockpit zeigt echte Werte statt Schätz-Platzhalter → ehrliche Gates (M8) →
Plausibilitäts-Prüfung vor Abgabe (M2). Demoable auf der echten URL (Phase-DoD).

**Blocked by:** 05 — Phase 0.5: Mantel-Abschluss · 06 — Infra-Track: #292

**Status:** ready-for-agent

- [ ] LStB-Datenaufnahme (Scan/Import + geführte Fallback-Maske, ADR-036) mit
      ehrlichem Fehler-/Unklar-Zustand
- [ ] Interview-Flow für die 5 Lebenslagen auf der Interview-Engine (0.4), on-demand-Katalog
      für Sonderausgaben (ADR-031)
- [ ] Arbeitstage-/Wegstrecken-Assistent mit Kalenderlogik (M4); Günstigerprüfungs-Vorbereitung
      aus ADR-M1 erst in Phase 2 — hier nur die Datengrundlage
- [ ] Berechnung über den deterministischen Kern (0.4); Cockpit-Werte stammen aus demselben
      Kern (eine Wahrheit, kein zweiter Rechenweg)
- [ ] Plausibilitäts-Prüfung vor Abgabe (M2): Widersprüche/Hinweise/einreichbar — auf
      echter Umgebung demoable
- [ ] Register: neue Produkt-REQs für die Vertikale angelegt und nach REQ-DoD abgenommen

_Phasen-Ticket: wird beim Start per `to-spec`/`to-tickets` fein geschnitten (D11)._
