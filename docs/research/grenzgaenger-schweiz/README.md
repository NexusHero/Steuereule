# Grenzgänger Schweiz: Wo Erklärung und Bescheid eines Echtfalls irren

Stand: 22.11.2026. Anlass: Ein Ehepaar (Wohnsitz Baden-Württemberg, beide Grenzgänger in die Schweiz, ein Kind) hat für 2024 und 2025 vom Steuerberater erstellte Erklärungen und Bescheide. Der Abgleich mit der App zeigte Abweichungen. Hier steht für jede, was die Primärquellen sagen. Die Fallwerte sind ohne Namen; die Einzelrecherchen liegen daneben.

Primärquellen: Gesetzestext (gesetze-im-internet.de), amtliche Anleitung zur Einkommensteuererklärung 2024/2025 (ELSTER-Hilfe, Abschnitt Anlage N-Gre), BMF-Schreiben, Entscheidungen des BFH. Kein Ergebnis beruht nur auf einer Sekundärquelle; was nicht selbst gelesen wurde, ist in den Einzeldateien als „nicht geprüft“ markiert.

## Ergebnis je Punkt

| # | Punkt | Erklärung/Bescheid | Richtig | Sicherheit | Datei |
|---|---|---|---|---|---|
| 1 | Kollektiv-Krankentaggeld im Bruttolohn (Ziffer 8), vom Versicherer über den Arbeitgeber ausgezahlt | 2024 als Lohn belassen, 2025 abgezogen | steuerfrei, in der N-Gre-Zeile „Steuerfreies Krankentaggeld“ abziehen (2024 Z. 8, 2025 Z. 9) | hoch | `01-krankentaggeld.md` |
| 1a | Progressionsvorbehalt auf dieses Taggeld | – | nach Anleitung und FG BW 14 K 2647/18 nein; BFH VI R 26/24 (Unfalltaggeld) könnte übertragen werden | mittel | `01-krankentaggeld.md` |
| 2 | Schweizer Kinderzulage (FamZG) im Bruttolohn | nicht abgezogen | steuerfrei (Anleitung N-Gre, § 65 EStG), abziehen (2024 Z. 7, 2025 Z. 8); kein Progressionsvorbehalt. BFH VI R 24/17: das Weglassen durch den Berater ist grob fahrlässig | hoch (Ergebnis), mittel (genaue Norm) | `02-kinderzulage.md` |
| 2a | Schweizer Abzugsteuer auf den steuerfreien Teil | voll angerechnet | nach Anleitung (Zeile 25) nur, soweit die Einkünfte erfasst sind | mittel (Verfügung nur sekundär) | `02-kinderzulage.md` |
| 3 | Zweiter KVG-Grundversicherer nach Kassenwechsel im Jahr | fehlt | Beiträge beider Versicherer voll als Basisabsicherung (§ 10 Abs. 1 Nr. 3 a EStG, BMF Rz. 140); Kind in Anlage Kind Kz 89 | hoch (ca. 90 %) | `03-kv-wechsel-grundversicherung.md` |
| 4 | Hälfte der NBUV-Prämie als Werbungskosten | nicht angesetzt | richtig: je 50 % Werbungskosten (Z. 59) und Vorsorge (Z. 81), BMF 28.10.2009 Tz. 1.3 | hoch (AN-Anteil), mittel-hoch (AG-Anteil) | `04-nbu-werbungskosten.md` |
| 5 | Höchstbetrag sonstige Vorsorge bei selbst bezahlter KVG | 1.900 € bei einer Person | 2.800 € (§ 10 Abs. 4 Satz 1); wirkt hier nicht, weil die Basisbeiträge den Höchstbetrag übersteigen (Satz 4) | hoch | `05-hoechstbetrag-sonstige-vorsorge.md` |

## Neu gerechnetes Soll (Rechenkern, Bescheid-Fälle aus `notice-parity.test.ts` mit den Korrekturen)

Minus = Nachzahlung, plus = Erstattung, nach Vorauszahlungen. Steuerfreies Taggeld und Kinderzulage sind auch kein AHV-Lohn: Die abziehbare Altersvorsorge sinkt mit ihnen (Anleitung N-Gre Z. 75 bis 77 und 83, AHV/IV 5,05 % von Zeile 77). Diese Folge ist eingerechnet.

| 2024 | zvE | nach Vorauszahlungen |
|---|---|---|
| Bescheid | 174.855 | −4.059,90 |
| **alle Korrekturen, ohne Progressionsvorbehalt, Anrechnung gekürzt (Soll)** | **153.276** | **+5.082,72** |
| dasselbe mit Progressionsvorbehalt auf das Taggeld | 153.276 | +2.121,84 |
| dasselbe mit voller Anrechnung (wie die App heute) | 153.276 | +6.082,72 |

| 2025 | zvE | nach Vorauszahlungen |
|---|---|---|
| Bescheid | 221.690 | −4.633,52 |
| **alle Korrekturen, Anrechnung gekürzt (Soll)** | **214.556** | **−1.405,00** |
| dasselbe mit voller Anrechnung (wie die App heute) | 214.556 | −1.281,00 |

Das Taggeld 2025 ist im Bescheid schon abgezogen; Punkt 5 ändert nichts. Offen und nicht eingerechnet: eine zweite Spendenbestätigung über 230 € 2024 (Doppel oder eigene Zuwendung, Frage an die Steuerpflichtigen), die Markise 2025 (rund 200 €) und der Kurs (BMF-Jahresdurchschnitt 2025 nachgerechnet 1,0671 statt 1,065; unter 20 € Wirkung bei der KV).

## Was das für die Abnahmetests heißt

Das Soll eines Echtfalls ist nicht der Bescheid, sondern der Bescheid mit den belegten Korrekturen dieser Liste. Der Fall steht als Abnahmetest in `apps/api/test/acceptance/echtfaelle/`. Ein Punkt mit mittlerer Sicherheit (1a, 2a) wird im Test als eigene Variante geführt, nicht stillschweigend gewählt. Die Rechnung oben ist eine Schätzung des Rechenkerns und keine Steuerberatung.
