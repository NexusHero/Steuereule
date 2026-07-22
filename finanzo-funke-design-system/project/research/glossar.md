# Glossar — SteuerEule

Verbindliche Begriffe. Ein Begriff = ein Wort, überall in UI, Code und Doku identisch. Status: 🟢 geklärt · 🟡 in Klärung (Grilling) · Datum = letzte Änderung.

| Begriff | Bedeutung | Status |
|---|---|---|
| Steuerjahr | Wurzel-Aggregat. Ein Kalenderjahr, für das ein Nutzer eine Erklärung erstellt. Trägt Status (Entwurf → Eingereicht → Bescheid da → Abgeschlossen). | 🟢 |
| Beleg | Hochgeladenes Dokument (Foto/PDF) mit extrahierten Werten. Gehört zu genau einem Steuerjahr, kann mehreren Posten zugeordnet sein. | 🟢 |
| Posten | Ein einzelner steuerlich relevanter Wert (z. B. eine Fahrtkostenposition). Trägt immer Herkunft: Beleg, Regel oder Eingabe. | 🟢 |
| Herkunft | Woher eine Zahl stammt: Beleg / Regel (Pauschale, Rechenweg) / Eingabe (Nutzer). Jede Zahl in der UI trägt sie. | 🟢 |
| Fassung | Eingefrorener Stand einer Erklärung zum Zeitpunkt der Einreichung. Unveränderlich; Korrekturen erzeugen eine neue Fassung. | 🟢 |
| Zack-Moment | Der eine sichtbare Erfolgsmoment pro Journey (Sticker/Konfetti-Ersatz). Max. 1 sichtbar. | 🟢 |
| Eule / Tutor | Der Hilfe-Layer (Begriff-Popover, Kontext-Tipps). Unsichtbar, bis gebraucht. | 🟢 |
| Grenzgänger | Nutzer mit Arbeitsort im Ausland (CH/AT/LU/FR/NL), Versteuerung in DE. Eigener Profiltyp mit Wechselkurs-Logik. | 🟢 |
| Gewerbe-Gate | Einstiegsprüfung, die Gewerbetreibende/Selbstständige erkennt und in den EÜR-Pfad leitet. Fügt seit ADR-010 eine Einkunftsart hinzu statt umzutypen. | 🟢 |
| Posteingang | Ablage für Belege ohne Jahresbindung. Extraktion schlägt Steuerjahr vor, Nutzer bestätigt. (ADR-007) | 🟢 |
| Konflikt | Posten-Zustand bei widersprüchlichen Quellen (Beleg ≠ Eingabe). Beide Werte sichtbar, blockiert Einreichung. Amber, kein Rot. (ADR-008) | 🟢 |
| Einkunftsart | Fachliche Kategorie eines Steuerjahrs (Nichtselbstständig, Gewerbe, Vermietung, Kapital, Grenzgänger …). Mehrere pro Jahr erlaubt; ersetzt „Profiltyp" als Modellbegriff. (ADR-010) | 🟢 |
| Kopplung | Verbindung zweier Steuerjahre desselben Kalenderjahres bei Zusammenveranlagung; erzeugt gemeinsame Fassung, Daten bleiben personengebunden. (ADR-006) | 🟢 |
| Einspruch | Flow nach Bescheid (1-Monats-Frist), getrennt von „Korrektur" (vor Bescheid). (ADR-009) | 🟢 |
| Rückfrage | Zustand zwischen Eingereicht und Bescheid: Finanzamt fordert Belege nach. Eigene Upload-Aufgabe + Frist. (ADR-018) | 🟢 |
| Extern erledigt | Jahr wurde außerhalb der App eingereicht (z. B. ELSTER direkt); App dient als Archiv. (ADR-018) | 🟢 |
| KI-Vorschlag | Violettes Objekt (`data-ai="true"`), das erst durch expliziten Tap zum Posten wird. Zählt nie in den Ticker. (ADR-014) | 🟢 |
| Spanne | Erstattungs-Anzeige vor Vollständigkeit („620–740 €"); verengt sich pro geklärtem Posten. (ADR-015) | 🟢 |
| Lebenslage | Katalog-Eintrag in Nutzersprache („Zwei Wohnungen wegen des Jobs"), der einen kompletten Flow aktiviert — nie ein Eintrag ohne gebauten Flow. (ADR-031/035/036) | 🟢 |
| Zumutbare Grenze | Schwelle (§ 33 EStG), ab der Krankheitskosten wirken; live mit Balken gezeigt, Herkunft am Grenzwert. (ADR-035) | 🟢 |
| Lohnausweis | Der Schweizer Lohnnachweis (Ziffern 1–15, CHF) — eigener Dokumenttyp neben der Lohnsteuerbescheinigung; CHF führt, EUR daneben. (ADR-029/036) | 🟢 |
| Eulen-Modus | Opt-in Stufe über dem Berater: die Eule liest Rechtsänderungen, jagt Lücken, fragt aktiv nach — ein Wesen mit dem Berater, kein zweiter Charakter. (ADR-037) | 🟢 |
| Fund | Ergebnis der Eulen-Prüfung (Lücke, Vergleich, Rechtsänderung, Beleg-Hinweis) — als Karte mit Betrag, Quelle menschlich übersetzt, „Stimmt nicht"-Knopf. Proaktiv ins Cockpit nur ab ≈50 €. (ADR-038/039/041) | 🟢 |
| Abruf | „Was würdest du mich fragen?" — das Gesprächsformat des Eulen-Modus: eine Frage nach der anderen, ehrlicher Leerlauf mit Prüfstand. (ADR-038/039) | 🟢 |
| Archiv-Wache | Die Eule prüft auch abgegebene Jahre gegen neue Urteile; Fund im Einspruchsfenster → nüchterne Einspruchsfrist-Karte. (ADR-042) | 🟢 |
| Rechtsstand | Dezente Datums-Zeile unter Fund-Karten: wann die Eule zuletzt Gesetze/Urteile geprüft hat. (ADR-039) | 🟢 |
| Unbestätigt | Posten-Zustand nach Jahresübernahme: kopiert aus dem Vorjahr, gilt bis Bestätigung/Belegdeckung nicht als gesichert. Grau, nicht Amber. (ADR-021) | 🟢 |
| Rückjahr | Vergangenes Steuerjahr (bis 4 zurück) mit eigenem Jahresregelwerk. (ADR-022) | 🟢 |
| Saison-Erinnerung | Die eine erlaubte Reaktivierungs-Push pro Steuersaison; abschaltbar. (ADR-024) | 🟢 |
| Lebenslage | Kuratierter Katalog-Eintrag in Nutzersprache („Zwei Wohnungen wegen des Jobs"), der einen echten Erfassungs-Flow öffnet. Nur gebaute Einträge erscheinen. (ADR-031/035/036) | 🟢 |

_Neue Begriffe werden während der Grilling-Session ergänzt._
