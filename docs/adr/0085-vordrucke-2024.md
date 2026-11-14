# ADR-0085 — Ausdruck für 2024, zu lange Angaben vor dem Bezahlen

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/printout/`, `scripts/vordrucke/`, `docs/process/vordrucke-jahreswechsel.md`, `apps/mobile-web/src/screens/printout/PrintoutScreen.tsx`
- **Baut auf:** ADR-0050 (Papierweg, Vermessung der Vordrucke)

## Kontext

Die Vordrucke 2024 lagen im Repo, waren aber nicht vermessen; für 2024 gab es keinen Ausdruck. Die Vordrucke
2024 sind anders nummeriert als 2025: In der Anlage N steht der Arbeitsweg drei Zeilen tiefer, in der Anlage
N-Gre und der Anlage Kind eine Zeile höher. Das Vermessen mit der Spec von 2025 traf manche Felder trotzdem,
aber in der falschen Zeile, weil dieselbe Nummer dort etwas anderes bedeutet. Im Echtfall 2024 scheiterte der
Ausdruck außerdem an einem Anbietertext, der bei 10 pt nicht in seine Zeile passte. Das zeigte sich erst beim
Erstellen, also nach dem Bezahlen.

## Entscheidung

1. **Vordrucke 2024 vermessen** (293 Felder) und mit dem Lagebericht Feld für Feld gegen 2025 gelesen.
2. **Zeilenabgleich als Werkzeug:** `zeilen-abgleich.mjs` ordnet jedem Feld die Zeile des neuen Jahres mit
   demselben gedruckten Text zu. Gleich lautende Zeilen (1. und 2. Angabe) und Zeilen ohne eigenen Text
   bekommen den Versatz ihrer Nachbarn und werden zum Prüfen gemeldet. `vermessen.mjs --alle` listet alle
   Felder, die sich nicht vermessen lassen, statt beim ersten abzubrechen.
3. **Felder, die ein Jahr nicht hat** (2024: Beruf in der Anlage N-Gre), stehen in `NOT_ON_FORM`. Ihr Wert
   wird für dieses Jahr weggelassen. Jede andere unbekannte Feld-ID bleibt ein Fehler.
4. **Zu lange Angaben vor dem Bezahlen:** Die Prüfung vor dem Bezahlen rendert den Ausdruck probehalber und
   meldet zu lange Werte als `zuLang.<feld>`. Die App nennt sie, damit der Nutzer kürzt. Die Schrift wird nicht
   verkleinert, weil die Vordruckregeln mindestens 10 pt verlangen (ADR-0050). Die Eule schlägt für den Anbieter
   der Kinderbetreuung höchstens 45 Zeichen vor.

## Folgen

- Echtfall 2024: Der Ausdruck entsteht. Anlage N-Gre beider Partner, Arbeitswege mit Zeitraum, Kindergeld und
  Kinderbetreuung stimmen mit dem Steuerberater überein, soweit die gespeicherten Testdaten vollständig sind.
- Der CI-Job „Vordrucke“ prüft 2024 mit, weil er alle Specs durchläuft.
- Nebenbei nachgeholt: Der Lagebericht 2025 enthielt die mit ADR-0079 neu vermessenen Felder noch nicht.
