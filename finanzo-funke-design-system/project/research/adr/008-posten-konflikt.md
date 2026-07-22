# ADR-008 — Posten-Konflikt ist ein sichtbarer Zustand, kein stilles Überschreiben

**Status:** Akzeptiert (Grilling R1) · 2026-07-22

**Kontext:** Beleg sagt 480 €, Nutzer tippt 500 €. Stilles Gewinnen einer Quelle zerstört entweder Vertrauen (Eingabe verworfen) oder Ehrlichkeit (Beleg ignoriert, Zahl ohne Deckung ans Finanzamt).

**Entscheidung:** Ein Posten mit widersprüchlichen Quellen geht in den Zustand **Konflikt**: beide Werte sichtbar (Herkunfts-Chips „Beleg 480 €" / „Eingabe 500 €"), Posten zählt nicht in die Erstattungsschätzung, Einreichung blockiert bis zur Auflösung. Auflösung = eine Quelle wählen oder Wert korrigieren; die verworfene Quelle bleibt im Verlauf.

**Konsequenzen:** Neuer Posten-Zustand in der UI (Amber-Rahmen, kein Rot — Konflikt ist normal, kein Fehler). Prüf-Screen listet Konflikte als eigene Kategorie. Erstattungs-Ticker zeigt „± offen" solange Konflikte existieren.
