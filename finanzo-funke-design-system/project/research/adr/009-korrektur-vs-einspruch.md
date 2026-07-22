# ADR-009 — Korrektur vor Bescheid, Einspruch nach Bescheid — zwei getrennte Flows

**Status:** Akzeptiert (Grilling R1, delegiert) · 2026-07-22

**Kontext:** Nach Einreichung gefundener Beleg. Vor dem Bescheid kann eine berichtigte Erklärung nachgereicht werden; nach dem Bescheid gilt die Einspruchsfrist (1 Monat) mit anderem Verfahren und anderem Ton.

**Entscheidung:**
- **Vor Bescheid:** „Korrigieren" erzeugt Fassung n+1 als **Kopie der eingereichten Fassung** (nicht des Arbeitsstands); jede Abweichung zur Vorfassung wird als Diff markiert. Fassung n bleibt unveränderlich sichtbar.
- **Nach Bescheid:** eigener **Einspruch-Flow** mit Fristen-Countdown ab Bescheiddatum, Grund-Auswahl und Diff nur der strittigen Posten. Kein „Korrigieren"-Button mehr — das Wort wäre eine falsche Zusage.

**Konsequenzen:** Zustandsmaschine des Steuerjahrs braucht den Verzweigungspunkt „Bescheid eingegangen". UI: Countdown-Banner (Einspruchsfrist) auf dem Bescheid-Screen. Diff-Ansicht wird wiederverwendet (Korrektur + Einspruch).
