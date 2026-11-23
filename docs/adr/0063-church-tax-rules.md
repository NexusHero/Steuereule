# ADR-0063 — Kirchensteuer in der Schätzung: Satz, Kappung, besonderes Kirchgeld, Abgeltungsteuer

- **Status:** Accepted
- **Date:** 2026-11-11
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/domains/church-tax*.ts`, `packages/core/src/engine/tax-estimate.ts`, `married-estimate.ts`, `most-favourable-check.ts`, `apps/api/src/tax-estimate/`, `apps/api/src/lstb/` (Zeilen 6 und 7), LStB-Maske, Cockpit
- **Ticket:** #450 Teil 6F (Scope-Erweiterung vom 10.11.2026)

## Kontext

Bis jetzt hat die Schätzung die Kirchensteuer nicht gerechnet:

- **Ledige:** Für Ledige gab es nur den Hinweis `churchTaxOpen`.
- **Ehepaare:** Für Ehepaare wurde eine Spanne von 8–9 % gerechnet, aber nur wenn kein Ehegatte deutsche Lohnsteuer hatte.
- **LStB:** Die einbehaltene Kirchensteuer laut LStB wurde nicht erfasst.
- **Sonderausgabe:** Gezahlte Kirchensteuer wurde nicht als Sonderausgabe abgezogen.
- **Kappung und Kirchgeld:** Die Kappung fehlte, ebenso das besondere Kirchgeld.
- **Abgeltungsteuer:** Bei der Abgeltungsteuer stand eine Näherung statt der Formel.

Damit fehlte Kirchenmitgliedern die Erstattung der zu viel einbehaltenen Kirchensteuer.

## Entscheidung

### 1. Anrechnung und Sonderausgabe

- **Neue Felder in der LStB:** Zeile 6 (Kirchensteuer des Arbeitnehmers) und Zeile 7 (Kirchensteuer des Ehegatten, nur bei konfessionsverschiedener Ehe) sind zwei optionale, verschlüsselte Felder (`Lstb.kirchensteuer`, `Lstb.kirchensteuerEhegatte`).
  - Sie stehen neben den drei Pflichtfeldern. Eine LStB ohne diese Zeilen bleibt vollständig.
- **Anrechnung:** Die einbehaltene Kirchensteuer wird wie die Lohnsteuer gegen die geschuldete gerechnet, für Ledige und für Paare.
  - Bei Paaren zählen die Zeilen 6 und 7 beider LStB.
  - Ein Grenzgänger CH hat keine deutsche Kirchensteuer einbehalten, also 0 €.
- **Sonderausgabe:** Die im Jahr einbehaltene Kirchensteuer ist Sonderausgabe nach § 10 Abs. 1 Nr. 4 EStG.
  - Sie wird mit den Spenden gegen den Sonderausgaben-Pauschbetrag gerechnet.
  - Erstattungen von Kirchensteuer aus Vorjahren werden nicht gegengerechnet (bewusste Vereinfachung).
- **Bemessung:** Die Kirchensteuer bemisst sich nach der Einkommensteuer nach Abzug der Kinderfreibeträge (§ 51a Abs. 2 EStG). Das gilt auch dann, wenn die Günstigerprüfung das Kindergeld ergibt.
  - Bei Ledigen mit Kindern ist das eine Spanne zwischen halbem und vollem Freibetrag (Übertragung).

### 2. Satz und Bundesland

- **Satz:** 8 % in Bayern und Baden-Württemberg, sonst 9 %.
  - Das Bundesland kommt aus der PLZ der Stammdaten (PLZ-Tabelle aus #451).
  - Unbekannte PLZ oder eine PLZ über zwei Länder ergibt die Spanne 8–9 %.
  - Ausnahme: Katholiken in Bad Wimpfen (PLZ 74206) gehören zur Diözese Mainz und zahlen 9 % (BStBl 2026 I S. 869).
- **Konfession:** Die Konfession kommt aus den Stammdaten.
  - `VD` bedeutet keine Kirchensteuer und kein Hinweis.
  - Ist die Konfession leer oder unbekannt, ist der Zustand **„offen“** (`konfession-fehlt`), nie ein stiller Ansatz von 0 €.
  - Bei Paaren gilt das auch, wenn für Person B keine Angabe vorliegt.
- **Fehlende Zeile 6:** Fehlt bei einem Mitglied mit LStB die Zeile 6, ist der Zustand ebenfalls „offen“ (`einbehalt-fehlt`).

### 3. Kappung

Die Kappungssätze stehen je Land und Kirche mit Quelle in `church-tax.data.ts`. Grundlage sind die amtlichen Bekanntmachungen der Kirchensteuerbeschlüsse bzw. die staatlich anerkannten Beschlüsse.

| Art | Länder | Wirkung |
| :--- | :--- | :--- |
| automatisch | BE, BB, MV (3 %), SN, TH, ST (3,5 %), NI (ev. 3–3,5 %, kath. 3,5–4 %), HH, SH ev. (3 %), HB ev. (3,5 %) | Die Kirchensteuer ist höchstens dieser Anteil des zvE |
| nur auf Antrag | BW, NW, RP (die amtliche Bekanntmachung nennt keine Kappung) | Gerechnet wird ohne Kappung. Liegt die Kirchensteuer über 2,75 % des zvE, zeigt das Cockpit „Kappung auf Antrag möglich“ |
| keine | BY | — |
| kein amtlicher Wert | HE, SL; HH, SH, HB kath. | „offen“ (`kappung-unbekannt`), aber nur wenn die Kirchensteuer über 2,75 % des zvE liegt. Darunter kann keine Kappung greifen |

Spannen bei Niedersachsen entstehen, weil die PLZ die Landeskirche bzw. das Bistum nicht eindeutig bestimmt.

### 4. Besonderes Kirchgeld und konfessionsverschiedene Ehe

- **Konfessionsverschieden** (beide Mitglied, verschiedene Kirchen): Die Kirchensteuer wird halbteilig auf die gemeinsame Steuer gerechnet. Die Summe ist dieselbe wie bei gleicher Konfession, nur die Aufteilung auf die Kirchen unterscheidet sich.
- **Glaubensverschieden** (nur ein Ehegatte Mitglied):
  - **Anteil:** Die Kirchensteuer fällt auf den Anteil des Mitglieds an der gemeinsamen Steuer. Der Anteil ergibt sich aus dem Verhältnis der Grundtarif-Steuer auf die eigenen Einkünfte. Die Kappung bezieht sich auf denselben Anteil am zvE.
  - **Vergleich:** Diese Kirchensteuer wird mit dem besonderen Kirchgeld nach der amtlichen Stufentabelle verglichen, der höhere Betrag gilt.
  - **Bemessungsgrundlage** des Kirchgelds ist das gemeinsame zvE nach § 51a Abs. 2 EStG, also nach den Kinderfreibeträgen.
- **Tabellen:**
  - bis 2024 ab 40.000 € (BStBl 2024 I S. 706 / S. 720, BStBl 2023 I S. 343)
  - ab 2025 ab 50.000 € (Bekanntmachungen 2025 SN, NI, NW, MV, BE, TH; 2026 SN, BW)
  - je 13 Stufen von 96 € bis 3.600 €
- **Wo erhoben:**
  - **Wird erhoben:** wo eine amtliche Quelle es für das Jahr belegt.
  - **Wird nicht erhoben:** Bayern (beide Kirchen), NRW und BW katholisch (dort nennt die amtliche Bekanntmachung nur andere Kirchen).
  - **Sonst:** „offen“ (`kirchgeld-unbekannt`), aber nur wenn die Tabelle greifen würde.

### 5. Abgeltungsteuer

`churchTaxReductionShare` steckt jetzt in der exakten Formel des § 32d Abs. 1 Satz 4 EStG:

- ESt = (e − 4q) / (4 + k)
- Kirchensteuer = k × ESt

Das ersetzt die Näherung „25 % − 25 % der Kirchensteuer“ in der Günstigerprüfung.

### 6. Was nicht geraten wird

Fehlt für ein Land ein amtlich belegter Wert, setzt die App ihn nicht ein. Das gilt für den Kappungssatz und für die Kirchgeld-Tabelle des Jahres. Wo der fehlende Wert die Kirchensteuer ändern könnte, zeigt die App „offen“ mit dem Grund. Der PR listet die Länder.

## Folgen

- Die Erstattungsspanne von Kirchenmitgliedern enthält jetzt die Kirchensteuer.
- Bei unbekannter Konfession zeigt das Cockpit einen Hinweis. Das gilt auch für Konten, die früher keinen bekamen, weil die Stammdaten leer sind.
- Der BMF-Rechner zur Einkommensteuer rechnet keine Kirchensteuer. Die Referenzwerte (6F) wenden deshalb Satz und Kappung auf die BMF-Einkommensteuer der 6A-Fixtures an.

## Annahmen

- **Kappungssätze:** Sie stammen aus Bekanntmachungen 2024–2026 und gelten in der App für 2022–2026. Die Sätze sind seit vielen Jahren unverändert, eine Änderung wäre in den Bekanntmachungen sichtbar.
- **Monatsweise Kürzung:** Die Kürzung bei unterjährigem Kirchenaustritt oder Eheschluss ist nicht abgebildet. Die Schätzung rechnet ein ganzes Jahr.
