# ADR-0091 — Die Eule füllt jedes Feld: persönliche Daten mit Einwilligung

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:**
  - `packages/core/src/interview/{field-catalog,record-handles,advisor-household,advisor,ki-port,advisor-basis-facts}.ts`
  - `apps/api/src/{owl-mode,confirmation,advisor,ki,ch-salary-certificate,account}/`
  - `apps/api/src/{lstb-scan,ch-certificate-scan,receipt}/` (Belege ohne Person B)
  - `apps/api/prisma/` (Tabelle `EulenPersonendatenEinwilligung`)
  - `apps/mobile-web/src/screens/{advisor,privacy,PrivacyScreen.tsx}`
- **Baut auf:** ADR-0052 §8 (Personenbezogene Daten maskiert), ADR-0054/0073 (Person B), ADR-0066 (Feldkatalog, ein Schreibweg), ADR-0090 (Strom-gegen-Chat-Vergleich)
- **Ändert:** ADR-0066 (Sperre `AI_FORBIDDEN_SCREENS`/`AI_FORBIDDEN_FIELDS` gilt nur noch ohne Einwilligung)

## Kontext

Der Vergleich Strom gegen Chat (sieben erfundene Haushalte, ADR-0090) zeigte: Die Eule kommt nur bei einfachen Ein-Personen-Fällen an dieselbe Erklärung wie der Strom. Der Hauptgrund ist eine Design-Sperre. Seit ADR-0066 schreibt die Eule keine Namen, keine Steuer-ID, keine Geburtsdaten, Adressen, IBAN oder Religion. Sie legt auch keine Kopplung (Person B) und keine Kinder an. Diese Werte gingen auch nie an das Sprachmodell. Die Folgen:

- Ohne Name und Steuer-ID gibt es keinen Ausdruck.
- Ohne Person B gibt es nichts für B.
- Ohne Vorname und Geburtsdatum gibt es kein Kind, damit kein Kindergeld, keine Kita und keine Kinderzulage.

Dazu kamen Fehler im Chat:

- **C2:** Belege der Partnerin landeten bei A.
- **C3:** Zwei Arbeitsweg-Entwürfe einer Antwort blockierten sich mit 409.
- **C4:** Wechselkurs, Kapital-Inhaber und Mietobjekte waren nicht schreibbar.
- **M1:** `interview.job` fehlte oft, damit auch die Schätzung.
- **U1:** Eine LStB mit `kind: auto` wurde nur generisch gelesen.

Der Product Owner hat entschieden: „Alles an die Eule“. Die Eule darf alle Felder schreiben, und diese Werte dürfen an das Modell gehen. Das gilt aber erst nach einer einmaligen, ausdrücklichen Einwilligung des Nutzers.

## Entscheidung

1. **Einwilligung, einmal, ausdrücklich, widerruflich.**
   - Die Karte erscheint im Chat unter der Antwort, sobald die Eule persönliche Daten bräuchte oder der Nutzer welche schreibt.
   - Sie nennt die Daten: Name, Steuer-ID, Geburtsdatum, Anschrift, IBAN, Familienstand, Partner und Kinder.
   - Sie nennt den Empfänger: Google Gemini als Auftragsverarbeiter.
   - Sie nennt die Religionszugehörigkeit ausdrücklich als besondere Kategorie (Art. 9 DSGVO); „Erlauben“ gilt auch dafür.
   - Die Knöpfe heißen „Erlauben“ und „Nicht erlauben“.
   - Gespeichert wird je Nutzer in der Tabelle `EulenPersonendatenEinwilligung`: `version`, `erteiltAm`, `widerrufenAm`. Es stehen keine personenbezogenen Daten darin, nur die Entscheidung. Deshalb ist die Tabelle nicht feldverschlüsselt, sondern bewusst in der Metadaten-Liste von `prisma-encrypted-fields.test.ts` geführt. Sie ist Teil des Datenexports und der Kontolöschung.
   - Erteilen und Widerrufen schreiben je eine Zeile ins Audit-Log: `eulen_personendaten_einwilligung` und `…_widerruf`.
   - Endpunkt: `GET`/`PUT /v1/eulen-modus/personendaten-einwilligung`. Das `PUT` ist für Assistenten-Zugänge gesperrt (`@ForbidAssistant`), denn nur der Nutzer selbst willigt ein.
   - Widerrufen wird unter Profil → Datenschutz („Eule und persönliche Daten“).
   - Eine Einwilligung zu einer älteren Textfassung (`OWL_PERSONAL_DATA_CONSENT_VERSION`) zählt nicht.
2. **Ohne Einwilligung bleibt alles wie heute.**
   - Die Maskierung ist an.
   - Die Sperre aus ADR-0066 gilt.
   - Die Eule erklärt, warum sie das Feld nicht vorbereitet, und die Antwort trägt `personalDataConsentRequest`, damit die Karte erscheint.
3. **Mit Einwilligung:**
   - Nachricht und Verlauf gehen unmaskiert an das Modell.
   - Die persönlichen Felder sind schreibbar: `profil`, `stammdaten`, `kopplung.filingType`, alle Felder von `kind`, die Anschrift des Mietobjekts.
   - Der Feldkatalog bietet sie im Prompt an.
   - Es bleibt beim einen Schreibweg aus ADR-0066: Entwurf, „✓ Jetzt übernehmen“, Prüfung des Werts gegen den Katalog, Compare-and-set.
   - Die Einwilligung wird bei jedem Vorschlag, jedem Übernehmen und jedem Rückgängig neu gelesen. Ein Widerruf wirkt deshalb sofort, auch für Entwürfe, die vorher entstanden sind.
   - Die Zusammenfassung älterer Gesprächsteile bleibt maskiert.
   - Der Text der Belege, mit dem das Modell Beträge liest, bleibt maskiert. Für die Beträge braucht es keine Namen, und die Zuordnung zu A, B oder einem Kind läuft ohne Modell.
4. **Nie:** `kopplung.invitationCode`. Der Einladungscode ist ein Schlüssel zu einer fremden Erklärung, kein Wert der Erklärung (`AI_NEVER_FIELDS`).
5. **Werte prüfen, auch die persönlichen.** Die Katalogprüfung gilt wie für jeden anderen Wert:
   - Die Steuer-ID hat 11 Ziffern, die Steuernummer bis zu 13 Ziffern. Leerzeichen und Schrägstriche lässt die Prüfung weg.
   - Die IBAN prüft sie mit Prüfziffer, wie die Stammdaten-Maske.
   - Religion und Familienstand nimmt sie nur als Schlüssel der Maske an.
   - Schreibt die Eule die Religion, speichert die App den Zeitpunkt der Einwilligung mit (`religionEinwilligungAm`), wie die Maske.
6. **Neue Einträge (C1/C4).**
   - `instance: „neu“` legt beim Übernehmen einen neuen Eintrag an, bei mehreren in einer Antwort „neu 1“, „neu 2“.
   - Ein Kind geht nur mit Einwilligung, und der Entwurf braucht Vorname und Geburtsdatum.
   - Ein Mietobjekt geht immer: mit Fläche, Einheiten, „AfA wie Vorjahr“, Umlagen, Schuldzinsen und Anteil A. Die Anschrift braucht die Einwilligung.
   - Der Eintrag entsteht einmal je Antwort und Platzhalter. Die anderen Entwürfe derselben Antwort zeigen danach auf ihn.
   - Rückgängig entfernt ein so angelegtes Kind wieder. Ein Mietobjekt bleibt leer stehen, wie die Maske es hält.
7. **Person B (C1).**
   - Die Eule legt Person B über `kopplung.filingType = zusammen` an. Das läuft über denselben `LinkService.set` wie die Kopplungs-Maske; der Platzhalter für B entsteht dort.
   - Danach (in der nächsten Antwort) schreibt sie Bs `profil` und `stammdaten` mit `person: "B"`. Beide Masken gehören jetzt zu `PERSON_B_SCREENS`.
   - Bs Belege lassen sich dann B zuordnen. Das gilt auch für den Familien-Krankenkassenauszug und die Kita-Bescheinigung eines Kindes (C5).
8. **Belege ohne Person B (C2), vorerst nur das Sicherheitsnetz.**
   - Nennt eine LStB, ein Lohnausweis, ein Pensionskassen- oder Prämienbrief einen Namen, der nicht zu A passt, wird der Beleg nie A zugeschrieben. Die App fragt „Wessen Beleg ist das?“ (`personUnclear`), und A's Entwürfe bleiben stehen.
   - Ohne erkennbaren Namen bleibt es bei A.
   - Wie Belege dauerhaft zugeordnet werden (B aus dem Beleg anlegen, umhängen, Haushaltsbelege teilen), entscheidet ein eigenes ADR.
9. **Entwürfe einer Antwort blockieren sich nicht (C3).**
   - Übernimmt der Nutzer einen Entwurf, der einen Datensatz erst anlegt (z. B. den Arbeitsweg mit 0 Krankheitstagen), übernehmen die übrigen offenen Entwürfe derselben Antwort den neuen Stand als Ausgangswert. Das gilt nur für Felder, die dieser Schritt verändert hat, ohne sie zu schreiben.
   - Eine Änderung durch jemand anderen bleibt ein Konflikt (409).
10. **Wechselkurs und Kapital-Inhaber (C4).**
    - `chLohnausweis.wechselkurs` (EUR je CHF) wird zusammen mit `wechselkursMonat` gespeichert. `JJJJ` steht für den Jahresdurchschnitt laut Anlage N-Gre, `JJJJ-MM` für den BMF-Monatskurs. Ohne Monat gilt der Jahresdurchschnitt des Steuerjahrs. Den tatsächlichen Kurs mit Beleg setzt nur die Maske.
    - `kapital.inhaber` ist A, B oder gemeinsam.
11. **Basisangaben (M1).**
    - Hat die Eule eine LStB, einen Lohnausweis oder eine Rente vor sich und ist `interview.job` (bzw. `ausland`) offen, hängt sie selbst einen Entwurf an: Angestellt bzw. „Ja, in die Schweiz“ bzw. Rente. Ohne diese Angabe gibt es keine Schätzung.
    - Der Prompt verlangt die Basisfragen, die Feiertagsregion beim Arbeitsweg und „keine Kirchensteuer“ als `kapital.kirchensteuer = 0`.
12. **`kind: auto` (U1).** Eine erkannte LStB geht an den LStB-Leser, wie mit `kind: lstb`.

## Folgen

- **Datenschutz:**
  - Mit Einwilligung verarbeitet ein Auftragsverarbeiter persönliche Daten, auch Art.-9-Daten.
  - Vorausgesetzt sind der AV-Vertrag mit Google und die Region, wie für den Chat schon heute.
  - Die Datenschutzerklärung muss den neuen Zweck nennen. Das ist Text außerhalb dieses ADR und offen.
- **Gespeicherte Nachrichten:**
  - Mit Einwilligung speichert die App den Text der Nutzer unmaskiert, feldverschlüsselt wie bisher (`AdvisorChatMessage.inhalt`).
  - Nach einem Widerruf maskiert die App den Verlauf wieder bei jedem Lesen für das Modell.
  - Bereits gespeicherter Text bleibt beim Nutzer, bis er das Gespräch löscht.
- **Tests:**
  - `advisor-field-coverage.integration.test.ts` geht jetzt alle 190 Felder durch, die die Eule mit Einwilligung kennt; alle sind schreibbar.
  - `advisor-personal-data*.test.ts`, `advisor-tool-round-personal.test.ts`, `advisor-field-access-personal.test.ts` und `personal-data-consent.*.test.ts` decken Einwilligung, Widerruf, neue Einträge, Person B und C3 ab.
- **Offen:**
  - Die dauerhafte Zuordnung von Belegen (Punkt 8).
  - Person B und ihre Angaben in einer einzigen Antwort, ohne Zwischenschritt.
  - Die Karte hat noch keinen E2E-Lauf, weil der Chat im E2E ein Modell bräuchte.

## Nachtrag: Die Eule fragt die Ausdruck-Lücken ab

- **Datum:** 2026-11-14
- **Anlass:** Der zweite Vergleich Strom gegen Chat (R2–R4) zeigte: Mit Einwilligung darf die Eule jedes Feld schreiben, die Schätzungen stimmen, aber kein Chat-Konto druckt. Die Eule fragt nie nach dem, was die Ausdruck-Prüfung noch vermisst (Weber: Depotart und Inhaber; Sommer: Bs Grenzgänger-Angaben, Verwandtschaft der Kinder, Bs Geburtsdatum; Brandt: Kinderzulage-Zahler, `kinshipB`; Richter: Familienkasse und die Kindergeld-Angaben). „Fehlt noch etwas?“ bekam nur die Codes in Worten.

**Entscheidung**

1. **Ein fester Plan statt Prompt-Wortlaut** (`packages/core/src/interview/advisor-printout-plan.ts`).
   - Aus den Codes der Ausdruck-Prüfung (`PrintoutService.check`, unverändert) leitet `printoutGapReads` die Felder ab, die jeden Code schließen können, je Person, Kind oder Objekt. Beispiele: `grenzgaengerPersonB` → Bs `interview.ch-wohnsitz`/`ch-nichtrueckkehrtage` und Bs Lohnausweis- und N-Gre-Felder; `kinder` → je Kind `taxId`, `kinship`, `kinshipB`, `familyBenefitsOffice`, `domesticResidenceAllYear`, der andere Elternteil, die Kindergeld-Angaben und der Kinderzulage-Zahler; `kapital` → `interview.kap-depot`, die Pflichtbeträge der Depotart, `kapital.inhaber`; Stammdaten-Codes → das Feld selbst; `personB` → Bs Name, Steuer-ID, Geburtsdatum, dazu Religion und Beruf.
   - Die App liest diese Felder über denselben Feldzugriff, über den die Entwürfe schreiben (`ConfirmationService.readRawValues`), Person B unter Bs Nutzer. `planPrintoutGaps` behält nur, was leer ist, mit den Bedingungen der Prüfung (Nichtrückkehrtage nur bei Wohnsitz Deutschland, Prämienanteile wie `premiumClarified`, der andere Elternteil nur ohne Zusammenveranlagung).
   - Jede Frage sagt, ob die Eule sie vorbereiten darf: Katalog und Einwilligung wie in Punkt 2 und 3, Person B nur, solange der Nutzer sie erfasst. Sonst nennt sie die Maske („Stammdaten“, „im eigenen Konto von Person B“).
   - Codes ohne Feld (eine Anlage, die die App nicht druckt, eine Bestätigung, ein zu langer Wert) bleiben Worte aus `describePrintoutGap`.
2. **Die Eule bekommt eine Checkliste.** Der Plan steht als `furtherFacts.printoutPlan` im Fall-Überblick (nur Feldnamen und neutrale Namen wie „Kind 1“) und als eigene Liste „Ausdruck-Checkliste“ im Fall-Prompt. Regel 10 (d) sagt, wann: wenn der Nutzer fragt, ob noch etwas fehlt, nach übernommenen Entwürfen, oder wenn sonst nichts offen ist. Höchstens vier Punkte je Antwort, nach Person oder Kind gruppiert, in der Sprache des Nutzers. Was der Nutzer schon gesagt hat, legt sie als Entwurf an, statt zu fragen.
3. **Die App fragt selbst, wenn das Modell es auslässt.** `printoutGapFollowUp` hängt an die Antwort (auch ohne Modell) „Damit der Ausdruck vollständig ist, fehlt noch: …“. Das geschieht, wenn der Nutzer nach Fehlendem fragt, oder wenn die Entwürfe der letzten Antwort übernommen sind und diese Antwort nichts fragt und nichts vorbereitet. Was das Modell schon fragt oder gerade als Entwurf vorbereitet, fügt sie nicht noch einmal an. Dieselben Fragen wiederholt sie nicht ungefragt (`meta.printoutGapsAsked`, nur auf dem Server).
4. **Zwei Felder, ohne die der Chat nie drucken konnte.**
   - `chLohnausweis.nGreSonderfaelle` („keine Sonderfälle“ der Anlage N-Gre) ist ein Katalogfeld (Ja/Nein) und schreibt denselben Schalter wie die Maske. Ohne ihn fehlte im Chat jede N-Gre (`grenzgaenger`).
   - Person B darf im Interview ihre eigenen Grenzgänger-Antworten bekommen (`PERSON_B_INTERVIEW_FIELDS`: `ch-wohnsitz`, `ch-nichtrueckkehrtage`). Dort schreibt sie auch die Schweiz-Maske hin, und daraus leiten Ausdruck und Schätzung Bs Status ab. Das übrige Interview bleibt gemeinsam.

**Folgen**

- Der Feldkatalog hat ein Feld mehr. `advisor-field-coverage.integration.test.ts` geht es mit durch.
- Die Nachfrage der App ist deutsch. Auf Englisch fragt nur das Modell.
- Was weder Nutzer noch Beleg kennt (etwa die Steuer-ID eines Kindes oder Name und Anschrift des anderen Elternteils), bleibt eine ehrliche Lücke. Die Eule nennt sie jetzt aber mit Feld und Maske.
