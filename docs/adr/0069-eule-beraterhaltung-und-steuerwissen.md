# ADR-0069 — Eule: Beraterhaltung immer, Steuerwissen zum Nachschlagen, alle Steuerthemen

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** Ticket #499; `.agents/skills/steuerberater/`, `apps/api/src/ki/{advisor-stance,advisor-knowledge.generated,advisor-income-tax,advisor-tools,advisor-tool-round,advisor-prompt,advisor-topic-guard,ai-runtime-config.service}.ts`, `packages/core/src/interview/{advisor,advisor-answer-check,advisor-topic}.ts`
- **Ergänzt:** 2026-11-13, Abschnitt „Themengrenze nach außen“
- **Ändert:** ADR-0038 und ADR-0066, soweit sie die Eule auf die private Einkommensteuererklärung begrenzen

## Kontext

Der Product Owner hat einen Skill „steuerberater“ geschrieben: Haltung und Arbeitsablauf eines
gründlichen Steuerberaters, acht Wissensdateien und einen Tarifrechner. Er soll in der Eule immer
gelten. Der Skill ist für einen Coding-Agenten gebaut (liest Dateien, führt ein Python-Skript aus,
schlägt im Netz nach); die Eule kann nichts davon.

## Entscheidung

1. **Die Haltung steht im festen Teil des Prompts jeder Antwort** (`ADVISOR_STANCE`): erst fragen,
   Fundstelle nennen, Steuerjahr festnageln, nie im Kopf rechnen, zwei Wege bei Spielraum, legal
   gestalten, ehrlich über Grenzen. Sie ist kein abschaltbarer Skill.
2. **Das Wissen wird nachgeschlagen, nicht mitgeschickt.** `lookup_tax_knowledge` liefert einen
   der Abschnitte. Die Quelle ist der Skill-Ordner `apps/api/skills/steuerberater/`; wie er in
   den Code kommt, regelt „Skills als Dateien“ unten. `quellen.md` (Nachschlagen im Netz) wird
   nicht ausgeliefert.
3. **Gerechnet wird mit dem Rechenkern.** `compute_income_tax` rechnet Tarif, Soli und
   Kirchensteuer mit `packages/core/src/math`, nicht mit dem Python-Skript. Der Kern rundet Soli
   und Kirchensteuer auf volle Euro ab, das Skript auf Cent; die Einkommensteuer ist identisch.
4. **Es gelten die Zahlen der App.** Die Tabelle `kennzahlen` ergänzt, was die App nicht rechnet.
   Ein mit „prüfen“ markierter Wert wird als unsicher genannt. Ein Test vergleicht den
   Grundfreibetrag der Tabelle mit dem Kern.
5. **Die Themengrenze innerhalb der Steuer entfällt.** Die Eule berät erklärend auch zu Umsatzsteuer, Selbstständigen
   und Gewerbe, Erbschaft und Schenkung, Verfahren. Entwürfe gibt es weiter nur für die Felder der
   App, und Zero-Write gilt unverändert. Entfernt sind die Ablehnung solcher Fragen vor dem
   Modellaufruf und der Hinweis „gehört nicht zur privaten Einkommensteuererklärung“.
6. **Was bleibt:** keine verbindliche Rechtsauskunft (wird weiter vor dem Modell abgelehnt), keine
   Hilfe bei Hinterziehung, der Schutz vor Prompt-Injection, die PII-Prüfung, der Verweis an
   einen zugelassenen Steuerberater in den Fällen aus B8, und die Prüfung „Betrag nicht von der
   App berechnet“.

7. **Maßstab ist die Eule für zahlende Nutzer.** Jede Datei des Wissens trägt „Stand: Datum,
   geprüft für die Steuerjahre X–Y“. Die Beträge des geltenden Rechts sind am Gesetzestext
   abgeglichen (12.11.2026: 109 Stellen in EStG, UStG, AO, GewStG, ErbStG, SolZG). Was nicht am
   Gesetz belegt ist (Verwaltungspraxis, Rechtsprechung), bleibt mit „(nicht belegt)“ stehen, und
   die Eule nennt es als unsicher. Ein Test schlägt an, sobald der Rechenkern ein Steuerjahr
   kennt, für das das Wissen nicht geprüft ist.
8. **Bewährung von Hand.** `pnpm --filter @steuereule/api test:eval` stellt 21 typische
   Beratungsfragen an das echte Modell und prüft, was eine gute Antwort enthalten muss (Norm,
   Betrag, Rückfrage, nachgeschlagen, gerechnet). Kein Gate, kein nächtlicher Lauf: Er läuft, wenn
   der Skill oder der Prompt sich ändert.

## Themengrenze nach außen (ergänzt 2026-11-13)

Punkt 5 öffnet die Eule für alle Steuerthemen. Für alles andere war sie bis hierhin leicht zu
benutzen: Vor dem Modell standen nur drei Wortmuster (Kuchenrezept, „schreibe ein Gedicht“,
Hinterziehung), im Prompt stand nichts. „Schreib mir ein Gedicht“, jede englische Frage und jede
Umschreibung kamen durch. Entscheidungen des Product Owners vom 13.11.2026:

9. **Grenze: Steuer und was direkt hineingreift.** Erlaubt sind die eigenen Steuerangelegenheiten
   (alle Steuerarten aus Punkt 5), die Bedienung der App und was direkt in die Steuer greift:
   Belege, Post vom Finanzamt, Riester/Rürup, Kindergeld, Elterngeld, Lohnabrechnung. Abgelehnt
   wird alles andere, auch allgemeine Finanz-, Rechts- und Gesundheitsfragen.
10. **Ein Vorab-Prüfer entscheidet, nicht eine Wortliste.** Ein kleines Modell im eigenen KI-Slot
    `advisor_guard` (`AI_GUARD_PROVIDER`/`_MODEL`/`_API_KEY`/`_TIMEOUT_MS`; Standard: das kleine
    Modell des Chat-Anbieters, Temperatur 0, 5 s) ordnet jede getippte Nachricht als `tax`, `gray`
    oder `off_topic` ein, mit grober Kategorie und Sprache. Er sieht die Nachricht und die letzten
    zwei Runden, damit „Und 2025?“ als Steuerfrage erkannt wird, und behandelt die Nachricht als
    Daten, nicht als Anweisung. Er läuft vor dem Hauptmodell, nicht parallel: Eine Ablehnung kostet
    einen kleinen Aufruf und keinen großen. Im Admin-Panel einstellbar wird der Slot mit #445; bis
    dahin über die Umgebung wie die anderen Slots.
11. **Was der Prüfer sagt, und was folgt.**
    - `off_topic`: ein fester Satz („Dabei kann ich dir nicht helfen – ich bin nur für deine
      Steuern da.“) in der Sprache der Frage (de, en, tr, fr, it, es, pl; sonst Deutsch) und bis zu
      drei Vorschläge aus den offenen Hinweisen des Falls. Kein Hauptmodell, also nicht
      überredbar und kostenlos.
    - `gray` (z. B. „ETF oder Bausparvertrag?“): Das Hauptmodell antwortet mit dem Zusatz, nur den
      steuerlichen Teil zu beantworten.
    - `tax`: wie bisher.
    - **Kein Urteil** (Ausfall, Timeout, unlesbare Antwort, nicht eingerichtet): Die Nachricht geht
      durch (fail-open). Zweite Verteidigung sind die Themenregel im Prompt (Leitplanke 0) und die
      Angriffsmuster (`PROMPT_INJECTION_PATTERNS`), die vor jedem Modell kostenlos greifen.
12. **Nur getippter Text wird geprüft.** Eine Eröffnung (der Server ersetzt ihren Text) und ein
    angetippter Vorschlag oder eine Antwort einer Fragerunde der letzten Antwort, Zeichen für
    Zeichen, überspringen den Prüfer. Den Abgleich macht der Server, kein Client-Flag.
    Schnellstarts und Skills werden geprüft, weil ihr Text vom Client kommt.
13. **Über sich selbst spricht die Eule nicht.** Fragen nach Anweisungen, Regeln, Prompt,
    Werkzeugen und auch nach ihren Fähigkeiten („Was kannst du?“) zählen als `off_topic` (Kategorie
    `meta`) und bekommen den festen Satz.
14. **Hinterziehung wird erklärt, nie unterstützt.** Die Wortmuster dafür sind entfernt. Eine
    ehrliche Frage („Ist das schon Hinterziehung, wenn ich die Zinsen vergessen habe?“) geht ans
    Hauptmodell, das Rechtslage, Folgen, Berichtigung (§ 153 AO) und Selbstanzeige (§ 371 AO)
    erklärt und jede Hilfe beim Verschleiern ablehnt.
15. **Sprache:** Die Eule antwortet in der Sprache der Frage; Formulare, Anlagen, Zeilen und
    Fachbegriffe bleiben deutsch. Ihr Gedankengang bleibt deutsch.
16. **Gezählt wird ohne Text.** Das Urteil (Verdict, Kategorie, Sprache, bei Ausfall der Grund)
    steht in der internen `engine`-Info der Antwort, die der Client nie sieht, und im Log
    `advisor_turn`. Daraus ergibt sich die Zahl je Nutzer und Tag. Gesperrt oder gedrosselt wird
    niemand.
17. **Bewährung.** Unit-Tests mit festen Urteilen prüfen die Verdrahtung in jeder CI
    (`advisor-topic-guard.test.ts`, `advisor-topic-boundary.test.ts`). `test/eval/topic-guard.eval.test.ts`
    misst gegen das echte Modell, nächtlich und vor jedem Modellwechsel: mindestens 90 % von rund
    40 Zweckentfremdungsversuchen abgelehnt, höchstens 5 % von rund 40 Steuer- und
    Grauzonenfragen fälschlich abgelehnt, und mit ausgefallenem Prüfer hält die Regel im Prompt.
    Die fertige Antwort wird nicht nachgeprüft: Sie ist beim Streamen schon gelesen.

## Skills als Dateien (ergänzt 2026-11-13)

Entscheidung des Product Owners: Ein Skill der Eule liegt wie bei Claude als Ordner mit Textdateien
im Repo und wird beim Bauen wörtlich eingelesen, nicht von Hand in TypeScript abgeschrieben.

18. **Ablage:** `apps/api/skills/<id>/SKILL.md` (Frontmatter `name`, `description`, `activation`,
    `command`, `references`; darunter die Anweisungen) und `references/*.md`. Die Haltung ist der
    Skill `steuerberater` mit `activation: always`; das Berater-Interview ist `berater-interview`
    mit `activation: user` und `command: grill-me`. `advisor-stance.ts` und der handgeschriebene
    Interview-Text entfallen.
19. **Beim Bauen, nicht zur Laufzeit:** `scripts/generate-skills.ts` schreibt
    `src/ki/skills.generated.ts` (nicht eingecheckt). Es läuft bei `install`, `build`,
    `typecheck` und `test`. Ausgeliefert wird nur das gebaute Modul; zur Laufzeit liest die API
    keine Skill-Datei. Der Drift-Test zwischen Skill und eingechecktem Modul entfällt damit.
20. **Der Bau bricht ab, wenn ein Skill nicht stimmt:** Frontmatter fehlt oder ist unlesbar, `name`
    ungleich Ordner, unbekannte `activation`, leere Anweisungen, eine Referenz ohne Datei, nicht
    genau ein `always`-Skill, oder die `user`-Skills und ihre Befehle weichen von
    `ADVISOR_SKILL_IDS`/`ADVISOR_SKILL_COMMANDS` in `packages/core` ab. Die Liste dort bleibt die
    typisierte Quelle für API-Schema und Oberfläche.
21. **Coding-Agent und Eule teilen das Wissen, nicht die Anweisungen.** `.agents/skills/steuerberater/`
    behält sein eigenes `SKILL.md` (Python-Skript, Websuche) und liest `references/` per Symlink
    aus dem Ordner der Eule.

## Rechnen statt Überschlagen (ergänzt 2026-11-13)

22. **Neue Werkzeuge auf den geprüften Kern.** `compare_filing_types` (Zusammen- gegen
    Einzelveranlagung, `filingTypeComparison`) und `check_capital_taxation` (Günstigerprüfung
    § 32d Abs. 6, `mostFavourableCheck`). Ist unbekannt, ob es Lohnersatz gab, ist das Ergebnis
    `open` statt einer geratenen Empfehlung.
23. **Progressionsvorbehalt exakt.** `progressionClauseTax` im Kern wendet den besonderen
    Steuersatz (§ 32b Abs. 2 EStG) an; `compute_income_tax` nimmt `wageReplacementEur`. Die alte
    Anleitung im Wissen („zweimal rechnen“) war falsch und ist ersetzt. Wie das Finanzamt den
    Satz rundet, ist nicht am Gesetz belegt; der Kern rechnet ihn ungerundet.
24. **Fehler im Kern behoben:** Die Günstigerprüfung zog den Sparer-Pauschbetrag nur auf der
    Seite der Abgeltungsteuer ab. § 20 Abs. 9 EStG gilt für beide Seiten; der persönliche Satz
    wirkte dadurch zu teuer, auch in der Maske „Kapital“.
25. **§ 35a und § 33 ehrlich.** Die Felder dafür gibt es, die Schätzung zählt sie aber nicht,
    solange `HOUSEHOLD_AND_HEALTH_BOOSTERS` aus ist (#443 Slice 5, angehalten: GdE und
    Druckmappings fehlen). Ein Entwurf dort zeigt deshalb „nicht berechenbar“ statt 0 €, und der
    Sparplan fragt danach, wenn nichts eingetragen ist.

## Fristen, Termine und Prüfungen (ergänzt 2026-11-13)

26. **Einspruchsfrist genau.** `appealDeadlineEnd` rechnet ab der Bekanntgabe: Bescheiddatum
    plus vier Tage (ab 2025, vorher drei; § 122 Abs. 2 AO), ein Tag am Wochenende oder Feiertag
    geht auf den nächsten Werktag, dann ein Monat, das Ende ebenso verschoben (§ 108 Abs. 3 AO).
    Ohne Bundesland zählen nur bundesweite Feiertage, damit die Frist nie später ist als die
    echte. Bisher: Bescheiddatum plus ein Monat, also bis zu einer Woche zu früh.
27. **Termine.** Die Eule bekommt die festen Termine der nächsten 90 Tage
    (`upcomingTaxDates`: Vorauszahlungen, Verlustbescheinigung 15.12., Zahlungen bis 31.12.,
    Abgabefristen), nichts über den Fall Angenommenes.
28. **Sparhebel mit Schwellen.** Liegen die eingetragenen Werbungskosten bis 300 € unter der
    Pauschale, fragt der Sparplan nach Vergessenem; mehr als 600 € darüber schlägt er den
    Lohnsteuer-Freibetrag (§ 39a) vor. Lohnersatz über 410 € nennt er als Pflichtveranlagung.
29. **Neue Werkzeuge.** `check_holding_period` (§ 23 EStG: Fristen auf den Tag, eigene Wohnung,
    Freigrenze 600/1.000 €) und `check_rental_repairs` (15-%-Grenze, § 6 Abs. 1 Nr. 1a EStG).

## Schenkung, Selbstständige, Kennzahlen (ergänzt 2026-11-13)

30. **Neue Rechner im Kern, als Werkzeuge der Eule:** `compute_gift_tax` (ErbStG: Klasse,
    Freibeträge §§ 16, 17, Sätze mit Härteausgleich § 19 Abs. 3, zehn Jahre § 14; Befreiungen und
    Bewertung bleiben Rückfrage), `check_small_business` (§ 19 UStG, Grenzen bis 2024 und ab 2025)
    und `estimate_trade_tax` (Überschlag GewStG mit Anrechnung § 35 EStG, ohne Kappung an der
    anteiligen Einkommensteuer). Damit entfällt die Überschlagsrechnung für diese Themen.
31. **Kennzahlen gegen den Kern.** `advisor-kennzahlen.test.ts` liest die Tabelle des Skills und
    vergleicht Soli-Freigrenzen, Kindergeld, Kinder- und BEA-Freibetrag, Entlastungsbetrag,
    Pauschbeträge, Entfernungspauschale, Homeoffice, § 35a, sonstige Vorsorge und die Abgabefristen
    2023–2026 mit `getTaxYearParameters`. Heute stimmt alles überein. Punkt 4 und „Verworfen:
    Skill-Tabelle als maßgebliche Zahlenquelle“ gelten weiter: Der Kern rechnet, der Test findet
    nur Abweichungen.
32. **Belegt am 13.11.2026** (gesetze-im-internet.de): Kinderbetreuung 80 %, höchstens 4.800 €
    (§ 10 Abs. 1 Nr. 5), Übungsleiter 3.300 € (§ 3 Nr. 26), Ehrenamt 960 € (§ 3 Nr. 26a),
    Parteispenden höchstens 1.650/3.300 € (§ 34g). Offen bleibt, ab welchem Jahr § 34g in dieser
    Höhe gilt, und ob „in allen offenen Fällen“ (§ 52 Abs. 4 S. 10) auch die Beträge von § 3
    Nr. 26, 26a für frühere Jahre meint.

## Gesetze ändern sich (ergänzt 2026-11-13)

33. **Wächter.** `apps/api/scripts/check-law-changes.ts` liest jede Norm, die der Skill zitiert
    oder der Quellenkatalog nennt (heute 102), von gesetze-im-internet.de und vergleicht Wortlaut
    und Fußnoten mit dem Fingerabdruck in `skills/steuerberater/law-watch.json`. Nächtlich in CI
    (`law-watch.yml`); bei einer Änderung öffnet er ein Issue oder ergänzt das offene. Angepasst
    werden Skill und Rechenkern von Hand, danach `laws:check --update`. Ein Test schlägt an, wenn
    der Skill eine Norm zitiert, die der Wächter noch nicht kennt.
34. **Die Eule liest den Wortlaut.** `read_law_text` holt eine Norm (oder einen Absatz, eine
    Nummer) von gesetze-im-internet.de: nur diese Seite, nur die gelisteten Steuergesetze, die
    Adresse baut der Server. Der Text kommt als Daten mit Hinweis zurück, einen Tag zwischengespeichert,
    auf 4.000 Zeichen gekürzt, mit den Anwendungshinweisen der Seite. B3 macht das Lesen zur
    Pflicht, wenn eine Norm die Antwort trägt. Damit ist Punkt 2 („kein Netz“) für diese eine
    Quelle aufgehoben.
35. **Heute ist nicht das Steuerjahr.** Die Seite zeigt nur die geltende Fassung. Für ein früheres
    Jahr sagt die Eule das dazu; welche Fassung gilt, regeln § 52 EStG und Art. 97 EGAO. Beträge
    der Erklärung bleiben die der App: Ändert sich ein Gesetz, muss erst der Rechenkern folgen
    (Punkt 33), sonst sagt die Eule etwas anderes, als die App rechnet.
36. **Quellenkatalog geprüft.** Die neun Zusammenfassungen sind am 13.11.2026 gegen den Wortlaut
    gelesen (`LEGAL_SOURCES_CHECKED_ON`); die Kinderbetreuung nennt jetzt 80 %/4.800 €. Das
    Rechtsstand-Datum der Eulen-Karten (`LEGAL_STATUS_DATE`, 01.01.2025) ist davon getrennt und
    nicht neu geprüft.

## Offen und Risiken

- **Rechtlich ungeprüft.** Geschäftsmäßige Hilfeleistung in Steuersachen ist nach dem
  Steuerberatungsgesetz zugelassenen Personen vorbehalten. Punkt 5 ist die Entscheidung des
  Product Owners vom 12.11.2026; eine rechtliche Prüfung vor dem Verkauf steht aus.
- Für Umsatzsteuer und Erbschaftsteuer gibt es keinen Rechner in der App. Die Eule zeigt dort
  Formel und Schritte und nennt es eine Überschlagsrechnung; die Prüfung der Antwort markiert
  Wirkungsbeträge, die kein Werkzeug gerechnet hat.
- Das Wissen ist so aktuell wie der Skill; der Bau liest es jedes Mal neu ein.
- Nicht gegen ein echtes Modell erprobt: ob das Modell zuverlässig nachschlägt, bevor es antwortet.
- Die Themengrenze ist noch nicht gegen das echte Modell gemessen; die Schwellen (90 % / 5 %) sind
  Startwerte. Der Prüfer kostet jede getippte Nachricht einen kleinen Aufruf und etwa 0,3–1 s bis
  zum ersten Wort.
- Mit Tricks in der Nachricht lässt sich auch der Prüfer täuschen. Dann bleibt die Regel im Prompt.
- `read_law_text` hängt an einer fremden Seite: Ändert sie ihren Aufbau, schlagen Werkzeug und Wächter fehl (der Wächter meldet „nicht erreichbar“). Ob das Modell vor jeder tragenden Norm wirklich liest, ist noch nicht gegen das echte Modell gemessen.

## Verworfen

- **Alles Wissen fest in den Prompt:** rund 40 KB je Antwort, langsamer, teurer.
- **Das Python-Skript auf dem Server ausführen:** zweiter Rechenweg neben dem geprüften Kern.
- **Themengrenze nur per Wortliste oder nur im Prompt:** Wortlisten sind lückenhaft und lehnen
  ehrliche Fragen ab; eine Regel nur im Prompt lässt sich wegreden.
- **Prüfer parallel zum Hauptmodell:** schneller, aber jede Ablehnung bezahlt den großen Aufruf mit.
- **Skill-Tabelle als maßgebliche Zahlenquelle:** zwei Quellen, die auseinanderlaufen können.
