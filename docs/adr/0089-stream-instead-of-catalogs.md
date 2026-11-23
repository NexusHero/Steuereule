# ADR-0089 — Der Strom: eine Auswahl statt Ja/Nein-Seiten, eine Seite je Thema

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/interview/{interview,strom}.ts`, `apps/api/src/interview/interview.service.ts`, `apps/mobile-web/src/screens/strom/`, `apps/mobile-web/src/screens/cockpit/CockpitScreen.tsx`, `apps/mobile-web/src/navigation/{routes,linking,CockpitStack}.ts(x)`, `e2e/scenarios/`
- **Baut auf:** ADR-0031 (Katalog-Engine), ADR-0045 (Value-first), ADR-0066 (Feldkatalog der Eule), ADR-0088 (Person B)

## Kontext

Die Engine fragte jede Frage auf einer eigenen Seite. Gemessen mit dem Effizienz-Messer:

| Fall | Seiten | davon „Nein“ |
| --- | --- | --- |
| Lena (ledig, angestellt) | 17 | 13 |
| Richter (alleinerziehend) | 21 | 13 |
| Sommer (Grenzgänger-Familie, ohne B) | 27 | 10 |

Dazu kamen die Wege zurück: Nach jedem Thema ging es ins Cockpit und von dort zum nächsten Thema.

Ziel ist keine „Elster 2.0“, sondern ein Weg, der den Nutzer deutlich schneller ans Ziel bringt. Der Chat mit der Eule bleibt dabei mit allen Fähigkeiten erhalten.

## Entscheidung

Der Strom ist der Standardweg durch die Erklärung. „Weiter“ im Cockpit führt immer an seine nächste offene Stelle. Die Schritte:

1. **Basis:** eine Seite mit dem, was verzweigt: Arbeit, Schweiz, Kinder, Familienstand und bei Verheirateten, was der Partner macht. Hinweise wie Gewerbe oder anderes Ausland stehen auf der Seite selbst.
2. **Belege zuerst:** die Masken des Wegs, also LStB, Schweizer Lohnausweis oder Rente, dann Arbeitsweg und Kinder. Sie laufen als eigene Schritte, nichts wird nachgebaut. Ihr „Weiter“ führt zum nächsten Schritt statt ins Cockpit.
   Ein Grenzgänger mit Jobwechsel im Jahr bekommt nach dem Arbeitsweg zusätzlich die deutsche LStB. Erkennbar
   ist der Wechsel am Ende des ersten Wegs bzw. am zweiten Weg (ADR-0079) oder an einer schon eingetragenen
   LStB. Gefunden im Echtfall 2024: Dort fehlte die LStB im Strom.
3. **Auswahl** „Was trifft {Jahr} auf dich zu?“: alle Themen auf einer Seite, gruppiert nach Arbeit, Wohnen, Vorsorge, Gesundheit und Sonstiges. Seltene Themen (Abfindung, Kapital/Vermietung, Vorauszahlungen) stehen hinter „Mehr anzeigen“. Themen mit einer Art (Nebenjob, Einkünfte) fragen die Art direkt beim Antippen. Nicht Gewähltes wird mit „Nein“ beantwortet und nie wieder gefragt.
4. **Eine Seite je gewähltem Thema** mit allen Beträgen des Themas, zum Beispiel KV, PV und Wahlleistungen zusammen. Darunter steht, in welches Formular der Betrag geht. „Später“ markiert Beträge, die warten dürfen; das Thema bleibt dann offen. Danach kommt Alleinerziehend, wo es zutrifft.
5. **Zusammenfassung:** die Erstattung, die übernommenen Posten mit ihrer gemessenen Wirkung in Euro, die offenen Posten zum Antippen, dann „Abgabe vorbereiten“.

Jeder Schritt hat eine eigene Adresse: `/app/steuerjahr/:jahr/strom/:schritt`. Ist die Basis noch offen,
führt jeder spätere Schritt zur Basisseite.

Dazu gehören folgende Regeln:

- **Kein neues Feld.** Die Auswahl ist nur eine Ansicht auf die bestehenden Ja/Nein-Antworten der Kataloge. Eule, Ausdruck, Schätzung und Feldkatalog (ADR-0066) lesen und schreiben dieselben Felder wie vorher. Was die Eule im Chat einträgt, ist im Strom schon gewählt und ausgefüllt.
- **Reihenfolgefreie Kataloge.** Lebenslagen, Sonderausgaben, Segment 2 und Alleinerziehend haben `orderFree`: Ihre Fragen sind einzeln erreichbar, ein Folgebetrag weiterhin nur nach seinem „Ja“. Die Basis bleibt geordnet.
- **Fortbildung** ist als einzelne Frage aus Segment 2 zugelassen (`fortbildung`, `fortbildung-kosten`). Der Rest von Segment 2 bleibt gesperrt.
- **Abwählen** eines Themas mit Betrag fragt erst nach. Der Betrag bleibt gespeichert, falls das Thema wieder gewählt wird.
- **Später ändern:** Ein offener Posten in der Zusammenfassung öffnet nur seine eine Seite.
- **Kataloge bleiben** als „Alles ansehen“ über die Kacheln des Cockpits erreichbar, unverändert.
- **Wirkung:** Gemessen wird nur, was eine Seite an der Schätzung verändert hat, nach dem Speichern. Eine Live-Schätzung je Tastendruck gibt es nicht; vor dem Speichern nennt die Seite deshalb nur die Formularzeile.

## Folgen

- **Kürzerer Weg:** Lena kommt mit Basis, LStB, Arbeitsweg, Auswahl, Spenden und Zusammenfassung aus, also 5 Schritte plus Zusammenfassung statt 17 Fragenseiten. Der Effizienz-Messer berichtet die Zahlen und bricht nichts ab.
- **E2E:** Die Szenarien gehen den Strom. Wo ein Szenario einen Katalog selbst prüft, nimmt es die Kachel.
- **Offen, eigene PRs:**
  - Person B im Strom: „Was trifft auf ‹Name› zu?“; bis dahin bleibt „Für wen?“ in den Katalogen.
  - Belege vorbelegen die Auswahl.
  - Das Vorjahr belegt die Auswahl vor („Hat sich etwas geändert?“).

## Nachtrag 18.11.2026: Person B und deutsche Anstellung im Strom

Der manuelle Echtdatentest (Grenzgänger-Ehepaar, 2024 mit Wechsel von Deutschland in die Schweiz) zeigte zwei Lücken: Der Strom fragte nach „Arbeitet dein Partner auch in der Schweiz?“ nie nach den Unterlagen des Partners, und die deutsche Lohnsteuerbescheinigung kam nur über einen Jobwechsel im Arbeitsweg in den Strom. Nach dem Strom stand deshalb eine Erstattung von 27.688 € statt einer Nachzahlung von 3.797,90 €.

- **Deutsche Anstellung in der Basis:** Nach „Ja, in die Schweiz“ fragt die Basis „Warst du im Jahr auch in Deutschland angestellt?“ (`de-job`), für einen Grenzgänger-Partner ebenso (`partner-de-job`). Rentner fragt sie nicht (neue Bedingung `askedWhen` an der Frage). „Auch in Deutschland“ setzt dasselbe Signal wie der Jobwechsel (ADR-0079): LStB-Schritt im Strom, LStB-Kachel offen und Pflicht.
- **Partner-Schritt:** Bei Zusammenveranlagung ohne eigenes Konto von B folgt auf die Basis „Wer ist dein Partner?“ mit Vorname und Geburtsdatum. Der Rest von B bleibt in „Angaben für die Erklärung“.
- **Masken von B** kommen nach den eigenen und vor den Kindern, je nach Basis: Grenzgänger Lohnausweis und Arbeitsweg (plus LStB bei deutscher Anstellung), Angestellter in Deutschland LStB und Arbeitsweg, Rentner die Rente. Adressen: `partner-schweiz`, `partner-arbeitsweg`, `partner-lohnsteuerbescheinigung`, `partner-rente`. Die Masken nennen B beim Namen.
- **Fortschritt** zählt diese Schritte mit. Bestehende Konten sehen sie ehrlich als offen; schon Erfasstes zählt sofort als erledigt. Damit ist der offene Punkt „Person B im Strom“ oben für Masken erledigt; „Was trifft auf ‹Name› zu?“ für die Themen bleibt offen.
