# Kennzahlen je Steuerjahr

Werte 2022–2026 für Tarif, Soli, Kinder, Pauschbeträge, Pendeln und Fristen sind mit dem
Rechenkern von SteuerEule (`packages/core/src/math/`) abgeglichen, der gegen den
BMF-Steuerrechner getestet ist. **„prüfen“** = vor Verwendung in einer Primärquelle bestätigen
(siehe [quellen.md](quellen.md)). Für Jahre nach 2026 grundsätzlich alles neu nachschlagen.

## Tarif & Zuschläge

| Kennzahl | 2023 | 2024 | 2025 | 2026 | Norm |
| :--- | ---: | ---: | ---: | ---: | :--- |
| Grundfreibetrag | 10.908 | 11.784 | 12.096 | 12.348 | § 32a Abs. 1 EStG |
| Spitzensteuersatz 42 % ab zvE | 62.810 | 66.761 | 68.481 | 69.879 | § 32a |
| Reichensteuer 45 % ab zvE | 277.826 | 277.826 | 277.826 | 277.826 | § 32a |
| Soli-Freigrenze (ESt) Einzel / Zusammen | 17.543 / 35.086 | 18.130 / 36.260 | 19.950 / 39.900 | 20.350 / 40.700 | § 3 Abs. 3 SolZG |
| Soli-Satz / Milderungszone | 5,5 % / 11,9 % | ← | ← | ← | § 4 SolZG |
| Kirchensteuer | 8 % (BY, BW), sonst 9 % der ESt | ← | ← | ← | KiStG der Länder |

## Kinder & Familie

| Kennzahl | 2023 | 2024 | 2025 | 2026 | Norm |
| :--- | ---: | ---: | ---: | ---: | :--- |
| Kindergeld je Kind/Monat | 250 | 250 | 255 | 259 | § 66 EStG |
| Kinderfreibetrag (sächl. Existenzmin., beide Eltern) | 6.024 | 6.612 | 6.672 | 6.828 | § 32 Abs. 6 |
| BEA-Freibetrag (beide Eltern) | 2.928 | 2.928 | 2.928 | 2.928 | § 32 Abs. 6 |
| Entlastungsbetrag Alleinerziehende (1. Kind) | 4.260 | 4.260 | 4.260 | 4.260 | § 24b (+240 je weiteres Kind) |
| Kinderbetreuung | 2/3, max. 4.000 | 2/3, max. 4.000 | 80 %, max. 4.800 | 80 %, max. 4.800 (prüfen) | § 10 Abs. 1 Nr. 5 |
| Schulgeld | 30 %, max. 5.000 | ← | ← | ← | § 10 Abs. 1 Nr. 9 |

## Pauschbeträge & Werbungskosten

| Kennzahl | 2023 | 2024 | 2025 | 2026 | Norm |
| :--- | ---: | ---: | ---: | ---: | :--- |
| Arbeitnehmer-Pauschbetrag | 1.230 | 1.230 | 1.230 | 1.230 | § 9a Nr. 1a |
| Werbungskosten-Pauschbetrag Renten | 102 | 102 | 102 | 102 | § 9a Nr. 3 |
| Sonderausgaben-Pauschbetrag Einzel/Zus. | 36 / 72 | ← | ← | ← | § 10c |
| Sparer-Pauschbetrag Einzel/Zus. | 1.000 / 2.000 | ← | ← | ← | § 20 Abs. 9 |
| Entfernungspauschale | 0,30 € bis km 20, 0,38 € ab km 21 | ← | ← | **0,38 € ab km 1** | § 9 Abs. 1 S. 3 Nr. 4 |
| Höchstbetrag ohne eigenen/überlassenen Pkw | 4.500 | ← | ← | ← | § 9 Abs. 1 S. 3 Nr. 4 |
| Homeoffice-Tagespauschale | 6 €/Tag, max. 210 Tage = 1.260 € | ← | ← | ← | § 4 Abs. 5 Nr. 6c |
| Arbeitszimmer (Mittelpunkt) Jahrespauschale | 1.260 € oder tatsächliche Kosten | ← | ← | ← | § 4 Abs. 5 Nr. 6b |
| Verpflegungsmehraufwand Inland | 14 € (>8 h / An-/Abreisetag), 28 € (24 h) | ← | ← | ← | § 9 Abs. 4a |
| Kürzung gestellte Mahlzeit | Frühstück 20 %, Mittag/Abend je 40 % von 28 € | ← | ← | ← | § 9 Abs. 4a S. 8 |
| Unterkunft doppelte Haushaltsführung | max. 1.000 €/Monat | ← | ← | ← | § 9 Abs. 1 S. 3 Nr. 5 |
| GWG-Grenze (netto) | 800 € | ← | ← | ← | § 6 Abs. 2 |
| Übungsleiterfreibetrag | 3.000 | 3.000 | 3.000 | 3.300 (prüfen) | § 3 Nr. 26 |
| Ehrenamtspauschale | 840 | 840 | 840 | 960 (prüfen) | § 3 Nr. 26a |
| Freigrenze private Veräußerungsgeschäfte | 600 | 1.000 | 1.000 | 1.000 | § 23 Abs. 3 |
| Freigrenze sonstige Leistungen | 256 | 256 | 256 | 256 | § 22 Nr. 3 |

## Vorsorge, Belastungen, Ermäßigungen

| Kennzahl | Wert | Norm |
| :--- | :--- | :--- |
| Basisvorsorge Alter (Rente, Rürup) | ab 2023 100 % abziehbar bis Höchstbetrag (jährlich angepasst, prüfen); Arbeitgeberanteil wird abgezogen | § 10 Abs. 3 |
| Sonstige Vorsorge (KV-Wahlleistungen, Haftpflicht, BU, ALV …) | 1.900 € (Arbeitnehmer/Beihilfe), 2.800 € (Selbstzahler); Basis-KV/PV immer voll | § 10 Abs. 4 |
| Haushaltsnahe Minijobs | 20 %, max. 510 € Steuerermäßigung | § 35a Abs. 1 |
| Haushaltsnahe Dienstleistungen / Pflege | 20 %, max. 4.000 € | § 35a Abs. 2 |
| Handwerkerleistungen (nur Arbeitskosten) | 20 %, max. 1.200 € | § 35a Abs. 3 |
| Spenden | bis 20 % des Gesamtbetrags der Einkünfte; vereinfachter Nachweis bis 300 € | § 10b, § 50 EStDV |
| Parteispenden | 50 % Steuerermäßigung auf max. 1.650/3.300 €, darüber Sonderausgaben | § 34g |
| Behinderten-Pauschbetrag | GdB 20: 384 € … GdB 100: 2.840 €; H/Bl/TBl: 7.400 € | § 33b Abs. 3 |
| Pflege-Pauschbetrag | Pflegegrad 2: 600 €, 3: 1.100 €, 4/5/H: 1.800 € | § 33b Abs. 6 |
| Unterhalt an Bedürftige | Höchstbetrag = Grundfreibetrag des Jahres + übernommene Basis-KV/PV; eigene Einkünfte > 624 € mindern | § 33a Abs. 1 |
| Zumutbare Belastung | 1–7 % gestuft nach GdE (15.340 / 51.130 €) und Familienstand (BFH VI R 75/14) | § 33 Abs. 3 |
| Altersentlastungsbetrag | sinkt je Geburtsjahrgang; Tabelle § 24a | § 24a |
| Besteuerungsanteil Rente (Rentenbeginn) | 2023: 82,5 %, 2024: 83 %, 2025: 83,5 %, 2026: 84 % (+0,5 %-Pkt./Jahr) | § 22 Nr. 1 S. 3 a aa |

## Fristen (Einkommensteuer)

| Steuerjahr | Abgabe ohne Berater (Pflicht) | mit Berater (prüfen) | freiwillige Erklärung bis |
| :--- | :--- | :--- | :--- |
| 2023 | 02.09.2024 | 02.06.2025 | 31.12.2027 |
| 2024 | 31.07.2025 | 30.04.2026 | 02.01.2029 |
| 2025 | 31.07.2026 | 31.03.2027 | 31.12.2029 |
| 2026 | 02.08.2027 | 29.02.2028 | 31.12.2030 |

Fällt ein Fristende auf Samstag/Sonntag/Feiertag: nächster Werktag (§ 108 Abs. 3 AO).

## Umsatzsteuer & Betrieb

| Kennzahl | Wert | Norm |
| :--- | :--- | :--- |
| Kleinunternehmer ab 2025 | Vorjahr ≤ 25.000 € **und** laufendes Jahr ≤ 100.000 € (Überschreiten → ab diesem Umsatz regelbesteuert) | § 19 UStG |
| Kleinunternehmer bis 2024 | Vorjahr ≤ 22.000 €, laufendes Jahr voraussichtlich ≤ 50.000 € | § 19 UStG a. F. |
| Ist-Versteuerung | Vorjahresumsatz ≤ 800.000 € (ab 2024) | § 20 UStG |
| Steuersätze | 19 % / 7 % | § 12 UStG |
| Buchführungspflicht Gewerbe | Umsatz > 800.000 € oder Gewinn > 80.000 € (ab 2024) | § 141 AO |
| Gewerbesteuer-Freibetrag (Personenunternehmen) | 24.500 € | § 11 GewStG |
| GewSt-Anrechnung auf ESt | 4,0 × Messbetrag (max. tatsächliche GewSt) | § 35 EStG |
| Sammelposten | 250,01–1.000 € netto, 5 Jahre | § 6 Abs. 2a |
| Computer/Software | Nutzungsdauer 1 Jahr zulässig (BMF 22.02.2022) | BMF |
| Nachzahlungs-/Erstattungszinsen | 0,15 %/Monat (1,8 %/Jahr), Karenzzeit 15 Monate | § 233a AO |
