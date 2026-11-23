# ADR-0074 — Belege lesen: Schweizer Lohnausweis und gescannte Lohnsteuerbescheinigung

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/domains/{ch-salary-certificate-parser,lstb-parser,document-kind}.ts`, `apps/api/src/ch-certificate-scan/`, `apps/api/src/advisor/advisor.service.ts` (`stageDocumentDrafts`, `householdNames`), `apps/api/src/receipt/{receipt-parse.service,dto/parse-receipt.dto}.ts`, `apps/api/src/lstb/lstb.service.ts`, `apps/api/src/lstb-scan/`, `apps/mobile-web/src/lib/receipts/captureReceipt.ts`, `apps/mobile-web/src/screens/advisor/{CopilotBridgeProvider,AdvisorChatPanel}.tsx`, `apps/mobile-web/src/screens/lstb/scan/`
- **Baut auf:** ADR-0058 (Allowlist vor dem Modell), ADR-0060 (OCR nie grün), ADR-0072 (N-Gre), ADR-0073 (Entwürfe für Person B)

## Kontext

Im Echtfall-Test (Ehepaar, beide Grenzgänger CH) las die App keinen der beiden Schweizer
Lohnausweise: Die allgemeine Beleg-Erkennung legt höchstens ein Feld an, und nur Krankenkasse,
Krankentaggeld oder Säule 3a. Ein Beleg landete immer beim Hochladenden. Gescannte deutsche
Lohnsteuerbescheinigungen (zweispaltig, OCR) las der feste Teil nur zum Teil: Text der linken Spalte
stand vor der Zeilennummer, Umlaute fehlten, „für“ kam als „fur“. Eine zweite Bescheinigung im
selben Jahr (zweiter Arbeitgeber, spätere Zahlung) konnte nur die erste ersetzen.

## Entscheidung

1. **Ein eigener Leser für den Lohnausweis (Formular 11).** Eine feste Regel im Kern liest Kopf
   (Jahr, Zeitraum, Felder F und G), die Ziffern 1–14 und 10.1/10.2. Sie prüft sich mit den Summen
   des Formulars: Ziffer 8 = 1 bis 7, Ziffer 11 = 8 − 9 − 10. Zahlen, die eine Summe brechen, sind
   „prüfen“. Reißt OCR eine Zahl auseinander („1 1 1 839“), gilt der Wert, den die Summe verlangt,
   nur wenn genau seine Ziffern auf der Zeile stehen.
2. **Das Modell sieht nur die Ziffern 1–12.** Kopf (Name, Adresse, AHV-Nummer, Geburtsdatum),
   Bemerkungen und Arbeitgeber verlassen den Server nie. Das Modell füllt nur leere Ziffern, nur mit
   Beträgen, die wörtlich im gezeigten Text stehen, und nie als „gelesen“.
3. **Wessen Ausweis es ist, sagt der Name darauf.** Vor- und Nachname einer Person (Umlaute auch als
   „ue“) müssen beide auf dem Ausweis stehen. Passt der Name zu keiner oder zu beiden Personen, fragt
   die App „Wessen Lohnausweis ist das?“ und liest erst mit der Antwort; der Beleg wird dafür nicht
   ein zweites Mal hochgeladen. Hat Person B ein eigenes Konto, wird nichts vorbereitet.
4. **Entwürfe statt Schreiben.** Die Ziffern werden Entwürfe der Eule für die Lohnausweis-Maske der
   richtigen Person (`stageDocumentDrafts`, Person B über ADR-0073). Erst „Übernehmen“ schreibt.
   Negative Ziffern (etwa eine Korrektur in Ziffer 7) werden nicht übernommen, weil die Maske keine kennt; Ziffer 8
   enthält sie schon. Die Arbeitgeberadresse bleibt dem Nutzer (Feld ist für die KI gesperrt), die
   Aufteilung der Pensionskasse steht nicht auf dem Ausweis.
5. **Erkennung an einer Stelle.** `classifyDocumentKind` erkennt den Ausweis an „Lohnausweis“,
   „Certificat de salaire“ und „Bruttolohn total“; App und Server leiten damit gleich weiter.
6. **Gescannte LStB.** Die Zeilennummer wird auch hinter Text der linken Spalte gefunden, wenn die
   Überschrift der Zeile folgt; Überschriften gelten ohne Umlaute; „für“ auch als „fur/fiir“; Tausender
   mit Komma („61,234,56“). An das Modell geht nur die Zeile ab ihrer Nummer, nie die linke Spalte.
7. **Eine weitere Bescheinigung im Jahr** wird auf Wunsch dazugerechnet (`addToExisting`). Dieselbe
   Bescheinigung zweimal lehnt der Server ab (`LSTB_SAME_CERTIFICATE`). Eine Summe zweier Belege
   ist kein einzelner Beleg mehr: Herkunft „nutzer“, bestätigt.

## Folgen

- Echtfall 2025: Beide Lohnausweise werden vollständig gelesen, beide Summen gehen auf, der
  gescannte Ausweis der Ehefrau landet bei Person B. 2024: eine gescannte Bescheinigung eines deutschen Arbeitgebers liefert
  Bruttolohn, Lohnsteuer, Renten-, Kranken- und Arbeitslosenversicherung; die Pflegeversicherung war
  im Scan unlesbar und bleibt dem Modell oder dem Nutzer.
- Werte aus OCR bleiben „prüfen“ (ADR-0060); erst der Nutzer bestätigt.
- Nicht enthalten: Rentenbescheinigung (Feld B), Pensionskassen-Bescheinigung, Personenerkennung
  für die deutsche LStB (dort wählt der Nutzer die Person wie bisher).
