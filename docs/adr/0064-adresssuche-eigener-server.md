# ADR-0064 — Adresssuche über den eigenen Server (Abweichung von #451 Entscheidung 7 und 8)

- **Status:** Accepted
- **Date:** 2026-11-11
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/address/`, `apps/api/scripts/fetch-street-data.ts`, `apps/mobile-web/src/screens/shared/AddressSearch.tsx`; Stammdaten, Vermietung (Objektadresse), Kinder (Adresse des anderen Elternteils)
- **Weicht ab von:** Ticket #451 Entscheidung 7 („kein Request nach außen" für Adressen) und Entscheidung 8 (Adressdaten nur mit der App ausgeliefert)

## Kontext

#451 hat die Adresseingabe auf zwei Hilfen begrenzt: Autofill-Hinweise für den Browser und eine
PLZ-Tabelle, die mit der App ausgeliefert wird. Beides verlässt das Gerät nicht. Im Test durch den
Product Owner (11.11.2026) hat das nicht gereicht: Browser-Autofill greift nur, wenn im Browser
schon eine Adresse gespeichert ist, und die Straße tippt man weiter komplett von Hand. Erwartet
wird eine Suche wie in einer Karten-App: ein paar Buchstaben tippen, Adresse auswählen.

Eine Straßenliste für ganz Deutschland hat rund 1,19 Mio. Einträge (55 MB Quelle). Das ist zu groß,
um es wie die PLZ-Tabelle (~240 KB) in die App zu packen.

## Entscheidung

**Die Straßensuche läuft auf unserem eigenen Server. Kein Dritter sieht die Eingabe.**

1. **Daten:** dieselbe OpenStreetMap-Straßenliste des OpenPLZ-API-Projekts (ODbL 1.0), aus der
   schon die PLZ-Tabelle gebaut wird, auf denselben Commit gepinnt.
   `pnpm --filter @steuereule/api run streets:fetch` lädt sie, prüft die SHA-256-Prüfsumme und legt
   ein Manifest daneben (wie die Geo-IP-Datenbank, ADR-0024). Die Datei wird nicht eingecheckt.
2. **Suche im Speicher:** Beim Start liest die API die Datei aus `STREET_DATA_PATH` in einen
   sortierten Index (gemessen: ~2 s Ladezeit, ~45 MB Heap, Antwort unter 15 ms). Keine Datenbank,
   keine Migration.
3. **Endpunkt `POST /v1/adressen/suche`:** POST statt GET, damit die getippte Adresse nicht in URLs,
   Zugriffslogs oder Proxy-Caches landet. Die Anfrage wird nicht gespeichert. Begrenzt auf
   120 Anfragen pro Minute je Konto bzw. IP.
4. **Ohne Daten ehrlich:** Fehlt die Datei, antwortet der Endpunkt `available: false`. Die Maske
   sagt dann, dass die Suche nicht verfügbar ist, und die Felder werden wie bisher getippt.
5. **Ein Suchfeld über den Adressfeldern:** „Hauptstr. 12, Köln" → Auswahl füllt Straße,
   Hausnummer, PLZ und Ort. Die Einzelfelder, Browser-Autofill und der PLZ-Lookup aus #451 bleiben.

## Grenzen

- **Keine Hausnummern in den Daten.** Die Hausnummer wird aus der Eingabe übernommen, nicht geprüft.
- **Kein „Meinen Standort verwenden".** Die Daten haben keine Koordinaten; GPS bleibt nach #451
  Entscheidung 7 ausgeschlossen.
- **Schreibweise:** Die Quelle kürzt „Straße" durchgehend als „Str." ab. Der Index schreibt es
  wieder aus („Hauptstraße"). Eine Straße, die amtlich „…str." heißt, würde damit falsch
  ausgeschrieben; das Feld bleibt änderbar.
- **Nur Deutschland.**

## Folgen

- Der Betrieb muss die Datei bereitstellen und `STREET_DATA_PATH` setzen (lokal erledigt das
  `scripts/local.sh dev`). Der API-Prozess braucht rund 50 MB mehr Speicher und startet ~2 s später.
- Jährliche Aktualisierung zusammen mit der PLZ-Tabelle: Commit in beiden Skripten anheben,
  Prüfsumme anpassen.
- Die Datenschutzerklärung nennt die Verarbeitung der Sucheingabe auf dem eigenen Server
  (keine Speicherung, kein Dritter).

## Verworfen

- **Google Places o. Ä.:** beste Trefferqualität inklusive Hausnummern, aber jede Eingabe geht an
  einen Dritten.
- **Öffentliche OSM-Dienste (Photon, Nominatim):** ebenfalls ein Dritter, dazu Nutzungsgrenzen.
- **Straßenliste in der App:** 55 MB Quelle, auch verdichtet zweistellige MB im Bundle.
