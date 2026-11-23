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
8. **Umsatzsteuer:** Kleinunternehmer-Prüfung (§ 19 UStG) und Regelbesteuerung mit Umsatzsteuer-Jahreserklärung. ~~Voranmeldungen bleiben außerhalb der App; die gezahlten Vorauszahlungen trägt der Nutzer als Summe ein.~~ Geändert durch §22: Die App rechnet die Voranmeldungen und die Zusammenfassende Meldung; die Summe der Vorauszahlungen kommt aus ihnen, wenn der Nutzer keine eigene einträgt.
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
17. **E-Bilanz wartet auf ELSTER:** Bilanzierer können buchen und abschließen; die Abgabe der E-Bilanz kommt mit der ELSTER-Übermittlung. Bis dahin sagt die App das offen. Ergänzt durch §22: Die Übermittlung ist bis zur Kante gebaut und wird mit ERiC und dem Zertifikat des Betreibers eingeschaltet.

### Eule

18. **Die Eule kontiert als Entwurf:** Zu Belegen und Kontoumsätzen schlägt sie Konto, Steuersatz und Abschreibung vor; gebucht wird erst, wenn der Nutzer übernimmt (Zero-Write, ADR-0066). Sie erklärt Positionen.

### Prüfung, Freischaltung, Preis

19. **Prüfung:** Golden-Testfälle aus amtlichen Beispielen und durchgerechneten Fällen, je Steuerjahr. Keine externe Prüfung.
20. **Schalter:** Das Gewerbe-Gate bleibt für Nutzer an, bis der Product Owner die Ergebnisse gesichtet und den Schalter umgelegt hat. Der Code ist ab dem Merge da.
    - **Umgelegt am 20.11.2026:** Der Product Owner hat entschieden, dass der Bereich Selbstständige standardmäßig an ist. `SELBSTSTAENDIGE_ENABLED` ungesetzt heißt jetzt an; nur ein ausdrückliches Aus (`false`, `0`, `no`, `nein`, `off`) bringt das Gewerbe-Gate von REQ-015 zurück. Die Testsuiten und die E2E-Stacks, die den Pfad mit Gate prüfen (Szenario 09), setzen das Aus selbst; Szenario 09b braucht einen Stack mit an.
21. **Preis:** eine eigene, höhere Stufe je Steuerjahr für Jahre mit Selbstständigkeit, über eine zweite Stripe-Preis-ID. Den Betrag legt der Product Owner in Stripe fest; Buchhaltung, Umsatz- und Gewerbesteuer sind darin enthalten.

### Nachtrag vom 21.11.2026: die Lücken nach der ersten Fassung

22. Eine Durchsicht des Stands nach dem Merge fand falsche Rechnungen, Gruppen, die nicht durchkamen, und Einschränkungen. Der Product Owner hat entschieden, alle in einem Pull Request zu beheben. Bei externen Abhängigkeiten baut die App bis zur Kante. Die Voranmeldungen rechnet sie und zeigt sie als Ausfüllhilfe. Beim Lohn bucht sie die Werte des Lohnprogramms und rechnet Minijobs selbst. Rechtswerte stehen mit Quellen in `docs/research/self-employed-extension.md`.
    - **Vorsorge ohne Lohn:** KV, PV und Krankengeld zählen so, wie sie eingetragen sind. Die 4-%-Kürzung gilt einmal und nur auf die KV. Neu sind die eigene Altersvorsorge (gesetzliche RV, Versorgungswerk, Rürup) und weitere Versicherungen; für KSK-Mitglieder gilt die Grenze von 1.900 €.
    - **Gruppen, die jetzt durchkommen:** Rentner mit Nebengewerbe (Frage `rente-selbststaendig`). Selbstständige mit Midijob oder Nebenjob als einzigem Lohn. Mehrere Betriebe je Person (Spalte `betrieb`). Die Umsatzsteuer rechnet über alle Betriebe einer Person, weil es einen Unternehmer mit einem Unternehmen gibt; Anlage EÜR, S/G und GewSt gibt es je Betrieb.
    - **Kleinunternehmer:** Im Gründungsjahr gelten 25.000 € (ab 2025, tatsächlicher Umsatz) bzw. 22.000 € (bis 2024, hochgerechnet). Die App gleicht den Haken im Profil mit dem Buch ab. § 20 UStG misst am Vorjahr.
    - **EÜR:** Nicht abziehbare Buchungen mindern den Gewinn nicht mehr. Die Zehn-Tage-Regel (§ 11 EStG) gilt über die Buchgrenze.
    - **Neu:** Firmenwagen (1-%-Regel mit E/Hybrid-Bruchteilen, Fahrtenbuch, Kostendeckelung, Wege Wohnung–Betrieb, USt-Wertabgabe). Voranmeldungen, ig. Erwerb und Zusammenfassende Meldung (USt-IdNr. an der Buchung). E-Rechnungen (XRechnung UBL/CII, ZUGFeRD; XML als Original gespeichert, nur als Download in einer Sandbox ausgeliefert). § 16/§ 34 und § 34a. Lohn mit Minijob-Abgaben und Lohnsteuer-Anmeldung, ohne SV-Meldungen.
    - **E-Bilanz:** Die Elementnamen folgen der amtlichen Taxonomie 6.9; der Anlagenspiegel ist dimensional aufgebaut. Übermittelt wird über eine ERiC-Sidecar des Betreibers (`ELSTER_TRANSMISSION_ENABLED`, `ELSTER_ERIC_CLI`, `ELSTER_CERT_PATH`, `ELSTER_CERT_PIN`, `ELSTER_HERSTELLER_ID`). Die XBRL-Datei geht über stdin, die PIN nur in die Umgebung der Sidecar. ERiC-Lizenz und Zertifikat sind Sache des Betreibers.
    - **Anlage S/G:** Die Zeilen kommen aus einer geprüften Datei, die der Betreiber aus Mein ELSTER abliest (`apps/api/assets/elster-lines/`). Ohne Datei zeigt die App Beträge ohne Zeilen.
    - **Nachgeprüft am 20.11.2026** (Recherche §12): Kennzahlen der Voranmeldung 2022–2025 (Kz 87 ab 2023, Kz 70 ab 2025), Minijob-Umlagen, Höchstbetrag 2026, § 19-Hochrechnung bis 2024, § 34a-Gewerbesteuer erst ab 2024, § 47 UStDV.
    - **Bleibt offen und wird offen gesagt:** Die Vordrucke 2026 (Hauptvordruck, Anlage Sonstiges, GewSt) erscheinen erst noch. Kz 70 (Datum des Wechsels von § 19) führt die App nicht. Schnellerfassungs-Summen zu 19 %/7 % tragen keinen Steuersatz. Eulen-Entwürfe außerhalb von Belegen buchen in den ersten Betrieb. Offen aus dem Review: Hat das Vorjahr in der App keine eigenen Voranmeldungen, misst die Sondervorauszahlung an seiner Jahressteuer statt an der Summe der Vorauszahlungen. Kirchensteuer außer ev/rk erscheint nur im Gesamtbetrag (Kz 83). Unter einer gemeinsamen Veranlagung bekommt nur ein Gewinn je Jahr den ermäßigten Satz. Die E-Bilanz-Berichtigung (zweites Senden) macht die App nicht.

## Folgen

- REQ-015 ändert sich: Das Gate bleibt serverseitig, ist aber abschaltbar; bei „Beides“ führt der Weg nach dem Umlegen in den Angestellten- und den selbstständigen Teil.
- Die Persona Maximiliane Koch bekommt einen durchgehenden E2E-Weg statt des Gates.
- Neue Fakten sind feldverschlüsselt wie ihre Nachbarn (ADR-0008); Buchungen und Protokoll sind nur anhängbar, nie änderbar.
- Die Abgabe für Selbstständige hängt vorerst am Nutzer, der in Mein ELSTER einträgt; die E-Bilanz am ELSTER-Zertifikat.
- Fünf Jahresfassungen je Erklärung heißen fünf Sätze Formularzeilen und Testfälle; eine fehlende Fassung (etwa ein noch nicht veröffentlichtes Formular) sagt die App offen, statt zu raten.
