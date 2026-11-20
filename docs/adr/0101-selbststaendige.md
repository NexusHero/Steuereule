# ADR-0101 — Selbstständige: EÜR, Buchhaltung, Bilanz, Umsatz- und Gewerbesteuer

- **Status:** Accepted
- **Date:** 2026-11-19
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** neuer Kern unter `packages/core/src/domains/business/*` (Steuerregeln) und `packages/core/src/domains/ledger/*` (Buchhaltung), `apps/api/src/business/*`, `apps/api/prisma/schema.prisma`, `apps/mobile-web/src/screens/business/*`, Eulen-Werkzeuge, Freischaltung
- **Baut auf:** ADR-0050 (Papierweg; hier geändert für Selbstständige), REQ-015 (Gewerbe-Gate; hier hinter einen Schalter gestellt), ADR-0097 (eine Beleg-Pipeline), ADR-0066 (Eule füllt Entwürfe, Zero-Write), ADR-0008 (Feldverschlüsselung), ADR-0007 (nutzergebunden)

## Kontext

Bis hier fing das Interview Selbstständige mit dem Gewerbe-Gate ab (REQ-015): „Selbstständige brauchen EÜR, Anlage G/S und Umsatzsteuer — das kann SteuerEule in Version 1 nicht.“ Die Persona Maximiliane Koch (`docs/use-cases.md`) endete dort. Der Product Owner hat den Umfang in einer Grilling-Runde mit 27 Entscheidungen festgelegt.

Eine Vorgabe des Gesetzes bestimmt den Abgabeweg: Wer Gewinneinkünfte hat, muss die Einkommensteuererklärung grundsätzlich elektronisch abgeben (§ 25 Abs. 4 EStG), die EÜR ebenso (§ 60 Abs. 4 EStDV), die Bilanz als E-Bilanz (§ 5b EStG). Ausnahmen gibt es für Härtefälle (§ 150 Abs. 8 AO) und für Gewinne bis 410 € neben einem Lohn. Die App gibt bisher auf Papier ab (ADR-0050).

## Entscheidung

Alles in einem Pull Request, ohne Mock, in den Mustern der App.

### Umfang

1. **Alle Selbstständigen**, Freiberufler (Anlage S) und Gewerbe (Anlage G), haupt- und nebenberuflich.
2. **Freiberuf oder Gewerbe** schlägt die App aus Fragen zum Beruf vor (§ 18 EStG, Katalog- und ähnliche Berufe) und sagt warum; der Nutzer bestätigt. Im Zweifel zählt, was das Finanzamt bisher festgesetzt hat.
3. **Einzelunternehmer voll.** Anteile an einer Personengesellschaft nur als übernommener Betrag aus deren Feststellungsbescheid; die Feststellungserklärung der Gesellschaft macht die App nicht.
4. **Steuerjahre 2022 bis 2026**, alle Jahre, die die App anbietet. Formularzeilen, Grenzen und E-Bilanz-Taxonomie je Jahr.

### Gewinn und Erklärungen

5. **Gewinnermittlung:** EÜR (§ 4 Abs. 3 EStG) für alle, die dürfen; Bilanz (§ 4 Abs. 1, § 5 EStG) für alle, die bilanzieren müssen (§ 140, § 141 AO) oder wollen.
6. **Erfassung:** Summen je EÜR-Zeile als schneller Weg, oder einzelne Belege über die eine Beleg-Pipeline (ADR-0097). Beides landet im Buch (Punkt 10).
7. **Abschreibung:** geringwertige Wirtschaftsgüter bis 800 € sofort, lineare AfA nach amtlicher Tabelle, Sammelposten (250 bis 1.000 €), degressive AfA wo zulässig, Investitionsabzugsbetrag und Sonder-AfA (§ 7g EStG).
8. **Umsatzsteuer:** Kleinunternehmer-Prüfung (§ 19 UStG) und Regelbesteuerung mit Umsatzsteuer-Jahreserklärung. Voranmeldungen bleiben außerhalb der App; die gezahlten Vorauszahlungen trägt der Nutzer als Summe ein.
9. **Gewerbesteuer:** Gewerbesteuer-Erklärung, Freibetrag 24.500 €, Hebesatz aus der amtlichen Gemeindetabelle (der Nutzer kann ihn korrigieren), Anrechnung auf die Einkommensteuer (§ 35 EStG).
10. **Verluste:** Verlustvortrag aus dem letzten Feststellungsbescheid übernehmen und verrechnen, einen neuen Verlust ausweisen, den Rücktrag in die zwei Vorjahre rechnen und den Verzicht darauf anbieten (§ 10d EStG; seit 2022 nur ganz oder gar nicht).

### Buchhaltung

11. **Ein Buch für alle Selbstständigen.** EÜR, Bilanz, Umsatz- und Gewerbesteuer werden daraus abgeleitet; die Summen je Zeile aus Punkt 6 sind Buchungen wie andere.
12. **Kontenrahmen SKR03 und SKR04** zur Wahl.
13. **GoBD:** Festschreibung, unveränderbares Protokoll jeder Buchung, Aufbewahrung nach § 147 AO (Bücher und Verfahrensdokumentation zehn Jahre, Buchungsbelege seit 2025 acht Jahre, Art. 97 § 19a EGAO), Datenexport für die Betriebsprüfung, Verfahrensdokumentation. Eine Bescheinigung durch Dritte gibt es nicht; die App nennt sich deshalb nirgends „GoBD-zertifiziert“.
14. **Bank:** Kontoauszüge als Datei (CSV, CAMT.053); die App schlägt Buchungen vor. Keine Bankzugangsdaten in der App.
15. **Bilanz in der App:** doppelte Buchführung, Jahresabschluss mit Bilanz und GuV, E-Bilanz-Datensatz.

### Abgabe

16. **Ausfüllhilfe für Mein ELSTER:** Die App rechnet alles und zeigt je Formularzeile, was der Nutzer in Mein ELSTER einträgt, für Hauptvordruck, Anlage S/G, EÜR, Umsatz- und Gewerbesteuer-Erklärung. Das ändert ADR-0050 für Selbstständige: kein Papier, kein Ausdruck als Abgabe. Die übrige Einkommensteuererklärung (Hauptvordruck, Anlage N, N-Gre, R, KAP, V, Kind, Vorsorgeaufwand, Sonderausgaben, AV, haushaltsnahe Aufwendungen, außergewöhnliche Belastungen) zeigt sie mit denselben Werten, die der Formular-Ausdruck drucken würde, je Exemplar (Person, Kind, Objekt), Zeile und Kennzahl aus den vermessenen Vordrucken des Jahres (`felder-<jahr>.zeilen.json`, auch für 2022 und 2023, die nicht gedruckt werden); für ein Jahr ohne veröffentlichte Vordrucke nennt sie die Werte ohne Zeilen und sagt das.
17. **E-Bilanz wartet auf ELSTER:** Bilanzierer können buchen und abschließen; die Abgabe der E-Bilanz kommt mit der ELSTER-Übermittlung. Bis dahin sagt die App das offen.

### Eule

18. **Die Eule kontiert als Entwurf:** Zu Belegen und Kontoumsätzen schlägt sie Konto, Steuersatz und Abschreibung vor; gebucht wird erst, wenn der Nutzer übernimmt (Zero-Write, ADR-0066). Sie erklärt Positionen.

### Prüfung, Freischaltung, Preis

19. **Prüfung:** Golden-Testfälle aus amtlichen Beispielen und durchgerechneten Fällen, je Steuerjahr. Keine externe Prüfung.
20. **Schalter:** Das Gewerbe-Gate bleibt für Nutzer an, bis der Product Owner die Ergebnisse gesichtet und den Schalter umgelegt hat. Der Code ist ab dem Merge da.
21. **Preis:** eine eigene, höhere Stufe je Steuerjahr für Jahre mit Selbstständigkeit, über eine zweite Stripe-Preis-ID. Den Betrag legt der Product Owner in Stripe fest; Buchhaltung, Umsatz- und Gewerbesteuer sind darin enthalten.

## Folgen

- REQ-015 ändert sich: Das Gate bleibt serverseitig, ist aber abschaltbar; bei „Beides“ führt der Weg nach dem Umlegen in den Angestellten- und den selbstständigen Teil.
- Die Persona Maximiliane Koch bekommt einen durchgehenden E2E-Weg statt des Gates.
- Neue Fakten sind feldverschlüsselt wie ihre Nachbarn (ADR-0008); Buchungen und Protokoll sind nur anhängbar, nie änderbar.
- Die Abgabe für Selbstständige hängt vorerst am Nutzer, der in Mein ELSTER einträgt; die E-Bilanz am ELSTER-Zertifikat.
- Fünf Jahresfassungen je Erklärung heißen fünf Sätze Formularzeilen und Testfälle; eine fehlende Fassung (etwa ein noch nicht veröffentlichtes Formular) sagt die App offen, statt zu raten.
