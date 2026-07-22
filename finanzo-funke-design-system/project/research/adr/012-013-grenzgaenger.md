# ADR-012 — Wechselkurs: amtlich als Standard, tatsächlich als belegpflichtige Option

**Status:** Akzeptiert (Grilling R2) · 2026-07-22

**Kontext:** Monatliche Umsatzsteuer-Umrechnungskurse (BMF) sind der akzeptierte Standard; tatsächliche Kurse vom Kontoauszug sind zulässig und oft günstiger, brauchen aber Nachweis.

**Entscheidung:** Die App füllt Kurse automatisch mit dem amtlichen Monatskurs (Herkunft: „Regel: BMF-Monatskurs 0,9412"). Umschalten auf „tatsächlicher Kurs" ist pro Monat möglich und erzwingt einen Beleg (Kontoauszug) — ohne Beleg kein tatsächlicher Kurs. Mischbetrieb erlaubt, aber pro Monat konsistent.

**Konsequenzen:** Wechselkurs-Eingabe bekommt Zwei-Zustände-UI (Regel-Chip vs. Beleg-Chip). API-Quelle für BMF-Kurse ist Backend-Aufgabe; UI zeigt Kursstand + Monat immer an.

# ADR-013 — Grenzgänger 1.0: nur Schweiz

**Status:** Akzeptiert (Grilling R2) · 2026-07-22

**Kontext:** Jedes DBA ist ein eigenes Regelwerk (CH: 45-Tage-Regel + 4,5 % Quellensteuer; FR/AT: Grenzzonen; LU: Bagatellregel; NL: kein Grenzgängerstatus). Alles zugleich heißt: nichts richtig.

**Entscheidung:** 1.0 unterstützt ausschließlich **DE↔CH** — größte Gruppe (~64.000 Pendler), klarste Regeln. Andere Länder werden im Gate ehrlich abgewiesen: „Grenzgänger nach Österreich unterstützen wir noch nicht" + Warteliste-Eintrag, kein halbgares Formular.

**Konsequenzen:** CH-Logik darf dafür tief sein: 45-Tage-Zähler (Nichtrückkehrtage), Quellensteuer-Anrechnung, CHF-Kurse. Länder-Auswahl im Gate zeigt CH aktiv, Rest ausgegraut mit Hinweis. Readme/2.0-Roadmap: AT, FR, LU als Ausbaustufen.
