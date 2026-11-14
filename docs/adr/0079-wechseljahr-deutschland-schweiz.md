# ADR-0079 — Wechseljahr: deutscher und Schweizer Lohn in einem Jahr, zwei Arbeitswege

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/engine/{tax-estimate,married-estimate}.ts`, `packages/core/src/common/workdays.ts`, `packages/core/src/interview/field-catalog.ts`, `apps/api/src/tax-estimate/`, `apps/api/src/commute/`, `apps/api/src/confirmation/field-access.ts`, `apps/api/src/printout/`, `apps/mobile-web/src/screens/workdays/WorkdaysScreen.tsx`
- **Baut auf:** ADR-0074 (Schweizer Lohnausweis lesen), ADR-0076 (weitere Werbungskosten)

## Kontext

Wer im Jahr von einem deutschen zu einem Schweizer Arbeitgeber wechselt, hat beides: eine
Lohnsteuerbescheinigung (Anlage N) und einen Lohnausweis (Anlage N-Gre). Im Echtfall 2024 rechnete die
Schätzung nur den Schweizer Teil, und der Arbeitsweg galt für das ganze Jahr, obwohl der Weg in die Schweiz
nur zwei Monate bestand.

## Entscheidung

1. **Schätzung mit beiden Löhnen.** Liegen eine vollständige Lohnsteuerbescheinigung und ein Lohnausweis vor,
   zählen beide Löhne. Es gibt einen Arbeitnehmer-Pauschbetrag, die deutsche Sozialversicherung kommt zur
   Vorsorge, und angerechnet werden Lohnsteuer, Solidaritätszuschlag und Schweizer Quellensteuer. Das gilt
   für Ledige und für Ehegatten (Art `mixed`).
2. **Zwei Arbeitswege mit Zeitraum.** Der erste Weg bekommt einen Zeitraum (`periodFrom`/`periodTo`). Ein
   zweiter Weg nach dem Wechsel hat eigene Kilometer, ein eigenes Verkehrsmittel, einen eigenen Arbeitsort
   (verschlüsselt) und einen eigenen Zeitraum. Die Pendeltage des Jahres teilen sich nach den Wochentagen,
   die jeder Weg bestand. Urlaub, Krankheit und Homeoffice kennt die App nur fürs ganze Jahr; sie verteilen
   sich darum gleichmäßig.
3. **Ausdruck.** Ein Wechsel von Deutschland in die Schweiz setzt den ersten Weg in die Anlage N und den
   zweiten in die Anlage N-Gre, jeweils mit „vom/bis“. Zwei Wege beim selben Formular stehen dort als 1. und
   2. Angabe (Kz 110–112 und 130–132). Die weiteren Werbungskosten stehen beim ersten Weg, also nur einmal.
4. **Maske.** Der Schalter „Arbeitsstelle im Jahr gewechselt?“ öffnet das Enddatum des bisherigen Wegs und
   den neuen Weg. Ein halb getipptes Datum wird nicht gespeichert.
5. **Eule.** Sie darf Zeitraum, Kilometer und Verkehrsmittel des zweiten Wegs vorschlagen. Den Arbeitsort
   nicht, wie beim ersten Weg.

## Folgen

- Echtfall 2024: Die Schätzung rechnet jetzt den deutschen und den Schweizer Lohn zusammen. Der neue
  Arbeitsweg zählt nur für November und Dezember, mit derselben Zahl an Tagen wie beim Steuerberater.
- Nebenbei behoben: Die Schnittstelle der Arbeitsweg-Maske gab die weiteren Werbungskosten aus ADR-0076 nicht
  an den Speicher weiter. Jetzt gibt sie alle Felder weiter, die der Client sendet. Fehlende Felder lassen den
  gespeicherten Wert stehen.
- Die Aufteilung nach Wochentagen ist eine Näherung. Wer die Tage je Weg genau kennt, kann den
  Zeitraum anpassen. Ein eigenes Tagesfeld je Weg gibt es nicht.
