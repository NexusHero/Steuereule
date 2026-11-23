# ADR-0087 — Eskalationsfall: zwei Grenzgänger mit Wechseljahr, drei Kinder, Krankheitskosten

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/ch-salary-certificate/`, `apps/api/src/tax-estimate/tax-estimate.service.ts`, `apps/api/src/lstb-scan/lstb-scan.parse-strategy.ts`, `apps/api/src/advisor/{advisor.service,advisor-drafts}.ts`, `apps/api/src/receipt/parse/auto-receipt-parse.strategy.ts`, `apps/api/src/ch-certificate-scan/ch-health-statement.parse-strategy.ts`, `packages/core/src/domains/{medical-invoice,childcare-notice}.ts`, `apps/mobile-web/src/screens/cross-border/CrossBorderScreen.tsx`, `apps/mobile-web/src/screens/cockpit/CockpitPartnerSection.tsx`, `e2e/scenarios/25-familie-sommer-eskalation.mjs`
- **Baut auf:** ADR-0054 (Person A erfasst für Person B), ADR-0074 (Lohnausweis lesen), ADR-0077 (Krankheitskosten), ADR-0079 (Wechseljahr), ADR-0080 (Krankenkassen-Auszüge), ADR-0086 (Betreuungszeitraum)

## Kontext

Ein absichtlich zugespitzter, erfundener Fall: Beide Ehegatten arbeiten bis Juni bei einem deutschen
Arbeitgeber (deutsche Sozialversicherung und Rente) und ab Juli als Grenzgänger in der Schweiz (AHV,
Pensionskasse mit Obligatorium, Quellensteuer). Drei Kinder sind in Kindergarten und Kita, es gibt eine
Zahnarztrechnung über 1.700 € und eine Schönheitsoperation. Jeder Beleg soll ein Feld finden, und der Ausdruck
soll vollständig sein. Der erste Durchlauf fand diese Lücken:

- Für Person B gab es weder Lohnausweis-Maske noch Schnittstelle. Bs Arbeitgeberadresse, Kurs und
  Grenzgänger-Status ließen sich nirgends eintragen, der Ausdruck blieb gesperrt.
- Die gemeinsame Schätzung zählte Bs Schweizer Lohn nicht, sobald B auch eine LStB hatte, weil B als Person ohne
  Konto keine Interview-Antwort „Schweiz“ hat.
- Die gelesene LStB von B wurde als Entwurf für A vorbereitet und verdrängte As eigene LStB-Entwürfe.
- Beträge mit Tausenderpunkt wurden falsch gelesen (1.700,00 € als 700 €).
- Arzt- und Zahnarztrechnungen fanden kein Feld. Eine Schönheits-OP wurde nicht erkannt.
- Die selbst getragenen Kosten im Schweizer Krankenkassen-Auszug erschienen nur als Hinweis.
- Ein Kita-Beleg mit bezahlter Jahressumme ergab nur den Zeitraum, nicht den Betrag.
- Eine Rechnung, die auf einen noch offenen Dokument-Entwurf aufsetzt, ersetzte ihn, statt ihn mitzuzählen.

## Entscheidung

1. **Bs Schweizer Angaben.** Alle Endpunkte von `ch-lohnausweis` nehmen `?person=B`, wie LStB und Arbeitsweg
   (ADR-0054). Bs eigene Grenzgänger-Fragen (Wohnsitz, Nichtrückkehrtage) speichert `PUT
   ch-lohnausweis/grenzgaenger?person=B` als Bs Antworten. Schätzung, Ausdruck und Maske leiten Bs Status daraus
   ab wie bei A aus dem Interview. Für A bleibt das Interview der Ort dieser Fragen (400 ohne `person=B`).
   Im Cockpit hat B in einer Schweiz-Erklärung das Feld „Lohnausweis Schweiz“. Bs Maske fragt zuerst Wohnsitz
   und Tage.
2. **Schätzung.** Eine Person mit Lohnausweis gilt als Grenzgänger, wenn sie „Schweiz“ geantwortet oder die
   Grenzgänger-Fragen beantwortet hat. Mit LStB dazu ist es ein Wechseljahr (ADR-0079), auch für B.
3. **Wessen LStB.** Eine LStB ohne angegebene Person (Upload im Chat) gehört in einer Zusammenveranlagung der
   Person, deren Name darauf steht. Passt keiner, fragt der Chat wie beim Lohnausweis. Entwürfe für B tragen
   `person: 'B'` und verdrängen As Entwürfe nicht.
4. **Krankheitskosten aus Rechnungen (§ 33 EStG).** Eine Arzt-, Zahnarzt- oder ähnliche Rechnung wird zum
   Entwurf für `gesundheit-betrag` mit „Ja“ als Begleitantwort. Der Betrag ist der Eigenanteil nach einer
   gedruckten Erstattung, sonst der Rechnungsbetrag. Mehrere Rechnungen summieren sich, dieselbe Rechnung zählt
   einmal. Eine Schönheitsoperation oder kosmetische Behandlung erfasst die App **nicht**: kein Entwurf, und der
   Chat sagt, warum (Entscheidung des Product Owners: „gar nicht erfassen“). § 33 EStG ist eine Rechtsquelle der
   Eule.
5. **Selbst getragene Kosten aus dem Schweizer Auszug** (Franchise, Selbstbehalt) gehen in Euro zum Kurs des
   Lohnausweises (sonst zum Jahresdurchschnitt, „prüfen“) zu den Krankheitskosten, je Auszug einmal.
6. **Kita-Betrag.** Nennt ein Beleg die für das Jahr gezahlte Summe („Gesamt 2025“, „im Jahr 2025 gezahlt“),
   wird sie als Entwurf „prüfen“ vorgeschlagen. Ein Monatsbeitrag bleibt weiterhin kein Betrag (ADR-0086).
7. **Aufsummieren und Konflikte.** Eine Rechnung zählt auch auf einen offenen Dokument-Entwurf auf und übernimmt
   dessen gezählte Positionen. Ein Feld, das beim Übernehmen schon genau den Wert des Entwurfs hat (zwei Belege
   öffnen beide „Krankheitskosten: Ja“), ist kein veralteter Stand.
8. **Beträge** mit Tausenderpunkt werden ganz gelesen; die Zeile mit dem Rechnungsbetrag geht vor.
9. **Zumutbare Belastung mit erfassten Kindern.** Die Interview-Antwort „2 oder mehr“ unterscheidet 2 nicht von 3+
   und zählt weiter als „1–2“. Sind für das Jahr Kinder erfasst, entscheidet ihre Zahl: ab drei gelten 1/1/2 %
   (§ 33 Abs. 3 EStG). Gefunden beim Abgleich mit dem BMF-Rechner; dessen Tarifwerte für den Fall stimmten.

## Folgen

- Szenario 25 („Familie Sommer“) in der E2E-Matrix spielt den Fall durch: Belege im Chat und über dieselbe
  Schnittstelle, Bs Schweiz-Maske im Browser, dann die übrigen Masken. Es prüft die Schätzung mit beiden
  Wechseljahren, einen Ausdruck ohne fehlende Angaben und jeden Betrag in seinem Feld. Krankheitskosten: 1.700 €
  plus die selbst getragenen Kosten, nie die 3.800 € der Operation.
- Schönheitsoperationen mit amtsärztlich bestätigter medizinischer Notwendigkeit trägt der Nutzer selbst ein;
  die App erkennt sie nicht als Ausnahme.
- Die Lohnsteuer druckt die Anlage N weiterhin nicht (sie kommt aus der elektronischen LStB), nur den Bruttolohn.
