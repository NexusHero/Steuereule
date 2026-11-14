# UX-Review: Interview und Kataloge (November 2026)

**Stand:** `main` @ `9827de5b`. Dazu PR NexusHero/Steuereule#510 (`test/eskalationsfall-familie` @ `bf65cd5e`) als eigener Build.
**Methode:** Ich habe die App lokal gestartet (API und Web-Export) und mit einer Wegwerf-Datenbank im ATTACH-Stil betrieben, getrennt für `main` und PR #510. Durchgeklickt habe ich im eingebauten Browser auf Handy-Breite (375 px) und Desktop-Breite (1440 px). Ergänzend habe ich den Code gelesen. Alle Personen und Beträge sind erfunden. Ich habe keine Steuer-ID und keine Steuernummer eingegeben.
**Screenshots:** [`2026-11-interview-review/`](2026-11-interview-review/), Nummern `01`–`37`. Die Datei `NN-…-mobile.jpg` ist Handy-Breite, `NN-…-desktop.jpg` ist Desktop-Breite.

| Persona | Wer | Steuerjahr | Weg |
|---|---|---|---|
| **P1** Lena Hoffmann | angestellt, ledig, keine Kinder, 48.000 € brutto | erst 2026 (Default), dann Ausdruck | Gast → Interview → Konto → LStB → Lebenslagen → Sonderausgaben → Eule → Abgabe |
| **P2** Markus & Julia Brenner | verheiratet, beide Grenzgänger Schweiz, 2 Kinder | 2025 | Konto → Interview → CH-Maske → Stammdaten/Partner → Kinder; PR #510: Partner-Interview, „Für wen?“, Kinderzulage |
| **P3** Hans Meyer | Rentner, verwitwet, gesetzliche Rente 18.000 € | 2025 | Gast → Interview → Konto → Rente → Gesundheit |

---

## Kurzurteil

Der **Einstieg ist stark**: vier Fragen, ein Tipp pro Frage, ein Zurück-Pfeil und eine klare Sprache. Kein klassisches Steuerprogramm startet so leicht. Auch die **Fachtiefe beim Schweiz-Teil** (60-Tage-Regel, N-Gre, Pensionskassen-Aufteilung) und die **ehrlichen Grenzen** („Ehrlich: Krypto können wir noch nicht“) sind echte Alleinstellungsmerkmale.

Nach dem Einstieg verliert die App aber das, was sie verspricht: **Die Nutzerin sieht nicht, was in ihrer Erklärung passiert.**
- Die Schätzung fehlt für die meisten Personas. Für Rentner zeigt das Cockpit sogar „0 €“ Einkommen nach 18.000 € Rente.
- Nach dem Speichern erscheint keine Wirkung.
- Kacheln, Entwurfskarten und der Ausdruck nennen weder Formular noch Zeile.
- Interview-Antworten werden an mehreren Stellen nicht übernommen. Familienstand und Zusammenveranlagung müssen ein zweites Mal eingegeben werden.

Dazu kommen zwei Vertrauensbrüche:
- Die App startet im **laufenden Jahr 2026**. Dass es dafür keinen Ausdruck gibt, erfährt die Nutzerin erst ganz am Ende.
- Die **Eule** (Basis-Modus) schlägt bei „80 Homeoffice-Tagen“ 210 Tage vor. Die Werkbank übernimmt beide Alternativen mit einem Klick.

**Gesamtnote: 2,6 / 5.** Der Einstieg ist sehr gut, Sichtbarkeit und Durchgängigkeit sind schwach. Die größten Hebel sind Daten und Rückmeldung, nicht das visuelle Design.

---

## Was schon gut ist

- **Vier-Fragen-Einstieg** mit Auto-Weiter, Zurück-Pfeil und Fortschritt `n/4` ([02](2026-11-interview-review/02-p1-q1-job-mobile.jpg)–[05](2026-11-interview-review/05-p1-q4-familienstand-wordbreak-mobile.jpg)). Ein Klick pro Frage.
- **„Betrag später eintragen“** bei Spenden, KV und Haushalt ([Katalog](../../apps/mobile-web/src/screens/catalog/CatalogScreen.tsx:351)). Das senkt die Abbruchgefahr.
- **LStB-Maske mit Papier-Zeilennummern** („Bruttoarbeitslohn (Zeile 3)“) und Scan direkt auf dem Gerät ([10](2026-11-interview-review/10-p1-lstb-maske-mobile.jpg)). Das ist das Vorbild für alle anderen Masken.
- **Schätzung als Spanne** mit Herkunfts-Chip ([11](2026-11-interview-review/11-p1-cockpit-nach-lstb-mobile.jpg)). Das ist ehrlich.
- **Entwurfskarten der Eule** mit Vorher/Nachher, Erstattungs-Simulation, Paragraf und Rückgängig ([18](2026-11-interview-review/18-p1-eule-homeoffice-entwuerfe-desktop.jpg)). Konzeptionell stark.
- **Kacheln nach Person gruppiert** („Du“ / „Julia“, [34](2026-11-interview-review/34-pr510-p2-cockpit-julia-kacheln-mobile.jpg)).
- **Schweiz-Tiefe:** Nichtrückkehrtage, Wechselkurs-Erklärung, Pensionskasse obligatorisch/überobligatorisch. Das bieten WISO und Taxfix so nicht an.
- **Adresssuche** füllt Straße, PLZ und Ort aus. Kindername wird mit dem eigenen Nachnamen vorgeschlagen.

---

## Befunde nach Schwere

Schwere bedeutet: **Kritisch** = falsches Ergebnis oder Vertrauensbruch, der zum Abbruch führt. **Hoch** = Kernziel (Sichtbarkeit, Durchgängigkeit) deutlich verfehlt. **Mittel** = spürbare Reibung. **Niedrig** = Feinschliff.

### Kritisch

#### K1 – Die Eule schlägt Werte gegen die Angabe der Nutzerin vor, und die Werkbank übernimmt sich ausschließende Alternativen gemeinsam
- **Persona:** P1 · **Screenshot:** [18](2026-11-interview-review/18-p1-eule-homeoffice-entwuerfe-desktop.jpg), [17](2026-11-interview-review/17-p1-eule-start-desktop.jpg)
- **Code:** [advisor.ts:906-945](../../packages/core/src/interview/advisor.ts:906), [OwlModeScreen.tsx:410](../../apps/mobile-web/src/screens/advisor/OwlModeScreen.tsx:410), [OwlModeScreen.tsx:644](../../apps/mobile-web/src/screens/advisor/OwlModeScreen.tsx:644)
- **Beobachtung:** Die Eingabe war „Ich war 2026 an 80 Tagen im Homeoffice.“ Die Eule bietet zwei Wege an: A „1–2 Tage/Woche“ (+6 €) und B „Fast immer … 210 Tage = 1.260 €“ (+20 €). Die 80 Tage tauchen nirgends auf. Weg B würde die Erklärung über die tatsächliche Angabe hinaus aufblähen. Die Werkbank rechts bietet dann „✓ 2 Änderungen übernehmen“ an und würde **beide** sich ausschließenden Werte schreiben.
- **Weitere Auffälligkeiten:**
  - Die Simulation zeigt „692 € → 698 €“, obwohl das Cockpit gleichzeitig sagt, es rechne keine Erstattung (siehe K3).
  - Die Wirkung von nur +6 € wird nicht erklärt (Arbeitnehmer-Pauschbetrag).
  - Die Werkbank meldet „Alles geprüft. Keine offenen Fragen!“, obwohl 9 Stammdaten fehlen.
- **Einschränkung:** Die KI lief im Basis-Modus, weil kein API-Schlüssel gesetzt war. Getestet ist also der Regel-Fallback. Mit LLM kann die Antwort anders ausfallen, der Fallback ist aber genau das, was bei einem Ausfall live geht.
- **Vorschlag:**
  - Vorschläge nur aus den Angaben der Nutzerin ableiten („80 Tage × 6 € = 480 €“).
  - Alternativen als Auswahl (Radio) statt als Stapel anbieten. „Alle übernehmen“ für sich ausschließende Entwürfe sperren.
  - „Alles geprüft“ nur zeigen, wenn wirklich nichts offen ist.

#### K2 – Standardjahr 2026: Die Nutzerin füllt ein laufendes Jahr aus und landet am Ende in einer Sackgasse
- **Persona:** P1 · **Screenshot:** [02](2026-11-interview-review/02-p1-q1-job-mobile.jpg), [20](2026-11-interview-review/20-p1-ausdruck-2026-sackgasse-desktop.jpg)
- **Code:** [taxYear.ts:1](../../apps/mobile-web/src/config/taxYear.ts:1) (`CURRENT_TAX_YEAR = 2026`), [ShellState.tsx:69](../../apps/mobile-web/src/navigation/ShellState.tsx:69)
- **Beobachtung:** Neue Nutzer starten in „Woher kam dein Geld 2026?“, also im laufenden Jahr. Interview, Konto, LStB, Kataloge und Abgabe-Prüfung laufen alle durch. Erst beim Ausdruck kommt: „Für 2026 gibt es die amtlichen Vordrucke noch nicht.“ Eine Lohnsteuerbescheinigung 2026 existiert im November 2026 noch gar nicht.
- **Vorschlag:**
  - Default ist das letzte abgeschlossene Jahr (heute 2025).
  - Das laufende Jahr heißt „2026 vorbereiten“ und hat einen eigenen Modus: Belege sammeln, Steuer-Tipps fürs Jahresende, kein Ausdruck.
  - Das Jahr steht im ersten Interview-Screen sichtbar und ist dort änderbar.

#### K3 – Die Schätzung fehlt für die meisten Personas oder widerspricht sich
- **Persona:** P1, P3 (P2 auf `main` ohne angelegte Zusammenveranlagung ebenso) · **Screenshot:** [13](2026-11-interview-review/13-p1-lohnersatz-schaetzung-verschwindet-mobile.jpg), [31](2026-11-interview-review/31-p3-cockpit-null-euro-mobile.jpg), [18](2026-11-interview-review/18-p1-eule-homeoffice-entwuerfe-desktop.jpg)
- **Code:** [tax-estimate.service.ts:107-113](../../apps/api/src/tax-estimate/tax-estimate.service.ts:107), [resources.ts:1306-1308](../../apps/mobile-web/src/i18n/resources.ts:1306)
- **Beobachtung:**
  - **Rentner:** Nach 18.000 € gesetzlicher Rente zeigt das Cockpit „Erfasstes Einkommen **0 €**“ und „Die Erstattung rechnen wir bisher nur für Angestellte.“ Die Rente-Kachel steht trotzdem auf „Erledigt“. Das wirkt wie ein Datenverlust.
  - **Ehrliche Antwort wird bestraft:** Antwortet P1 auf „Lohnersatz?“ mit **Ja**, verschwindet die vorher sichtbare Spanne (588–649 €) sofort: „Mit Nebenjob, Abfindung, Lohnersatz oder doppelter Haushaltsführung rechnen wir die Erstattung noch nicht.“
  - **Widerspruch:** Im Eulen-Chat steht im selben Moment „Erstattung (Simulation): 692 €“.
  - Die Abgabe-Prüfung schickt die Nutzerin danach zu „Öffnen: Lebenslagen“. Dort kann sie aber nichts reparieren, denn die Grenze liegt in der App ([19](2026-11-interview-review/19-p1-abgabe-pruefung-desktop.jpg)).
- **Vorschlag:**
  - Rentner (Besteuerungsanteil nach § 22 EStG) und Lohnersatz (Progressionsvorbehalt) in die Schätzung aufnehmen.
  - Bis dahin die letzte bekannte Spanne mit Hinweis „ohne Lohnersatz“ stehen lassen, statt sie zu löschen.
  - „Erfasstes Einkommen“ nie als 0 € zeigen, wenn Einkünfte erfasst sind.
  - Chat und Cockpit aus derselben Quelle speisen.

### Hoch

#### H1 – Die Zahl, die zählt, ist die kleinste auf dem Bildschirm, und nach dem Speichern gibt es keine Wirkung
- **Persona:** P1, P2, P3 · **Screenshot:** [11](2026-11-interview-review/11-p1-cockpit-nach-lstb-mobile.jpg), [16](2026-11-interview-review/16-p1-cockpit-desktop.jpg)
- **Code:** [CockpitScreen.tsx:513-522](../../apps/mobile-web/src/screens/cockpit/CockpitScreen.tsx:513), [CockpitScreen.tsx:230-268](../../apps/mobile-web/src/screens/cockpit/CockpitScreen.tsx:230), [saveFeedback.ts](../../apps/mobile-web/src/screens/shared/saveFeedback.ts)
- **Beobachtung:**
  - Groß und in Neon steht im Hero „ERFASSTES EINKOMMEN 48.000 €“. Die Erstattung „Voraussichtlich 588 – 649 €“ steht klein und grau darunter.
  - Nach dem Speichern einer Maske springt die App ins Cockpit, ohne zu sagen, was sich geändert hat (kein „+120 € durch Spenden“).
  - Den Wert bekommt man nur im Cockpit (`CockpitScreen.tsx:235`). In Katalog und Masken gibt es keinen Delta-Hinweis.
- **Vorschlag:**
  - Den Hero umdrehen: Erstattung bzw. Nachzahlung als Hauptzahl, Einkommen als Nebeninfo.
  - Nach jedem Speichern eine Wirkungszeile zeigen: „Spenden 250 € → Anlage Sonderausgaben Z. 5 → +48 € Erstattung“.
  - Bei Werten ohne Steuerwirkung das auch sagen und den Grund nennen („Pauschbetrag 1.230 € noch nicht überschritten“).

#### H2 – Keine Formular- und Zeilen-Transparenz außerhalb von LStB und Stammdaten
- **Persona:** P1, P2, P3 · **Screenshot:** [16](2026-11-interview-review/16-p1-cockpit-desktop.jpg), [18](2026-11-interview-review/18-p1-eule-homeoffice-entwuerfe-desktop.jpg), [20](2026-11-interview-review/20-p1-ausdruck-2026-sackgasse-desktop.jpg)
- **Code:** [CockpitTiles.tsx:146-160](../../apps/mobile-web/src/screens/cockpit/CockpitTiles.tsx:146), [ProposalCards.tsx:109-142](../../apps/mobile-web/src/screens/advisor/chat/ProposalCards.tsx:109), [advisor.ts:141-170](../../packages/core/src/interview/advisor.ts:141), [PrintoutScreen.tsx:121-229](../../apps/mobile-web/src/screens/printout/PrintoutScreen.tsx:121)
- **Beobachtung:**
  - Kacheln zeigen nur Titel und Status („Offen“ / „Erledigt“), keinen Betrag und keine Anlage.
  - Entwurfskarten zeigen den Feldwert („Nie → Fast immer“), aber nicht, wo er landet (Anlage N, Z. 45).
  - Der Ausdruck ist eine Checkliste mit PDF-Download, ohne Vorschau der Formulare und ohne Sprung von einer Zeile zurück in die Maske.
  - Nur die LStB-Maske („Zeile 3“) und die Stammdaten („Zeile 19–24 ESt 1 A“) nennen Zeilen. Das ist uneinheitlich.
  - Herkunft wird pro Maske gezeigt, nicht pro Wert. Der Herkunfts-Chip im Hero zeigt „Spannen-Regel · ADR-015“, also eine interne ADR-Nummer ([resources.ts:1235](../../apps/mobile-web/src/i18n/resources.ts:1235)).
- **Vorschlag:**
  - Jede Kachel bekommt eine Fußzeile „Anlage N · 3 Zeilen · 1.240 €“.
  - Entwurfskarten bekommen einen Zeilen-Chip.
  - Eine „Formular-Ansicht“, die die amtlichen Zeilen live befüllt zeigt. Tippt man eine Zeile an, öffnet sich die Maske, und die Herkunft wird pro Wert angezeigt (Beleg, Eule, selbst).

#### H3 – Interview-Antworten werden nicht übernommen: Doppel-Erfassung bei Ehepaaren
- **Persona:** P2 · **Screenshot:** [26](2026-11-interview-review/26-p2-stammdaten-familienstand-nicht-vorbelegt-mobile.jpg), [27](2026-11-interview-review/27-p2-zusammenveranlagung-partner-mobile.jpg), [37](2026-11-interview-review/37-pr510-p2-kind-ehepartner-keines-mobile.jpg)
- **Code:** [MasterDataScreen.tsx:203](../../apps/mobile-web/src/screens/master-data/MasterDataScreen.tsx:203); PR #510: `ChildrenScreen.tsx:166` (`married` liest nur `masterData.familienstand`)
- **Beobachtung:**
  - Das Interview fragt „Verheiratet“, in PR #510 zusätzlich „Und dein Ehepartner? → Angestellt → Arbeitet Person B auch in der Schweiz?“. Trotzdem gilt:
    - Der Familienstand in den Stammdaten ist **nicht vorbelegt**.
    - Die Zusammenveranlagung muss von Hand angelegt werden. Das Cockpit sagt dafür: „Ihr seid verheiratet: Leg in ‚Angaben für die Erklärung‘ die Zusammenveranlagung an.“
    - Der Partnerberuf ist nicht vorbelegt.
  - Die neue Auswahl „Die Kinderzulage kommt mit dem Lohn von [mir] [Person B]“ erscheint erst, wenn der Familienstand **in den Stammdaten gespeichert** ist. Das Interview-„Verheiratet“ reicht nicht.
  - In der Kinder-Maske steht „Kindschaftsverhältnis zu deinem Ehepartner“ auf **„Keines“** vorbelegt und ist unter „Weitere Angaben“ versteckt. Bei gemeinsamen Kindern führt das zu einer falschen Anlage Kind.
- **Vorschlag:**
  - Eine Quelle der Wahrheit: Interview-Antworten setzen Familienstand, Veranlagungsart und Person B direkt (mit „Ändern“-Link).
  - Bei Zusammenveranlagung „gemeinsames Kind“ als Default setzen und die Frage nach vorn holen.
  - Den Partner-Namen früh erfragen, damit alle Folgefragen „Julia“ statt „Person B“ sagen können.

#### H4 – Die Fortschrittsanzeige ist irreführend: Zähler springen, Gesamtumfang unbekannt
- **Persona:** P1, P2 · **Screenshot:** [05](2026-11-interview-review/05-p1-q4-familienstand-wordbreak-mobile.jpg), [06](2026-11-interview-review/06-p1-kontowand-mobile.jpg), [08](2026-11-interview-review/08-p1-onboarding-1von3-mobile.jpg), [13](2026-11-interview-review/13-p1-lohnersatz-schaetzung-verschwindet-mobile.jpg), [32](2026-11-interview-review/32-pr510-p2-partner-frage-0von4-mobile.jpg)
- **Code:** [resources.ts:177](../../apps/mobile-web/src/i18n/resources.ts:177), [CatalogScreen.tsx:242](../../apps/mobile-web/src/screens/catalog/CatalogScreen.tsx:242), PR #510 `QuestionScreen.tsx`
- **Beobachtung:**
  - Das Interview zählt `1/4 … 4/4`, danach steht „**Drei** Antworten, und wir wissen …“.
  - Das Onboarding beginnt wieder bei `1/3`.
  - In PR #510 springt die Partnerfrage nach `4/4` auf **`0/4`** zurück und bleibt bei der Folgefrage auf `0/4`.
  - Katalogzähler beginnen bei „0 von 5“. Nach einem „Ja“ wächst das Ziel („4 von 6“).
  - Insgesamt ist nie sichtbar, wie weit die Nutzerin von „abgabebereit“ entfernt ist.
- **Vorschlag:**
  - Ein durchgehender Fortschritt bis zur Abgabe, z. B. „Abgabebereit: 6 von 11 Themen“, im Cockpit und als dünne Leiste im Sheet.
  - Unterfragen als Teilschritt darstellen (`4a`), statt das Ziel zu verschieben.
  - Die Texte („Drei Antworten“) aus der tatsächlichen Zahl ableiten.

#### H5 – Die Fristwarnung ist pauschal und alarmierend
- **Persona:** P2, P3 · **Screenshot:** [21](2026-11-interview-review/21-p2-2025-fristwarnung-mobile.jpg), [31](2026-11-interview-review/31-p3-cockpit-null-euro-mobile.jpg)
- **Code:** [DeadlinesBanner.tsx](../../apps/mobile-web/src/screens/deadlines/DeadlinesBanner.tsx), [resources.ts:996](../../apps/mobile-web/src/i18n/resources.ts:996)
- **Beobachtung:**
  - Jeder Nutzer sieht im Jahr 2025 noch vor der ersten Antwort: „Die Abgabefrist 31.07.2026 ist um 106 Tage überschritten. Verspätungszuschlag (§ 152 AO): mindestens 25 € pro Monat.“
  - Das gilt nur bei Pflicht zur Abgabe. Freiwillige Erklärungen (typischer Angestellter, viele Rentner) haben vier Jahre Zeit und keinen Zuschlag.
  - Auch bei Pflichtveranlagung ist der Zuschlag vor Ablauf von 14 Monaten nach Jahresende (§ 152 Abs. 2 AO) Ermessenssache. „Mindestens 25 € pro Monat“ ist für November 2026 also zu hart formuliert.
  - Für Hans (Rentner, Einkommen „0 €“) steht die Warnung direkt neben der fehlenden Schätzung.
- **Vorschlag:**
  - Die Frist erst nach der Pflichtveranlagungs-Prüfung zeigen. Grenzgänger CH sind meist pflichtig, ein einfacher Angestellter nicht.
  - Bei freiwilliger Abgabe: „Freiwillig, du hast Zeit bis 31.12.2029. Eine Erstattung kommt schneller, je früher du abgibst.“
  - Beim Ton die Lösung zeigen („Heute abgeben dauert noch ~20 Min.“), nicht nur die Strafe.

#### H6 – Die Schweiz-Maske überlädt: 30 Felder, Summen von Hand, keine Rückmeldung, was fehlt
- **Persona:** P2 · **Screenshot:** [24](2026-11-interview-review/24-p2-ch-lohnausweis-titel-abgeschnitten-mobile.jpg), [25](2026-11-interview-review/25-p2-cockpit-nach-fertig-weiter-offen-mobile.jpg), [23](2026-11-interview-review/23-p2-nichtrueckkehrtage-mobile.jpg)
- **Code:** [CrossBorderScreen.tsx](../../apps/mobile-web/src/screens/cross-border/CrossBorderScreen.tsx)
- **Beobachtung:**
  - Eine Seite enthält 14 Lohnausweis-Ziffern, Wechselkurs, Vorsorge, 13 N-Gre-Felder und eine Sonderfall-Frage. Insgesamt sind es **30 Eingabefelder**.
  - Ziffer 8 (Total) und 11 (Netto) sind aus den anderen Ziffern ableitbar, müssen aber getippt werden.
  - Die Begriffe BVG, NBUV, Säule 2a/2b und KK-Taggeld werden nicht erklärt.
  - Nach „Fertig“ springt die App ins Cockpit. Die Kachel bleibt **„Offen“**, „Nächster Schritt: Schweizer Lohnausweis“ bleibt stehen, und es fehlt jeder Hinweis, *was* fehlt (vermutlich der Wechselkurs).
  - Der Titel „CH-Lohnausweis“ ist rechts abgeschnitten.
- **Vorschlag:**
  - In 3 Schritte teilen: Lohnausweis (Scan zuerst), Wechselkurs (vorbelegt mit dem amtlichen Jahresdurchschnitt), N-Gre-Extras.
  - Summen live berechnen und nur Abweichungen markieren.
  - Bei „Fertig“ mit offenen Pflichtangaben auf der Seite bleiben und das erste fehlende Feld markieren.

#### H7 – Die Person-B-Logik aus PR #510 ist noch nicht zu Ende gedacht
- **Persona:** P2 (PR #510) · **Screenshot:** [32](2026-11-interview-review/32-pr510-p2-partner-frage-0von4-mobile.jpg)–[37](2026-11-interview-review/37-pr510-p2-kind-ehepartner-keines-mobile.jpg)
- **Code:** PR #510 `CatalogScreen.tsx:115-126` („Für wen?“), `ChildrenScreen.tsx` (Kinderzulage-Auswahl mit hart kodierten Texten „mir“ / „Person B“ außerhalb von i18n), `CockpitPartnerSection.tsx`
- **Beobachtung:**
  - **„Für wen?“** steht als Schalter über dem Katalog. Schaltet man auf „für Julia“, fragt der Katalog weiter „Hast du gespendet?“ ([36](2026-11-interview-review/36-pr510-p2-fuer-wen-julia-gleiche-frage-mobile.jpg)). Ob der Schalter für die eine Frage oder den ganzen Katalog gilt, ist unklar.
  - Bei Zusammenveranlagung ist die Zuordnung für Spenden steuerlich ohne Wirkung. Der Schalter erzeugt dort eine Entscheidung ohne Nutzen.
  - Im Interview heißt die Partnerin „**Person B**“ („Arbeitet Person B auch in der Schweiz?“). Das ist Formularsprache.
  - Julia bekommt im Cockpit **zugleich** „Lohnsteuerbescheinigung“ und „Lohnausweis Schweiz“, obwohl das Interview sie als reine Grenzgängerin erfasst ([34](2026-11-interview-review/34-pr510-p2-cockpit-julia-kacheln-mobile.jpg)).
  - Die Partnerfrage kennt weder „Selbstständig“ noch „Grenzgänger in Rente“.
  - Die Stammdaten bieten für Julia weiter nur „Lohnsteuerbescheinigung von Julia erfassen“ und „Arbeitsweg“ an, keinen Lohnausweis.
  - Das Ehepaar sieht die Kachel „Alleinerziehend“ und in der Kinder-Maske den Block „Entlastungsbetrag für Alleinerziehende“.
- **Vorschlag:**
  - „Für wen?“ nur dort zeigen, wo die Zuordnung zählt (KV/PV, Riester, Arbeitswege, Lohnersatz). Den Fragetext umschreiben („Hat Julia gespendet?“).
  - Den Schalter pro Frage als Chip unter der Frage setzen, nicht global.
  - Kacheln aus dem Partnerberuf ableiten.
  - Alleinerziehenden-Inhalte bei Verheirateten ausblenden.
  - Die Kinderzulage-Texte nach i18n ziehen und den Namen statt „Person B“ verwenden.

### Mittel

#### M1 – Wortumbrüche mitten im Wort und abgeschnittene Titel
- **Persona:** alle · **Screenshot:** [05](2026-11-interview-review/05-p1-q4-familienstand-wordbreak-mobile.jpg) „Familienstan|d“, [09](2026-11-interview-review/09-p1-onboarding-steuernummer-wordbreak-mobile.jpg) „Steuernumm|er“, [10](2026-11-interview-review/10-p1-lstb-maske-mobile.jpg) „Lohnsteuerbesch|einigung“, [15](2026-11-interview-review/15-p1-sonderausgaben-kv-wordbreak-mobile.jpg) „Pflegeversicherun|g“, [23](2026-11-interview-review/23-p2-nichtrueckkehrtage-mobile.jpg) „zurückgekeh|rt“, [24](2026-11-interview-review/24-p2-ch-lohnausweis-titel-abgeschnitten-mobile.jpg), [27](2026-11-interview-review/27-p2-zusammenveranlagung-partner-mobile.jpg) Chip „Einzelveranlagun…“
- **Code:** [interview/styles.ts:37](../../apps/mobile-web/src/screens/interview/styles.ts:37) (`size['3xl']`), Sheet-Titel in den Masken
- **Vorschlag:** Auf Web `hyphens: auto` mit `lang="de"`. Lange Komposita mit `&shy;` brechen oder die Schriftgröße bei Überlänge eine Stufe senken. Chip-Reihen umbrechen lassen. Den 375-px-Screenshot-Test in `e2e/visual` um die Titel erweitern.

#### M2 – Fachbegriffe ohne Erklärung, nur ein einziger Katalog-Hinweis
- **Persona:** alle · **Screenshot:** [03](2026-11-interview-review/03-p1-q2-ausland-mobile.jpg), [04](2026-11-interview-review/04-p1-q3-kinder-mobile.jpg), [12](2026-11-interview-review/12-p1-lebenslagen-dhf-mobile.jpg), [28](2026-11-interview-review/28-p2-kinder-maske-mobile.jpg), [30](2026-11-interview-review/30-p3-rente-maske-mobile.jpg)
- **Code:** [resources.ts:1016-1063](../../apps/mobile-web/src/i18n/resources.ts:1016); `katalog.hints` hat nur `haushalt-gate` ([resources.ts:1057](../../apps/mobile-web/src/i18n/resources.ts:1057), [CatalogScreen.tsx:234](../../apps/mobile-web/src/screens/catalog/CatalogScreen.tsx:234))
- **Beobachtung:** Ohne Erklärung bleiben unter anderem:
  - „doppelte Haushaltsführung“, „Lohnersatz“, „Minijob/Midijob/Nebenjob“ (die Option „Nebenjob“ wiederholt die Frage)
  - „Günstigerprüfung“, „Splittingtarif“, „60-Tage-Tracking“ (bei Nicht-Grenzgängern)
  - „Rentenbezugsmitteilung“, „BEA-Freibetrag“, „unmittelbar/mittelbar“ (Riester)
  - „Beitragspflichtige Einnahmen im Vorjahr“
  - Es gibt keine Info-Icons und kein Glossar.
- **Vorschlag:**
  - Jede Frage bekommt eine Zeile „Was heißt das?“ mit Beispiel, z. B. „Doppelte Haushaltsführung = zweite Wohnung am Arbeitsort, weil der Weg zu weit ist“.
  - Fachbegriff erst nach dem Alltagsbegriff nennen.
  - Ein gemeinsames Glossar, das auch die Eule nutzt.

#### M3 – Irrelevante Fragen und Kacheln
- **Persona:** P1, P3, P2 · **Screenshot:** [29](2026-11-interview-review/29-p3-rentner-pendelfrage-mobile.jpg), [07](2026-11-interview-review/07-p1-cockpit-leer-mobile.jpg), [34](2026-11-interview-review/34-pr510-p2-cockpit-julia-kacheln-mobile.jpg)
- **Code:** [interview.ts:148](../../packages/core/src/interview/interview.ts:148) (feste `QUESTION_ORDER`), Kachel-Personas in [tiles.ts](../../apps/mobile-web/src/screens/cockpit/tiles.ts)
- **Beobachtung:**
  - Der Rentner wird gefragt: „Pendelst du **zum Arbeiten** ins Ausland?“
  - Die ledige Lena ohne Kinder sieht „Kinder verwalten“, „Kapital & Depot prüfen“ und „Vermietung prüfen“ als feste Buttons.
  - Das Ehepaar sieht „Alleinerziehend“.
- **Vorschlag:** `ausland` für „Rente“ umformulieren („Bekommst du eine Rente aus dem Ausland?“) oder überspringen. Die Schnellzugriffe unten im Cockpit an Antworten koppeln.

#### M4 – Gast-Schleife: Der Haupt-CTA führt zurück zur Konto-Wand
- **Persona:** P1 · **Screenshot:** [06](2026-11-interview-review/06-p1-kontowand-mobile.jpg), [07](2026-11-interview-review/07-p1-cockpit-leer-mobile.jpg)
- **Code:** [KontoWandScreen.tsx](../../apps/mobile-web/src/screens/funnel/KontoWandScreen.tsx), [afterTheInterview.ts](../../apps/mobile-web/src/screens/funnel/afterTheInterview.ts)
- **Beobachtung:** Nach „Später — erst mal ins Cockpit“ führt der neongrüne Button „Weiter mit deinem Weg“ wieder auf die Konto-Wand. Der Gast sieht keinen einzigen Wert und hat keine Möglichkeit, etwas zu erfassen. Der „Später“-Button liegt auf dem Handy halb unter der Tab-Leiste.
- **Vorschlag:**
  - Gäste die LStB-Maske ausfüllen lassen und eine erste Spanne zeigen. Das Konto erst beim Speichern oder Abgeben verlangen. Das deckt sich mit „Value First“ aus ADR-0045.
  - Auf der Konto-Wand den Grund nennen („damit deine LStB nicht verloren geht“).

#### M5 – Widersprüchliche oder leere Statusmeldungen
- **Persona:** P1, P2 · **Screenshot:** [07](2026-11-interview-review/07-p1-cockpit-leer-mobile.jpg), [11](2026-11-interview-review/11-p1-cockpit-nach-lstb-mobile.jpg), [14](2026-11-interview-review/14-p1-cockpit-bitte-pruefen-mobile.jpg), [18](2026-11-interview-review/18-p1-eule-homeoffice-entwuerfe-desktop.jpg)
- **Beobachtung:**
  - Im Cockpit steht „Noch offen · 3 Posten offen · **0 Fragen offen**“.
  - Es meldet „Kirchensteuer offen: Trag deine Konfession ein“, obwohl die LStB-Maske erklärt hat: „Ohne Kirche lass beide Felder leer.“
  - Die Kachel Lebenslagen zeigt „Erledigt · **Bitte prüfen**“ ohne Grund.
  - Die Eule meldet „Alles geprüft“, während der Cockpit-Button „9 fehlen“ zeigt.
  - Die Kachelüberschrift sagt „Nachzahlung senken“ bzw. „Erstattung erhöhen“, bevor es überhaupt eine Schätzung gibt.
- **Vorschlag:** Jede Warnung bekommt einen Satz mit dem *Was* und einen Button zum *Wo*. Die Überschrift ist neutral („Was noch fehlt“), bis es eine Richtung gibt. Die Kirchensteuer aus der leeren LStB-Zeile 6 als „keine“ ableiten (mit Rückfrage).

#### M6 – Der Rechtsstand ist inkonsistent und hart kodiert
- **Persona:** P1 · **Screenshot:** [17](2026-11-interview-review/17-p1-eule-start-desktop.jpg), [18](2026-11-interview-review/18-p1-eule-homeoffice-entwuerfe-desktop.jpg)
- **Code:** [OwlModeScreen.tsx:668](../../apps/mobile-web/src/screens/advisor/OwlModeScreen.tsx:668), [resources.ts:1633](../../apps/mobile-web/src/i18n/resources.ts:1633)
- **Beobachtung:** Auf demselben Bildschirm steht im Steuerjahr 2026 dreimal „Rechtsstand 01.01.2025“ (Fußzeile, Werkbank) und auf den Karten „Rechtsstand 13.11.2026“.
- **Vorschlag:** Den Rechtsstand aus dem Regelwerk des gewählten Jahres ableiten, nie als Text fest einbauen.

#### M7 – Fehlende Eingabehilfen in den Masken
- **Persona:** P1, P3 · **Screenshot:** [10](2026-11-interview-review/10-p1-lstb-maske-mobile.jpg), [30](2026-11-interview-review/30-p3-rente-maske-mobile.jpg)
- **Beobachtung:**
  - Den „SV-Arbeitnehmeranteil (Summe der Zeilen 23, 25, 26 und 27)“ muss die Nutzerin selbst addieren.
  - Alle Beträge gehen nur in ganzen Euro, obwohl auf der LStB Cent stehen.
  - Die Rente ist eine **Einfachauswahl**, obwohl gesetzliche Rente plus Witwenrente häufig ist.
  - Für die Rentenbezugsmitteilung gibt es keinen Scan wie bei der LStB.
  - „Noch nicht ermittelbar“ bleibt stehen, obwohl Betrag und Beginn eingetragen sind. Eine Live-Vorschau des steuerpflichtigen Teils fehlt.
  - Gesundheit bietet kein „später“ und erklärt nicht, dass erst ab der zumutbaren Belastung etwas wirkt.
  - Die Enter-Taste schickt Onboarding-Formulare nicht ab.
- **Vorschlag:**
  - Vier SV-Felder anbieten oder die Summe aus dem Scan ziehen.
  - Bei Cent-Beträgen automatisch runden und das ansagen.
  - Mehrere Renten zulassen.
  - Live „davon steuerpflichtig: 14.220 € (79 %)“ zeigen.
  - Bei Krankheitskosten die zumutbare Belastung vorab schätzen („wirkt erst ab ca. 900 €“).

#### M8 – Barrierefreiheit
- **Persona:** P2 · **Screenshot:** [22](2026-11-interview-review/22-p2-ch-wohnsitz-kontrast-mobile.jpg), [23](2026-11-interview-review/23-p2-nichtrueckkehrtage-mobile.jpg), [27](2026-11-interview-review/27-p2-zusammenveranlagung-partner-mobile.jpg)
- **Code:** [MasterDataScreen.tsx](../../apps/mobile-web/src/screens/master-data/MasterDataScreen.tsx) (Partner-Block)
- **Beobachtung:**
  - Die sechs Partner-Eingabefelder (Vorname bis Beruf) haben **keinen zugänglichen Namen**. Weder `aria-label` noch ein verknüpftes Label ist gesetzt, ein Screenreader liest also „Textfeld“.
  - Hervorgehobene Wörter in Neon-Lime auf Beige („du“, „nicht“) haben deutlich zu wenig Kontrast.
- **Vorschlag:** Den `Feld`-Wrapper mit `accessibilityLabel` an das Input durchreichen. Die Hervorhebung nur als Hintergrund-Marker nutzen (wie bei „Geld“), nie als Textfarbe.

### Niedrig

| # | Befund | Persona | Screenshot | Vorschlag |
|---|---|---|---|---|
| N1 | Die Sheet-Höhe springt von Frage zu Frage, dadurch wandern Ja/Nein-Buttons (Gefahr von Fehltipps) | P1 | [12](2026-11-interview-review/12-p1-lebenslagen-dhf-mobile.jpg), [13](2026-11-interview-review/13-p1-lohnersatz-schaetzung-verschwindet-mobile.jpg) | Feste Sheet-Höhe, Antworten unten verankert |
| N2 | Desktop: schmale Spalte, Handy-Tab-Leiste, Kacheln ohne zusätzliche Information | P1 | [16](2026-11-interview-review/16-p1-cockpit-desktop.jpg) | Ab 1024 px Zwei-Spalten-Layout (Kacheln \| Formular-Vorschau), Navigation links |
| N3 | Login für Erstbesucher: „weiter, wo du aufgehört hast“ | P1 | [01](2026-11-interview-review/01-login-mobile.jpg) | Text abhängig von bekannter Sitzung |
| N4 | Zwei Schließen-Affordanzen pro Sheet („←“ und „Schließen“) | alle | [10](2026-11-interview-review/10-p1-lstb-maske-mobile.jpg) | „←“ = Frage zurück, „Schließen“ = Sheet zu, beide beschriften |
| N5 | „Familienstand am 31.12.“: Für Splitting zählt *ein* Tag im Jahr. „Verwitwet“ ohne Todesjahr (Witwensplitting im Folgejahr) | P3 | [05](2026-11-interview-review/05-p1-q4-familienstand-wordbreak-mobile.jpg) | „… im Jahr 2025 (auch nur kurz)?“; bei Verwitwet das Jahr nachfragen |
| N6 | Lohnausweis in CHF, Schweizer Kinderzulage in € | P2 | [37](2026-11-interview-review/37-pr510-p2-kind-ehepartner-keines-mobile.jpg) | Eine Währung je Beleg, Umrechnung durch die App |

---

## Bewertungsmatrix

Skala 1 (schlecht) bis 5 (sehr gut). Bewertet ist der beobachtete Stand, nicht der Plan.

| Kriterium | P1 Angestellte | P2 Grenzgänger-Paar | P3 Rentner | **Gesamt** | Haupttreiber |
|---|:-:|:-:|:-:|:-:|---|
| **Verständlichkeit** | 3,5 | 2 | 3 | **2,8** | + klare 4 Fragen; − Fachbegriffe ohne Hilfe (M2), „Person B“, 30-Felder-Maske (H6) |
| **Transparenz** (was passiert in der Erklärung) | 2,5 | 1,5 | 1 | **1,7** | − keine Zeilen/Formulare (H2), keine Wirkung nach Speichern (H1), Schätzung fehlt (K3) |
| **Aufwand** (Klicks, Doppel-Erfassung) | 3,5 | 2 | 3,5 | **3,0** | + 1 Klick/Frage, „später“; − Doppel-Erfassung (H3), Summen von Hand (H6, M7) |
| **Vertrauen** | 2,5 | 2,5 | 1,5 | **2,2** | − 2026-Sackgasse (K2), „0 €“ (K3), Eulen-Vorschlag (K1), Fristalarm (H5), Rechtsstand (M6); + Spanne, Paragrafen |
| **Fehlertoleranz** | 3,5 | 2,5 | 3 | **3,0** | + Zurück, „später“, Undo bei Entwürfen; − „Fertig“ ohne Hinweis (H6), Batch-Übernahme (K1), Default „Keines“ (H3) |
| **Ø** | 3,1 | 2,1 | 2,4 | **2,6** | |

---

## Abgrenzung: Steuereule heute vs. WISO, Taxfix, ELSTER

| | **ELSTER** | **WISO Steuer** | **Taxfix** | **Steuereule heute** |
|---|---|---|---|---|
| Einstieg | Formularbaum | Interview oder Formular, Desktop-first | Chat-artiges Interview, mobile-first | 4-Fragen-Weg, mobile-first, ✔ |
| Sicht auf Formular/Zeile | maximal (es *ist* das Formular) | gut (Formularansicht umschaltbar) | gering | gering (nur LStB, Stammdaten) ✘ |
| Live-Erstattung | keine | ja, ständig sichtbar | ja | nur für ledige Angestellte, klein ✘ |
| Erklärung/Beratung | keine | Hilfetexte, Ratgeber | kurze Tooltips | Eule mit Paragraf, Vorher/Nachher ✔ (Qualität s. K1) |
| Grenzgänger CH | Formular N-Gre, ohne Hilfe | möglich, viel Handarbeit | nicht abgedeckt | **tief und geführt** ✔✔ |
| Belegabruf / Vorbefüllung | ja (VaSt) | ja (via ELSTER) | ja | nicht beobachtet ✘ |
| Ehrlichkeit über Grenzen | – | – | wenig | **explizit** („Ehrlich: … können wir noch nicht“) ✔ |

**Was Steuereule heute schon unterscheidet:**
1. Grenzgänger Schweiz als Kernfall, nicht als Randfall.
2. Eine Beraterin im Produkt, die Paragrafen nennt und Änderungen als prüfbaren Entwurf mit Undo vorschlägt statt sie still zu schreiben.
3. Eine ehrliche Spanne statt einer Scheingenauigkeit.
4. Ein Haushalt mit Personen statt eines Formulars mit Spalten.

**Was zum Gamechanger fehlt:**
1. **„Glas-Erklärung“:** Jede Eingabe zeigt sofort *Formular → Zeile → Euro-Wirkung*, und jede Zeile der amtlichen Ansicht führt zurück zu ihrer Quelle. Das kann keiner der drei Wettbewerber so durchgängig: WISO zeigt Zeilen, aber keine Herkunft; Taxfix zeigt Wirkung, aber keine Zeilen.
2. **Eine Schätzung, die für alle gilt** (Rentner, Paare, Lohnersatz), sonst trägt die Kernpromesse nur für eine Persona.
3. **Ein Datenstrom statt Inseln:** Interview, Stammdaten, Partner und Kinder teilen eine Wahrheit. Nichts wird zweimal gefragt.
4. **Belegabruf/Vorbefüllung** (ELSTER-VaSt) oder zumindest „Vorjahr übernehmen“ als Standardstart. Das kürzt die Erfassung um Größenordnungen.
5. **Ganzjahres-Modus fürs laufende Jahr** (statt K2): „Bis 31.12. noch 340 € holen“, Belege sammeln, Homeoffice-Tage zählen. Hier passt die Eule am besten.

---

## Die fünf Hebel mit der größten Wirkung

Aufwand: **S** ≤ 2 Personentage, **M** ≤ 1 Woche, **L** > 1 Woche.

| # | Hebel | Löst | Wirkung | Aufwand |
|---|---|---|---|:-:|
| **1** | **Wirkungszeile nach jedem Speichern und Hero umdrehen.** Erstattung/Nachzahlung als Hauptzahl. Nach jedem Speichern ein Banner „Spenden 250 € → Anlage Sonderausgaben Z. 5 → +48 €“. Kacheln mit Betrag und Anlage. Für den PDF-Ausdruck gibt es bereits Feldnamen je Anlage (z. B. `anlN_wegOrt`, [resources.ts:438](../../apps/mobile-web/src/i18n/resources.ts:438)), auf denen die Zuordnung aufsetzen kann. | H1, H2, M5 | Sichtbarkeit (Frage 2) von „kaum“ auf „ständig“. Größter Unterschied zu WISO und Taxfix. | **M** (Hero S; Delta-Banner + Zeilen-Chips M; volle Formularansicht L) |
| **2** | **Schätzung für alle Kern-Personas.** Renten (Besteuerungsanteil), Lohnersatz (Progressionsvorbehalt), Paare direkt aus den Interview-Antworten. Nie „0 €“, nie eine verschwundene Spanne, Chat und Cockpit aus einer Quelle. | K3, M5 | Vertrauen; P3 bekommt überhaupt erst einen Wert | **L** (Kern-Rechnung) / **S** (Spanne behalten statt löschen, „0 €“ verhindern) |
| **3** | **Ein Datenstrom und ein Fortschritt.** Interview setzt Familienstand, Zusammenveranlagung und Person B (mit Namen). Kinder bei Paaren standardmäßig „gemeinsam“. Ein durchgehendes „Abgabebereit: x von y“. | H3, H4, H7, M3 | Weniger Klicks, keine falschen Anlagen | **M** |
| **4** | **Eule absichern.** Vorschläge nur aus Nutzerangaben, Alternativen exklusiv (Auswahl statt Batch), Rechtsstand dynamisch, „Alles geprüft“ nur wenn wahr, Zeilen-Chip auf Entwürfen. | K1, M6 | Verhindert falsche Erklärungen und Vertrauensbruch | **S–M** |
| **5** | **Jahr und Frist richtig setzen.** Default = letztes abgeschlossenes Jahr. Laufendes Jahr als „vorbereiten“-Modus. Fristwarnung nur bei Pflichtveranlagung und mit korrekter Stufe. | K2, H5 | Keine Sackgasse am Ende, kein Fehlalarm | **S** |

**Quick Wins nebenher (je S):** Wortumbruch und abgeschnittene Titel (M1); Hilfezeile für die 10 häufigsten Fachbegriffe (M2); irrelevante Fragen und Kacheln ausblenden (M3); Labels der Partner-Felder (M8); „Fertig“ in der CH-Maske zeigt, was fehlt (H6, Teil).

---

## Umsetzung in diesem PR

Auftrag: die kritischen Befunde K1–K3 und die Hebel 1, 2, 3 und 5. Hebel 4 (Eule absichern) ist ausgenommen, nur der kritische Teil K1 ist umgesetzt. Der Branch enthält PR NexusHero/Steuereule#510.

| Befund / Hebel | Umgesetzt | Wo |
|---|---|---|
| **K1** Eule | Homeoffice-Entwurf nur mit den genannten Tagen (`commute.homeOfficeDays`, „80 Tage × 6 € = 480 €“); 210 Tage nur noch als Information. Sich ausschließende Entwürfe tragen `alternativeGroup`: Die API lehnt einen gemeinsamen Batch ab (`ADVISOR_BATCH_ALTERNATIVE_CONFLICT`), die Werkbank sperrt „Alle übernehmen“ und bietet „Diesen Weg übernehmen“ an. | `packages/core/src/interview/advisor*.ts`, `apps/api/src/advisor/`, `OwlModeScreen.tsx` |
| **K2** + Hebel 5 | Startjahr = letztes abgeschlossenes Jahr (2025). Das laufende Jahr ist als „läuft“ markiert, Cockpit, Abgabe und Ausdruck sagen das vorab. Unter der ersten Frage steht „Anderes Jahr“. Neue Kernfunktion `filingObligation` (pflicht/freiwillig/unklar). Der Fristbanner unterscheidet danach und folgt § 152 Abs. 2 AO (Zuschlag erst nach 14 Monaten zwingend). | `config/taxYear.ts`, `ShellState.tsx`, `DeadlinesBanner.tsx`, `packages/core/src/domains/filing-obligation.ts` |
| **K3** + Hebel 2 | Alleinstehende Rentner bekommen eine Spanne (Anlage R, 102 € Pauschbetrag, KVdR 11–13 % als Vorsorge, nichts einbehalten). Lohnersatz wird über den Progressionsvorbehalt gerechnet (§ 32b, abzüglich des ungenutzten Arbeitnehmer-Pauschbetrags), für Angestellte, Grenzgänger und Paare. Das Cockpit zählt die Rente als erfasstes Einkommen (nie mehr „0 €“). Lohnersatz gilt nicht mehr als „erfasst, nicht gerechnet“. Alle Eulen-Entwürfe holen ihre Wirkung aus der echten Schätzung (`previewEffectFor`), sonst steht dort „Wirkung noch offen“. | `packages/core/src/engine/tax-estimate.ts`, `married-estimate.ts`, `apps/api/src/tax-estimate/`, `apps/api/src/cockpit/` |
| Hebel 1 | Mit Spanne ist die Erstattung bzw. Nachzahlung die Hauptzahl, das Einkommen steht darunter. Wirkungszeile nach jeder Änderung („Deine letzte Änderung · Sonderausgaben (Anlage …): +48 € zu deinen Gunsten“). Jede Kachel nennt ihr Formular. | `CockpitScreen.tsx`, `effectMemory.ts`, `CockpitTiles.tsx`, `CockpitPartnerSection.tsx` |
| Hebel 3 | Das Interview-„Verheiratet“ setzt den Familienstand in den Stammdaten und legt die Zusammenveranlagung an, auch für Gäste nach dem Upgrade. Fortschritt 5/6 und 6/6 statt 0/4. „Dein Partner“ statt „Person B“. Ein neues Kind ist bei Paaren „gemeinsam“ vorbelegt. Ein reiner CH-Partner bekommt keine LStB-Kachel. Keine Alleinerziehenden-Kachel bei Paaren. „Für wen?“ sagt pro Frage, für wen gefragt wird, und dass Spenden für beide zählen. Katalogzähler „Frage 1 von 5“. Rentner-Formulierung der Auslandsfrage. | `link.service.ts`, `interview.service.ts`, `QuestionScreen.tsx`, `ChildrenScreen.tsx`, `CatalogScreen.tsx`, `tiles.ts` |

**Bewusst nicht umgesetzt:** amtliche Formular-Ansicht mit Zeilensprung (Hebel 1, groß), Rest von Hebel 4 (Rechtsstand dynamisch, „Alles geprüft“), Selbstständige in der Schätzung, Vorbelegung des Partnernamens aus dem Interview (das Interview kennt kein Textfeld).

## Grenzen dieses Reviews

- **KI im Basis-Modus:** Lokal war kein KI-Schlüssel gesetzt, getestet ist also der regelbasierte Fallback der Eule. Ein Durchgang mit echtem Modell steht noch aus.
- **PR #510** lief als eigener Build (eigene DB, eigene Ports). Bei Merge-Änderungen bitte H7 erneut prüfen.
- **Nicht durchlaufen:** echter Belegscan (OCR), „Bescheid prüfen“, Kapital/Vermietung, PDF-Erzeugung für 2025, ELSTER-Übermittlung, E-Mail-Bestätigung. Steuer-ID und Steuernummer habe ich bewusst nicht eingegeben.
- **Wettbewerbsvergleich:** Er beruht auf öffentlich bekanntem Produktverhalten, nicht auf einem Test im Rahmen dieses Reviews.
