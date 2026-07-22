# ADR-028 — Gewerbe-Gate bleibt in 1.0

**Status:** Bestätigt (Grilling Abdeckung R1) · 2026-07-22

Trotz „alles abdecken"-Anspruch: EÜR, Anlage G/S und Umsatzsteuer bleiben draußen; das ehrliche Gate (vormerken / Angestellten-Teil vorbereiten) bleibt wie gebaut. Gewerbe ist der größte Einzelblock und käme als halbes Feature — das widerspricht dem Ehrlichkeits-Prinzip.

# ADR-029 — Grenzgänger CH: volle Tiefe in 1.0

**Status:** Akzeptiert (Grilling Abdeckung R1) · 2026-07-22

**Entscheidung:** Der DE→CH-Pfad wird komplett:
1. **CH-Lohnausweis scannen** — Ziffern 1–15 (CHF) werden erkannt und automatisch auf Anlage N-Gre gemappt; Herkunft pro Wert „Lohnausweis Ziffer n × Kurs".
2. **Quellensteuer 4,5 %** — Anrechnung automatisch gerechnet.
3. **Pensionskasse (2. Säule)** — Beiträge als Vorsorgeaufwand angesetzt.
4. **Säule 3a** — erfasst + verständlich erklärt (begrenzte Abziehbarkeit ehrlich benannt).
5. **CH-Krankenkasse** — als Basisvorsorge angesetzt.
6. **Familienzulagen (Kinderzulage)** — mit Kindergeld verrechnet, Günstigerprüfung berücksichtigt sie.

**Konsequenzen:** Scan-Flow braucht Lohnausweis-Vorlage (eigener Dokumenttyp neben LStB). GG-Bereich wächst von Tracker+Kurs zu vollem Teilprodukt: Vorsorge-Karte, Quellensteuer-Zeile mit Herkunft, Zulagen-Verrechnung im Kinder-Bereich.

# ADR-030 — Einkunftsarten frei kombinierbar (GG + Kapital + Vermietung + Kinder)

**Status:** Akzeptiert (Grilling Abdeckung R1) · 2026-07-22

GG ist eine Einkunftsart wie jede andere (ADR-010) und kollidiert mit nichts. Konsequenz: die Kombination wird explizit getestet und die UI-Pfade (Cockpit-Branches, Übertragen-Anlagen, Prüf-Report) müssen beliebige Teilmengen sauber darstellen — keine Annahme „GG-Nutzer haben sonst nichts".

# ADR-031 — Angestellten-Pfad: fünf Lebenslagen + Sonderausgaben-Vollausbau

**Status:** Akzeptiert (Grilling Abdeckung R1) · 2026-07-22

**Neu in 1.0 (Werbungskosten/Lebenslagen):** doppelte Haushaltsführung, Umzugskosten (Pauschale), Abfindung (Fünftelregelung — App rechnet, erklärt den Effekt), Lohnersatz mit Progressionsvorbehalt (Kurzarbeit/Elterngeld/Krankengeld — Effekt ehrlich zeigen: „steuerfrei, erhöht aber deinen Satz"), Nebenjob/Minijob/Midijob (Minijob: nur erklären, nicht erfassen — steuerfrei).

**Neu in 1.0 (Sonderausgaben/agB):** Krankheitskosten mit zumutbarer Belastung (Rechner zeigt die Schwelle ehrlich), Behinderten-/Pflege-Pauschbetrag, Unterhalt an Angehörige, Riester/Rürup (Anlage AV), Kirchensteuer + Spenden-Vortrag.

**Konsequenzen:** Interview wächst NICHT um 10 Fragen — die Lebenslagen kommen als on-demand „+ Lebenslage"-Katalog (ADR-016-Prinzip), Beleg-Erkennung und KI-Vorschläge triggern sie. Zumutbare-Belastung-Rechner ist Pflicht (sonst falsche Hoffnung bei kleinen Krankheitskosten).

# ADR-032 — Kapitalerträge: + ausländische Broker; Krypto → 2.0

**Status:** Akzeptiert (Grilling Abdeckung R1, delegiert) · 2026-07-22

Deutsche Depots (Abgeltungsteuer, Sparerpauschbetrag, Günstigerprüfung) plus **ausländische Broker** (keine Steuer abgeführt → KAP-Pflicht) — das ist genau die junge Zielgruppe (IBKR, Revolut). **Krypto bleibt 2.0** (privates Veräußerungsgeschäft, Haltefristen, eigene Beschaffungslogik) — ehrliches Gate mit Vormerken.

# ADR-033 — Vermietung: mehrere Objekte, weiterhin kein Verkauf/möbliert

**Status:** Akzeptiert (Grilling Abdeckung R1, delegiert) · 2026-07-22

Gate wird gelockert: **mehrere ganzjährig vermietete Objekte** gehen (je Objekt eine Anlage V, lineare AfA), **Verkauf und möbliert-auf-Zeit bleiben gegated**. Grenze bleibt ehrlich benannt.

# ADR-034 — Rentner kommen in 1.0 (Anlage R)

**Status:** Akzeptiert (Grilling Abdeckung R1) · 2026-07-22

„Für alte und junge Leute" wird ernst genommen: gesetzliche Rente + Betriebsrente (Anlage R), Besteuerungsanteil nach Rentenbeginn-Jahr automatisch, kombinierbar mit allen anderen Einkunftsarten (Rentner mit Vermietung/Kapital ist der Normalfall). Interview bekommt „Rente" als Antwort auf die Geld-Herkunft-Frage.

**Konsequenzen:** Neue Einkunftsart im Cockpit/Übertragen; Rentenbezugsmitteilung als Dokumenttyp; Alters-Zielgruppe verstärkt den Fall für größere Schrift (2.0-Punkt aus ADR-025 rückt näher).
