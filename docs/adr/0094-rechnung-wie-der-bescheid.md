# ADR-0094 — Die Schätzung rechnet wie der Bescheid

- **Status:** Accepted
- **Date:** 2026-11-17
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:**
  - `packages/core/src/domains/provision.ts`, `packages/core/src/domains/n-gre.ts` (`assessed`)
  - `packages/core/src/engine/married-estimate.ts`, `packages/core/src/engine/notice-parity.test.ts`
  - `packages/core/src/math/tarif.ts` (`solidaritaetszuschlagInCents`, `capitalFlatTax`, `soliOnFlatTax`)
  - `packages/core/src/common/workdays.ts` (`commuterAllowance`)
  - `apps/api/src/tax-estimate/tax-estimate.service.ts`
- **Baut auf:** ADR-0054 (Ehegatten-Schätzung), ADR-0079 (Wechseljahr), ADR-0090 (LStB Zeile 24, NBUV), ADR-0093 (Zeilen der Lohnsteuerbescheinigung)
- **Ändert:** Produkt-ADR-015 („nie ein Punktwert“) für den Fall, dass alle Zeilen vorliegen

## Kontext

Ein Lauf mit echten Unterlagen über 2024 und 2025 endete rund 3.230 € und 190 € neben den Bescheiden. Die Zerlegung zeigte Fehler in beide Richtungen, die sich teils aufhoben. Ein Teil lag an den Eingaben (ADR-0093), ein Teil an der Rechnung:

- Die Vorsorge war eine Spanne von 91 bis 93 % der Sozialversicherung statt der Höchstbetragsrechnung.
- Kapitalerträge ohne Steuerabzug fehlten in der Ehegatten-Schätzung.
- Der Solidaritätszuschlag wurde auf die Steuer vor den Ermäßigungen und in ganzen Euro gerechnet.
- Schweizer Beträge wurden Zeile für Zeile gerundet, das Finanzamt rechnet die Summe um.

Beide Bescheide wurden vollständig abgeschrieben und nachgerechnet. Jede Summe geht auf.

## Entscheidung

1. **Zwei Bescheide sind Prüffälle im Rechenkern** (`notice-parity.test.ts`). Sie enthalten nur Beträge, keine Namen, Arbeitgeber oder Nummern. Erwartet wird der Bescheid auf den Euro, der Solidaritätszuschlag auf den Cent.
2. **Vorsorge Zeile für Zeile** (`deductibleProvision`, § 10 Abs. 3 und 4 EStG):
   - Altersvorsorge: Arbeitnehmer- und Arbeitgeberanteil zusammen, höchstens der Höchstbetrag (für Ehegatten doppelt), mal Anteil des Jahres, abzüglich Arbeitgeberanteil.
   - Basis-Kranken- und Pflegeversicherung voll. Beiträge mit Krankengeldanspruch werden um 4 % gekürzt; die Kürzung bemisst sich am Beitrag nach Abzug seines eigenen Zuschusses. Steuerfreie Arbeitgeberzuschüsse gehen ab.
   - Sonstige Vorsorge nur, soweit die Basisabsicherung den Höchstbetrag nicht ausschöpft. Der Höchstbetrag ist 1.900 € je Person mit Anspruch auf Zuschüsse zur Krankenversicherung und 2.800 € ohne; für Ehegatten addieren sich die Beträge.
   - Liegen die Zeilen für beide Ehegatten vor, ist die Vorsorge ein Betrag. Fehlen sie, bleibt die bisherige Spanne.
3. **Rundung wie das Finanzamt:** Einnahmen ab, Werbungskosten und Anrechnungsbeträge auf. Die Entfernungspauschale wird auf volle Euro aufgerundet. Schweizer Lohn ist die Summe in CHF mal Kurs, abgerundet; die Abzugsteuer je Person aufgerundet.
4. **Kapitalerträge ohne Steuerabzug** tragen 25 % (§ 32d Abs. 1 EStG), abgerundet auf volle Euro, nach Abzug des noch nicht verbrauchten Sparer-Pauschbetrags. Erträge mit Steuerabzug sind abgegolten und bleiben außen vor.
5. **Solidaritätszuschlag** auf die tarifliche Steuer nach Kinderfreibeträgen und nach Steuerermäßigungen, centgenau, Bruchteile eines Cents entfallen. Auf die Steuer nach § 32d kommen 5,5 % ohne Freigrenze.
6. **Kinderfreibetrag** je Monat ein Zwölftel (§ 32 Abs. 6 Satz 5 EStG).
7. **Ein Punktwert ist erlaubt, wenn nichts mehr geschätzt wird.** Die Spanne bleibt die Form der Antwort; ihre Enden fallen zusammen, sobald alle Zeilen vorliegen.

## Bewusste Unterschiede zum Bescheid

- **Hälfte der NBUV-Prämie als Werbungskosten** (ADR-0090): In den Erklärungen des Echtfalls fehlte sie. Die App setzt sie an; das sind dort 286 € und 324 € mehr Werbungskosten als im Bescheid 2025.
- **Höchstbetrag für sonstige Vorsorge:** Ein Grenzgänger ohne Zuschuss zur Krankenversicherung hat 2.800 €. Im Bescheid 2025 stehen für eine Person 1.900 €, weil die Zeile in der Erklärung leer war. Die App rechnet nach der Angabe `kvZuschussAnspruch`.
- **Entfernung:** Die App prüft keine Route. Kürzt das Finanzamt die Entfernung, weicht der Bescheid ab.

## Offen

- Zusatzversicherung eines Kindes (Anlage Kind Zeile 30) hat noch kein Feld; sie wirkt nur, wenn die Basisabsicherung den Höchstbetrag nicht ausschöpft.
- Die Einzelveranlagung rechnet die Vorsorge weiter als Spanne.
- Spendenhöchstbetrag (20 % des Gesamtbetrags der Einkünfte) wird nicht geprüft.
