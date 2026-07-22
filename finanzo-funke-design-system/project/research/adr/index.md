# ADR-Index — SteuerEule

Architecture/Design Decision Records. Format: Kontext → Entscheidung → Konsequenzen. Status: Akzeptiert / Vorgeschlagen / Verworfen.

| # | Titel | Status |
|---|---|---|
| 001 | Eingereichte Fassungen sind unveränderlich | Akzeptiert |
| 002 | Violett ausschließlich für KI-Output | Akzeptiert |
| 003 | Tech-Stack: React Native + React Web, kein Flutter | Akzeptiert |
| 004 | Formular-Mapping (amtliche Vorlagen) lebt im Backend, nicht im Design | Akzeptiert |
| 005 | ELSTER-Abgabe erst ab Zertifikat — UI verspricht es nicht vorher | Akzeptiert |
| 006 | Steuerjahr gehört der Person, Kopplung bei Zusammenveranlagung | Akzeptiert |
| 007 | Beleg-Posteingang: Upload ohne Jahresbindung, Zuordnung als Vorschlag | Akzeptiert |
| 008 | Posten-Konflikt ist sichtbarer Zustand, kein stilles Überschreiben | Akzeptiert |
| 009 | Korrektur vor Bescheid, Einspruch nach Bescheid — zwei Flows | Akzeptiert |
| 010 | Einkunftsarten statt Profiltyp | Akzeptiert |
| 011 | Löschschutz für eingereichte Fassungen | Akzeptiert |
| — | Bescheid-Abgleich: 1.0 nur PDF + manueller Betrag, Posten-Abgleich in 2.0 | Akzeptiert (in 2.0-Readme) |
| 012 | Wechselkurs: amtlich Standard, tatsächlich belegpflichtige Option | Akzeptiert |
| 013 | Grenzgänger 1.0: nur Schweiz | Akzeptiert |
| 014 | KI schlägt vor, legt nie selbst an | Akzeptiert |
| 015 | Erstattungs-Ticker zeigt Spannen, keine Punktwerte | Akzeptiert |
| 016 | Minimal-Gate: drei Fragen, Rest on-demand | Akzeptiert |
| 017 | 1.0 kostenlos (Beta), Preis kommt mit ELSTER-Zertifikat | Akzeptiert |
| 018 | Zustandsmaschine: Rückfrage + Extern erledigt als Zustände | Akzeptiert |
| 019 | Reine Online-App (Kamera-Puffer als einzige Offline-Logik) | Akzeptiert |
| 020 | Daten in der EU-Cloud, Multi-Device inklusive | Akzeptiert |
| 021 | Jahresübernahme: alles kopieren, als „unbestätigt" markiert | Akzeptiert |
| 022 | Rückwirkende Jahre (bis 4) als beworbener Einstiegspunkt | Akzeptiert |
| 023 | Fehlerton: warm beim ersten Mal, nüchtern wenn ernst | Akzeptiert |
| 024 | Push nur ereignisbasiert + eine Saison-Erinnerung | Akzeptiert |
| 025 | Barrierefreiheit: Stand eingefroren, keine Änderungen in 1.0 | Akzeptiert |
| 026 | Export: PDF-Bericht pro Steuerjahr, jederzeit | Akzeptiert |
| 027 | Identität erst bei Abgabe; Multi-Device ohne Verwaltung | Akzeptiert |
| 028 | Gewerbe-Gate bleibt in 1.0 | Bestätigt |
| 029 | Grenzgänger CH: volle Tiefe (Lohnausweis-Scan, Quellensteuer, PK, 3a, KK, Zulagen) | Akzeptiert |
| 030 | Einkunftsarten frei kombinierbar — Kombination wird getestet | Akzeptiert |
| 031 | Angestellte: 5 Lebenslagen + Sonderausgaben-Vollausbau (on-demand-Katalog) | Akzeptiert |
| 032 | Kapital: + ausländische Broker; Krypto → 2.0 | Akzeptiert |
| 033 | Vermietung: mehrere Objekte; Verkauf/möbliert bleibt Gate | Akzeptiert |
| 034 | Rentner in 1.0 (Anlage R) | Akzeptiert |
| 035 | UX der Abdeckung: Katalog+Erkennung, Rente im Interview, Progression im Ticker, agB-Live-Schwelle | Akzeptiert |
| 036 | Details: Scan-Fallback geführte Maske, CHF führt, 5 Rentenarten, 10er-Katalog, Abfindungs-Rechner | Akzeptiert |
| 037 | Eulen-Modus als opt-in Stufe über dem Berater (ein Wesen) | Akzeptiert |
| 038 | Auslöser + Dosierung: 4 Auslöser, proaktiv nur Gesetzes-Funde ≥50 €, Rest auf Abruf | Akzeptiert |
| 039 | Quellen menschlich übersetzt + Link, Rechtsstand-Zeile | Akzeptiert |
| 040 | Unsicherheit: sicherer Weg empfohlen; empfehlen nur bei eindeutiger Lage (StBerG) | Akzeptiert |
| 041 | Fehlerfall: „Stimmt nicht"-Knopf; Verworfenes kehrt nur bei neuen Fakten wieder | Akzeptiert |
| 042 | Archiv-Wache: abgegebene Jahre + Einspruchsfrist-Karte | Akzeptiert |
| 036 | Details: CH-Scan-Maske, CHF führt, 5 Rentenarten, 10er-Katalog, Abfindungs-Rechner | Akzeptiert |

_Neue ADRs entstehen aus der Grilling-Session als `research/adr/NNN-titel.md`._
