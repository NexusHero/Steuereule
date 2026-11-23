# Buchhaltung für Selbstständige: Quellen und Lizenzen (ADR-0101)

Stand: 19.11.2026. Gilt für `packages/core/src/domains/ledger/*`.

## Kontenrahmen SKR03 und SKR04

- **Kontonummern:** Die Nummern der Rahmen SKR03 und SKR04 sind ein De-facto-Standard der deutschen Buchführung. Wir verwenden nur die Nummern, nicht die Bezeichnungen eines veröffentlichten Katalogs.
- **Abgleich:** Jede Nummer wurde gegen die offen lizenzierten Kontenpläne von Odoo geprüft: `odoo/odoo`, Zweig `18.0`, Dateien `addons/l10n_de/data/template/account.account-de_skr03.csv` und `account.account-de_skr04.csv`, Lizenz **LGPL-3.0**. Aus diesen Dateien wurde nichts übernommen außer dem Abgleich, dass Nummer und Bedeutung in beiden Rahmen zusammenpassen; auch die HGB-Zuordnung (Odoo-Tags `tag_de_asset_bs_*`, `tag_de_liabilities_bs_*`, `tag_de_pl_*`) diente nur zum Gegenlesen.
- **Abweichungen von Odoo:** Kasse (1000/1600), Bank (1200/1800) und Geldtransit (1360/1460) fehlen bei Odoo (Odoo legt sie über Journale an); wir nutzen die üblichen Nummern. Für Forderungen und Verbindlichkeiten nehmen wir die Konten „ohne Kontokorrent“ (1410/1210, 1610/3310), weil die App keine Debitoren- und Kreditorenkonten führt.
- **Bezeichnungen:** Alle Kontobezeichnungen sind eigene Formulierungen.
- **Umfang:** 184 Konzepte je Rahmen. Jedes Konzept hat Art, Standard-Steuerschlüssel, EÜR-Schlüssel (`EuerKey`), HGB-Position (§ 266 HGB in der Tiefe für kleine Gesellschaften, § 275 Abs. 2 HGB Gesamtkostenverfahren) und das E-Bilanz-Element dieser Position.

## Zufluss und Abfluss (§ 11 EStG)

- Regelmäßig wiederkehrende Einnahmen und Ausgaben, die kurze Zeit vor oder nach dem Jahreswechsel gezahlt werden, gehören in das Jahr, zu dem sie wirtschaftlich gehören (§ 11 Abs. 1 S. 2, Abs. 2 S. 2 EStG). „Kurze Zeit“ sind zehn Tage (H 11 EStH), also 22.12. bis 10.1.
- Auch die Fälligkeit muss in diesem Zeitraum liegen (BFH, Urteil vom 27.6.2018, X R 44/16).
- Fällt der 10.1. auf ein Wochenende, verschiebt sich die Fälligkeit der Umsatzsteuer-Vorauszahlung nach § 108 Abs. 3 AO; sie liegt dann außerhalb des Zeitraums (BFH, Urteil vom 21.6.2022, VIII R 25/20). Die App rechnet mit dem Fälligkeitsdatum, das der Nutzer oder die API nach dieser Verschiebung angibt.

## Aufbewahrung (§ 147 AO)

- Bücher, Inventare, Jahresabschlüsse, Eröffnungsbilanz, Arbeitsanweisungen und Organisationsunterlagen (also auch die Verfahrensdokumentation): **zehn Jahre** (§ 147 Abs. 1 Nr. 1, Abs. 3 S. 1 AO).
- Buchungsbelege: **acht Jahre** seit dem Vierten Bürokratieentlastungsgesetz (BEG IV), ab 1.1.2025. Die neue Frist gilt für alle Unterlagen, deren Frist am 31.12.2024 noch nicht abgelaufen war (Art. 97 § 19a EGAO). Für Kredit- und Versicherungsunternehmen gilt die Verkürzung erst später; für Selbstständige in der App spielt das keine Rolle.
- Handels- und Geschäftsbriefe, sonstige Unterlagen: **sechs Jahre**.
- Die Frist beginnt mit dem Ende des Kalenderjahres der letzten Eintragung bzw. Entstehung (§ 147 Abs. 4 AO) und endet nicht, solange die Festsetzungsfrist läuft (§ 147 Abs. 3 S. 5 AO).
- ADR-0101 §13 ist entsprechend angepasst; `retentionPeriod` gibt die gesetzliche Frist zurück.

## Nicht abziehbare Ausgaben in der EÜR

- Jedes Konto landet auf genau einem `EuerKey`. Was ganz nicht abziehbar ist, steht nur auf seinem eigenen Schlüssel, nie zusätzlich auf einem gewöhnlichen: Gewerbesteuer (4320/7610) auf `ausgaben_gewerbesteuer` (§ 4 Abs. 5b EStG), nicht abziehbare Schuldzinsen nach § 4 Abs. 4a EStG (2113/7313) auf `nicht_abziehbar_schuldzinsen_4_4a`, nicht abziehbare Verspätungszuschläge und Zwangsgelder (4397/6437), Nebenleistungen zu Steuern (2102/7302) und Werbe- und Repräsentationskosten (4655/6645) auf `nicht_abziehbar_sonstige`. Die Steuerregeln (`profit.ts`) zählen diese Schlüssel mit 0.
- Der nicht abziehbare Teil der Schuldzinsen wird deshalb vom Zinskonto auf 2113/7313 umgebucht, nicht zusätzlich gebucht.
- Ein eigenes Konto für Geldbußen gibt es in den abgeglichenen Odoo-Kontenplänen nicht; es ist deshalb nicht angelegt.
- Die Umsatzsteuer auf unentgeltliche Wertabgaben (Waren- und Leistungsentnahmen, private Kfz-Nutzung) steht auf `einnahmen_umsatzsteuer_entnahmen`, getrennt von der vereinnahmten Umsatzsteuer.
- Kürzung der Anschaffungskosten nach § 7g Abs. 2 EStG (4853/4854, 6243/6244) auf `ausgaben_herabsetzung_7g`; AfA auf immaterielle Wirtschaftsgüter auf `ausgaben_afa_immateriell`; Miete und Leasing beweglicher Wirtschaftsgüter auf `ausgaben_miete_leasing_beweglich`.

## Datenzugriff Z3 (GDPdU-Beschreibungsstandard)

- Export als `index.xml` nach der DTD `gdpdu-01-09-2004.dtd` der Finanzverwaltung plus CSV (Semikolon, Dezimalkomma, Datum `DD.MM.YYYY`, UTF-8, CRLF).
- Die DTD selbst liefert die API aus der Veröffentlichung des BMF mit; sie ist nicht im Kern.

## E-Bilanz-Taxonomien

| Version | Datum der Taxonomie | Pflicht für Wirtschaftsjahre, die beginnen nach | Quelle |
|---|---|---|---|
| 6.5 | 01.04.2021 | 31.12.2021 (WJ 2022) | jährlicher Rhythmus, nicht einzeln belegt |
| 6.6 | 01.04.2022 | 31.12.2022 (WJ 2023) | jährlicher Rhythmus, nicht einzeln belegt |
| 6.7 | 01.04.2023 | 31.12.2023 (WJ 2024) | BMF-Schreiben vom 9.6.2023 |
| 6.8 | 01.04.2024 | 31.12.2024 (WJ 2025) | BMF-Schreiben vom Juni 2024 |
| 6.9 | 01.04.2025 | 31.12.2025 (WJ 2026) | BMF-Schreiben vom 10.6.2025 |

- Jede Version darf schon ein Jahr früher verwendet werden (Nichtbeanstandung).
- Taxonomie 6.10 (1.4.2026) gilt ab Wirtschaftsjahr 2027 und liegt außerhalb der Jahre der App.

### Kontennachweise und Anlagenspiegel (Primärquellen geprüft)

- **Gesetz:** § 5b Abs. 1 S. 1 EStG i. d. F. des JStG 2024 (BGBl. 2024 I Nr. 387): Bilanz und GuV „einschließlich der unverdichteten Kontennachweise mit Kontensalden“. Nach § 52 Abs. 11 S. 3 EStG gilt das für Wirtschaftsjahre, die nach dem 31.12.2024 beginnen; für Anlagenspiegel und Anlagenverzeichnis als gesetzliche Pflicht nach § 52 Abs. 11 S. 4 EStG erst ab Wirtschaftsjahren nach dem 31.12.2027 (gelesen auf gesetze-im-internet.de).
- **BMF-Schreiben vom 10.6.2025** (IV C 6 - S 2133-b/00064/002/006; gelesen als PDF): Kontennachweis zu jeder werthaltigen Position mit Name der Position, Kontonummer, Kontobeschreibung und Kontosaldo; zumindest alle Sachkonten mit Saldo am Ende des Wirtschaftsjahres; keine Verdichtung zu Kontengruppen; keine Personenkonten und kein Journal. Für Taxonomie 6.9 wird nicht beanstandet, wenn die Kontennachweise auf anderem Weg eingereicht und die Gründe in einer eigenen Taxonomieposition erläutert werden. Der Anlagenspiegel bleibt nach dem BMF-Schreiben vom 24.5.2016 Mussfeld für Wirtschaftsjahre nach dem 31.12.2016.
- **Folge für 2025:** Taxonomie 6.8 enthält noch keine Kontennachweise. Die App nimmt für 2025 deshalb 6.9 (zulässig nach dem BMF-Schreiben).
- **Offen:** Die genauen Elementnamen für das Kontennachweis-Tupel und die Spalten des Anlagenspiegels stehen nur im Taxonomiepaket auf esteuer.de, das nicht erreichbar war. Sie sind in `E_BILANZ_DETAIL_ELEMENTS` gesammelt und vor der ersten Übermittlung zu prüfen.
- esteuer.de war beim Abruf nicht erreichbar (Zertifikatsfehler); die Daten 6.7 bis 6.9 stammen aus Berichten über die BMF-Schreiben (otto-schmidt.de, KPMG, Kleeberg, Lexware).

## Bankformate

- CAMT.053 (ISO 20022, camt.053.001.02 bis .08), eigener Parser ohne DTD- und Entitätsauflösung.
- CSV-Vorlagen für Sparkasse („CSV-CAMT V2“), ING, DKB (Format seit 2023) und Commerzbank nach dem bekannten Spaltenaufbau dieser Exporte. Die Testdateien sind ausgedacht; gegen echte Exporte ist noch zu prüfen.
