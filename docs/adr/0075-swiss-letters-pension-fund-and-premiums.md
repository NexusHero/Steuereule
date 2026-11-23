# ADR-0075 — Schweizer Briefe: Nachweis der Pensionskasse und Prämienbestätigung des Arbeitgebers

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/domains/{ch-insurance-letters,document-kind}.ts`, `apps/api/src/ch-certificate-scan/ch-letter.parse-strategy.ts`, `apps/api/src/receipt/{receipt-parse.service,dto/parse-receipt.dto}.ts`, `apps/mobile-web/src/lib/receipts/captureReceipt.ts`, `apps/mobile-web/src/screens/advisor/CopilotBridgeProvider.tsx`
- **Baut auf:** ADR-0072 (N-Gre: Aufteilung der Pensionskasse, Prämienanteile), ADR-0073 (Person B), ADR-0074 (Lohnausweis)

## Kontext

Für die Anlage N-Gre reicht der Lohnausweis nicht. Die Aufteilung der Pensionskasse in obligatorisch
und überobligatorisch (Zeilen 20, 84, 87) steht im Nachweis der Pensionskasse; was der Arbeitgeber für
Krankentaggeld und Nichtberufsunfall gezahlt hat (Zeilen 18, 19, 95–98), in seiner Bestätigung. Die
allgemeine Beleg-Erkennung legte daraus höchstens ein Feld an, und die Arbeitgeberprämie landete
dabei im Feld für die Prämie des Arbeitnehmers.

## Entscheidung

1. **Zwei eigene Dokumentarten** `chPensionskasse` und `chPraemien`, erkannt in
   `classifyDocumentKind` an ihrem Inhalt (obligatorisch + Absender Pensionskasse/BVG; Krankentaggeld +
   Nichtberufs-/Nichtbetriebsunfall + Prämie/Beitrag).
2. **Feste Regel, kein Modell.** Die Briefe sind kein Einheitsformular; die Regel liest die zwei
   vorkommenden Layouts der Pensionskassen (Zeilen mit Spalten Arbeitnehmer/Arbeitgeber und
   „davon BVG“-Zeilen; Tabelle obligatorisch/überobligatorisch/TOTAL je Seite) und die Beträge der
   Prämienbriefe. Was sie nicht liest, bleibt offen und wird erfragt, statt geraten. Fehlt in einem Scan
   eine Beitragsart, wird keine Summe aus dem Rest gebildet.
3. **Prüfungen.** Obligatorisch + überobligatorisch = gesamt je Seite. Die Arbeitnehmerbeiträge gesamt
   müssen Ziffer 10 des schon erfassten Lohnausweises sein; weichen sie ab, sind die Entwürfe „prüfen“,
   und die Eule fragt, ob der Nachweis zum richtigen Jahr gehört. Ein Brief eines anderen Jahres wird
   nicht vorbereitet.
4. **Felder.** Pensionskasse → `pkArbeitnehmerChf`, `pkArbeitgeberChf` (je obligatorisch),
   `pkArbeitgeberGesamtChf` (daraus Zeile 20). Prämienbrief → `krankentaggeldArbeitgeberChf`,
   `nbuvArbeitgeberChf`; 100 % nur, wenn der Brief sagt, dass der Arbeitgeber die volle Prämie zahlt.
   Sonst fragt die Eule nach dem Anteil.
5. **Person wie beim Lohnausweis** (ADR-0074): der Name im Brief entscheidet; passt er zu keiner oder
   beiden Personen, fragt die App. Name, AHV- und Versicherungsnummer verlassen den Server nie und
   stehen in keinem Entwurf.

## Folgen

- Echtfall 2025: Der Nachweis der Ehefrau ergibt die Zeilen 84 und 20 wie die Erklärung des
  Steuerberaters. Beim Ehemann fehlte im Scan die Zeile „Sparbeitrag“; die Arbeitgeberbeiträge gesamt
  bleiben offen und werden erfragt.
- Eine Datei im Ordner 2025 war der Nachweis für 2024; die Jahresprüfung hält ihn zurück.
