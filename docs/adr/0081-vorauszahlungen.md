# ADR-0081 — Vorauszahlungen in der Schätzung

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/interview/interview.ts`, `apps/api/src/tax-estimate/`, `apps/mobile-web/src/screens/cockpit/tiles.ts`
- **Baut auf:** ADR-0079 (Wechseljahr), ADR-0080

## Kontext

Grenzgänger zahlen in Deutschland keine Lohnsteuer; das Finanzamt setzt Vorauszahlungen fest (§ 37 EStG). Im
Echtfall 2025 zeigte die Schätzung darum eine Nachzahlung in Höhe fast der ganzen Jahressteuer, obwohl ein
großer Teil schon vorausgezahlt war. Die App hatte für Vorauszahlungen kein Feld.

## Entscheidung

1. **Eigene Frage im Interview**, Eintrag `vorauszahlungen`: „Vorauszahlungen ans Finanzamt geleistet?“, dann
   die Summe im Jahr (Einkommensteuer, Soli und Kirchensteuer zusammen). „Betrag später“ ist erlaubt.
2. **Schätzung:** Die Summe wird wie einbehaltene Steuer angerechnet (§ 36 Abs. 2 Nr. 1 EStG). Sie verschiebt das
   Ergebnis, steht als eigener Wert `prepayments` daneben und nicht in `anrechnung`. So bleibt der Abgleich mit
   dem Bescheid (Steuerabzugsbeträge) unberührt. Bei Zusammenveranlagung gibt es einen Bescheid, also wird
   einmal gefragt, bei Person A.
3. **Kachel „Vorauszahlungen ans Finanzamt“** im Cockpit, vorn für Grenzgänger und Vermieter, sonst unter
   „Weitere Themen“.
4. **Kein Ausdruck:** Die Erklärung fragt keine Vorauszahlungen ab; das Finanzamt kennt sie.

## Folgen

- Die Nachzahlung der Schätzung ist erst dann aussagekräftig, wenn die Vorauszahlungen eingetragen sind. Die
  Eule nennt sie bei Grenzgängern unter den offenen Punkten.
- Ein Leser für den Vorauszahlungsbescheid folgt bei Bedarf.
