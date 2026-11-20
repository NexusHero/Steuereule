# Steuerregeln für Selbstständige 2022–2026 — Quellen

Stand: 19.11.2026. Grundlage für `packages/core/src/domains/business/*` und die Einbindung in die Schätzung (`engine/business-income.ts`, ADR-0101). „Geprüft“ heißt: am Normtext auf gesetze-im-internet.de oder am BMF-Schreiben selbst nachgelesen. „Nicht am Primärtext geprüft“ steht dabei, wo nur Sekundärquellen oder Gedächtnis tragen.

## Freiberuf oder Gewerbe (`profession.ts`)

- § 18 Abs. 1 Nr. 1 Satz 2 EStG: Katalogberufe und die wissenschaftliche, künstlerische, schriftstellerische, unterrichtende, erzieherische Tätigkeit. Geprüft.
- § 18 Abs. 1 Nr. 1 Satz 3 und 4 EStG: Mithilfe fachlich vorgebildeter Arbeitskräfte nur bei eigener leitender und eigenverantwortlicher Tätigkeit; Vertretung bei vorübergehender Verhinderung schadet nicht. Geprüft.
- § 15 Abs. 2 EStG: Gewerbebetrieb als Auffangtatbestand. H 15.6 EStH zum „ähnlichen Beruf“: nicht am Primärtext geprüft.

## Abschreibung (`depreciation.ts`)

- § 6 Abs. 2 EStG: GWG bis 800 € netto; Verzeichnis über 250 €. § 52 Abs. 12 EStG: für Anschaffungen nach dem 31.12.2017. Geprüft.
- § 6 Abs. 2a EStG: Sammelposten über 250 € bis 1.000 €, je ein Fünftel im Bildungsjahr und den vier folgenden, Abgang mindert nicht, bis 250 € Sofortabzug, einheitlich für alle Wirtschaftsgüter des Jahres. Geprüft.
- § 7 Abs. 1 Satz 4 EStG: im Anschaffungsjahr je ein Zwölftel weniger für jeden vollen Monat vor dem Anschaffungsmonat. Geprüft. Abgangsjahr zeitanteilig einschließlich Abgangsmonat (R 7.4 Abs. 8 EStR): nicht am Primärtext geprüft.
- § 7 Abs. 2 EStG, degressive AfA: aktueller Text 1.7.2025–31.12.2027, 3-fach, höchstens 30 %. Geprüft. § 52 Abs. 15 Satz 4 EStG nennt die Fenster 1.1.2020–31.12.2022 und 1.4.–31.12.2024. Geprüft. Die Sätze dieser Fenster (2,5-fach/25 % und 2-fach/20 %) stammen aus den Änderungsgesetzen: nicht am Primärtext geprüft.
- § 7 Abs. 4 EStG: 3 % Betriebsgebäude (Nr. 1), 3 % Wohngebäude fertiggestellt nach dem 31.12.2022, 2 % sonst, 2,5 % vor 1925. Geprüft.
- § 7 Abs. 5a EStG: 5 % vom Restwert für Wohngebäude mit Baubeginn 1.10.2023–30.9.2029. Geprüft.
- AfA-Tabelle AV, BMF 15.12.2000, IV D 2 - S 1551 - 188/00, BStBl I S. 1532: Nutzungsdauern im Code mit Fundstelle. Geprüft am Tabellentext.
- BMF 22.02.2022, IV C 3 - S 2190/21/10002 :025 (ersetzt BMF 26.02.2021): Computerhardware und Software 1 Jahr; kein Wahlrecht, Verzeichnis nötig, volle AfA im Anschaffungsjahr wird nicht beanstandet (Tz. 1.1, 1.2, 1.4). Geprüft über WD 4 - 3000 - 051/22 des Bundestags. Ob Smartphones darunterfallen: offen; der Code nimmt 5 Jahre (AfA-Tabelle AV 6.13.2.2).
- § 7g Abs. 1 EStG: IAB bis 50 %, Gewinngrenze 200.000 €, Höchstbetrag 200.000 € je Betrieb. Abs. 2: Hinzurechnung bis 50 % der Kosten, Herabsetzung der Kosten. Abs. 3: Rückgängigmachung nach dem dritten Folgejahr. Abs. 5: Sonder-AfA bis 40 % im Anschaffungsjahr und den vier folgenden. Abs. 6: Gewinngrenze, fast ausschließlich betriebliche Nutzung. Geprüft.
- § 52 Abs. 16 EStG: 40 % für Anschaffungen nach dem 31.12.2023 (davor 20 %); Investitionsfrist für Abzüge 2017 sechs, 2018 fünf, 2019 vier Jahre. Für 2020 und 2021 keine Verlängerung im Text. Geprüft.
- § 7a Abs. 9 EStG: nach Ablauf des Begünstigungszeitraums Restwert auf die Restnutzungsdauer. Nicht am Primärtext geprüft.

## Umsatzsteuer (`vat-annual.ts`, `business-taxes.ts`)

- § 12 Abs. 1, 2 UStG: 19 % und 7 %. § 12 Abs. 3 UStG: 0 % Photovoltaik bis 30 kWp. Geprüft (Text ohne Befristung).
- § 12 Abs. 2 Nr. 15 UStG, Speisen in der Gastronomie ohne Getränke: 7 % ab 1.1.2026, Steueränderungsgesetz 2025 vom 22.12.2025 (BGBl. 2025 I Nr. 363). Geprüft am aktuellen Text; Datum über Bundestag/KPMG/Haufe. 7 % vom 1.7.2020 bis 31.12.2023 und 19 % in 2024/2025: nicht am Primärtext geprüft.
- § 28 Abs. 5 UStG, Gas 7 % vom 1.10.2022 bis 31.3.2024: nicht am Primärtext geprüft.
- § 19 Abs. 1 UStG: 25.000 € Vorjahr, 100.000 € laufendes Jahr (ab 2025); Gesamtumsatz nach vereinnahmten Entgelten (Abs. 2); Verzicht bindet fünf Jahre (Abs. 3). Geprüft. BMF 18.03.2025, III C 3 - S 7360/00027/044/105: Überschreiten der 100.000 € beendet die Regel mit diesem Umsatz. Bis 2024 22.000 € / 50.000 €: nicht am Primärtext geprüft.
- § 20 Satz 1 UStG: Istversteuerung bis 800.000 € Vorjahresumsatz, für freie Berufe ohne Grenze. Geprüft. 600.000 € bis 2023: nicht am Primärtext geprüft.
- § 13b, § 15 Abs. 1 Satz 1 Nr. 4, § 19 Abs. 1 Satz 4 UStG (Steuerschuld des Empfängers, Abzug, Kleinunternehmer ohne Abzug): nicht am Primärtext geprüft.

## Gewerbesteuer (`trade-tax.ts`)

- § 8 Nr. 1 GewStG: ein Viertel der Summe aus a) bis f) über 200.000 €; d) ein Fünftel (Hälfte davon für E-Fahrzeuge und Fahrräder), e) die Hälfte, f) ein Viertel. Geprüft.
- § 9 Nr. 1 Satz 1 GewStG ab EZ 2025: die im Erhebungszeitraum als Betriebsausgabe erfasste Grundsteuer (§ 36 Abs. 4b Satz 1 GewStG, Fassung des JStG 2024 vom 2.12.2024). Geprüft. Bis 2024 1,2 % von 140 % des Einheitswerts: über Haufe/NWB, nicht am Primärtext geprüft.
- § 10a GewStG: Fehlbeträge bis 1 Mio. € voll, darüber 60 %. Geprüft.
- § 11 Abs. 1, 2 GewStG: Abrundung auf volle 100 €, Freibetrag 24.500 € höchstens in Höhe des abgerundeten Ertrags, Messzahl 3,5 %. Geprüft. R 14.1 Satz 3 GewStR: Messbetrag auf volle Euro abrunden (über NWB, Fassung der GewStR 2009).
- § 35 Abs. 1 EStG: 4,0-faches des Messbetrags, Ermäßigungshöchstbetrag, Begrenzung auf die tatsächlich zu zahlende Gewerbesteuer. Geprüft.
- BMF 03.11.2016, IV C 6 - S 2296-a/08/10002-003, BStBl I S. 1187, geändert durch BMF 17.04.2019, IV C 6 - S 2296-a/17/10004: Rn. 4 (Ausgangsgröße, § 35a danach), Rn. 9 (je Betrieb begrenzt), Rn. 10 (Ehegatten), Rn. 16–18 (Formel, positive Einkünfte je Einkunftsart, Beispiele). Geprüft am Text. Ein neueres Schreiben habe ich nicht gefunden.
- § 51a Abs. 2 Satz 3 EStG: § 35 bleibt bei der Kirchensteuer außer Betracht. Geprüft. § 3 Abs. 2 SolZG: Soli auf die festzusetzende Einkommensteuer mit Kinderfreibeträgen; nennt § 35 nicht. Dass § 35 den Soli mindert, ist die übliche Lesart; nicht am Wortlaut belegt.

## Verluste (`losses.ts`)

- § 10d Abs. 1 EStG (Fassung ab 1.1.2024): Rücktrag bis 1 Mio. € (2 Mio. € zusammen), erst ins Vorjahr, dann ins zweite Vorjahr, vorrangig vor Sonderausgaben; Verzicht nur insgesamt. Geprüft.
- § 10d Abs. 2 EStG: 1 Mio. € (2 Mio. €) voll, darüber 70 %. Geprüft. § 52 Abs. 18b Satz 3 EStG: ab VZ 2024. 70 % nur bis 2027, ab 2028 60 %: über Steuerschröder, nicht am Primärtext geprüft.
- 10 Mio. € / 20 Mio. € für 2022 und 2023 (Viertes Corona-Steuerhilfegesetz; § 52 Abs. 18b Satz 2 EStG): über Haufe und buzer.de, nicht am Primärtext geprüft.
- § 10d Abs. 4 Satz 2 EStG: verbleibender Verlustvortrag. Geprüft.
- Offen: ob der Höchstbetrag des Satzes 1 für beide Rücktragsjahre zusammen gilt (der Code liest es so); die Reihenfolge von Rücktrag aus einem späteren Jahr und Vortrag im selben Jahr (der Code zieht den Rücktrag zuerst ab); BVerfG 23.07.2025, 2 BvL 19/14 zur Mindestbesteuerung, Inhalt nicht gelesen.

## Gewinn (`profit.ts`)

- § 4 Abs. 5 Satz 1 Nr. 1 EStG: Geschenke bis 50 € je Empfänger und Jahr. Geprüft. § 52 Abs. 6 Satz 1 EStG: ab Wirtschaftsjahren nach dem 31.12.2023. Geprüft. Vorher 35 €: nicht am Primärtext geprüft.
- § 4 Abs. 5 Satz 1 Nr. 2 EStG: Bewirtung zu 70 %. Geprüft.
- § 4 Abs. 5 Satz 1 Nr. 5 mit § 9 Abs. 4a Satz 3 EStG: 28 € / 14 €. Geprüft am aktuellen Text.
- § 4 Abs. 5 Satz 1 Nr. 6 EStG: Fahrten Wohnung–Betrieb mit Entfernungspauschale, 0,03-%-Regel bei Kfz im Betriebsvermögen. Geprüft.
- § 9 Abs. 1 Satz 3 Nr. 4 EStG: 0,38 € ab dem ersten Kilometer, aktueller Text. Geprüft. Ab 2026 durch das Steueränderungsgesetz 2025 (BT-Drs. 21/1974). Bis 2025 0,30 € / 0,38 € ab dem 21. km: nicht am Primärtext geprüft.
- § 4 Abs. 5 Satz 1 Nr. 6b, 6c EStG: Mittelpunkt, Jahrespauschale 1.260 € mit Kürzung je Monat, Tagespauschale 6 € bis 1.260 €. Geprüft. Fassung 2022 (1.250 €, 5 € bis 600 €): nicht am Primärtext geprüft.
- § 4 Abs. 5b EStG: Gewerbesteuer keine Betriebsausgabe. Geprüft.
