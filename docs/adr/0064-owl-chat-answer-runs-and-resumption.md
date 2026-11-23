# ADR-0064 — Eulen-Chat: Antwort-Läufe, losgelöst von der Verbindung, mit Wiederaufnahme

- **Status:** Accepted
- **Date:** 2026-11-11
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** Ticket #476; `apps/api/src/advisor/` (insbesondere `run/`), `apps/api/src/ki/langgraph-advisor.engine.ts`, `packages/core/src/interview/{advisor,advisor-history,ki-port}.ts`, `apps/mobile-web/src/screens/advisor/`
- **Ergänzt:** ADR-0038 (KI-Port, Zero-Write), ADR-0051 (Eulen-Modus), ADR-0008 (verschlüsselte Felder)
- **Berührt:** ADR-0053 (Beta-Hosting auf Cloud Run), ADR-0056 (Job-Queue), Produkt-ADR-047 (Redis)

## Kontext

Bis #476 hing eine Antwort der Eule an der HTTP-Verbindung, über die sie gestreamt wurde. Riss die
Verbindung ab (Funkloch, Tab im Hintergrund, Proxy-Timeout), brach der bezahlte Modellaufruf ab und
es blieb eine Frage ohne Antwort im Verlauf. Die Antwort wurde erst gespeichert, wenn sie fertig
war; ein abgebrochener Teiltext existierte nur im Browser. Events hatten weder Kennung noch
Reihenfolge, das Modell bekam pauschal die letzten zehn Nachrichten als Text und wusste nicht, was
aus seinen eigenen Vorschlägen geworden war.

## Entscheidung

### 1. Eine Antwort ist ein Lauf mit eigenem Lebenszyklus

Die Assistenten-Nachricht wird angelegt, **bevor** das Modell gerufen wird, mit Status `streaming`
und einer Lauf-ID. Sie endet in genau einem von drei Zuständen: `complete`, `aborted` (gestoppt)
oder `failed`. Bei `aborted` und `failed` bleibt der bis dahin geschriebene Text erhalten; die
Nachricht trägt **keine** Vorschläge, weil eine halbe Antwort nichts Übernehmbares erzeugen darf.

Kein Pfad lässt eine Nachricht auf `streaming` stehen: Stopp, Zeitüberschreitung, ein Fehler in der
Engine, ein Leser, der geht, und das Herunterfahren der Instanz enden alle in einem Endzustand. Eine
Nachricht, deren Lauf keine Instanz mehr kennt (Absturz, Deployment), wird beim nächsten Laden der
Sitzung als `failed` markiert.

### 2. Der Lauf ist von der Verbindung losgelöst

`AdvisorRunService.start` prüft synchron (das Tageskontingent bleibt ein normaler HTTP-Fehler),
speichert Frage und Antwort-Platzhalter und lässt den Lauf dann ohne `await` weiterlaufen. Jedes
Event geht in ein **Lauf-Protokoll** (`AdvisorRunLog`) mit lückenloser Sequenznummer ab 1. Die
HTTP-Antwort liest nur aus diesem Protokoll; ihr Schließen beendet den Leser, nie den Lauf.

Zwei Implementierungen hinter demselben Port:

| | `InMemoryAdvisorRunLog` | `RedisAdvisorRunLog` |
| :--- | :--- | :--- |
| Wann | ohne `REDIS_URL` (lokal, Tests, eine Instanz) | mit `REDIS_URL` |
| Speicher | im API-Prozess | ein Redis Stream je Lauf, Eintrags-ID `<seq>-0`, Abschluss-Eintrag `end` |
| Wiedereinhängen | nur an derselben Instanz | an jeder Instanz |
| Stopp | lokaler Listener | Pub/Sub, erreicht die ausführende Instanz |
| Aufbewahrung | 5 Minuten nach Ende | 5 Minuten nach Ende (TTL), 15 Minuten für nie beendete Läufe |

Die Events im Protokoll sind flüchtig und laufen mit dem Stream ab. Dauerhaft gespeichert wird nur
die Nachricht selbst, feldverschlüsselt wie bisher.

### 3. Protokoll über SSE

`POST …/advisor/stream` startet einen Lauf und streamt ihn. Jedes Event trägt seine Sequenznummer
als SSE-`id:`; das erste Event ist `start` mit Lauf-ID, gespeicherter Frage und ID der Antwort.
`GET …/advisor/runs/{runId}/events` liefert die Events nach `Last-Event-ID` (oder `?after=`).
Neu sind die Events `start` und `reasoning`. Ein Kommentar-Heartbeat alle 15 Sekunden hält träge
Proxys offen. Ein fremder Lauf antwortet wie ein unbekannter: 404.

Der Client liest über `followRun`: Endet die Verbindung ohne `done` oder `error`, hängt er sich mit
der letzten Sequenznummer wieder ein (bis zu sechs Versuche mit wachsendem Abstand) und verwirft
Events, die er schon hatte. Kennt der Server den Lauf nicht mehr, lädt der Client die Sitzung neu;
dort steht der Endzustand.

### 4. Nur Stopp beendet eine Antwort

`POST …/advisor/runs/{runId}/stop` ist der einzige Weg, einen Lauf vorzeitig zu beenden. Der
Stopp-Knopf schließt die Verbindung **und** ruft diesen Endpunkt. Eine Antwort, die nach einem
Verbindungsabriss fertig läuft, zählt aufs Tageskontingent: Sie wurde bestellt und geliefert. Die
Zeitgrenze je Antwort (`turnTimeoutMs`) gilt unverändert und begrenzt verwaiste Läufe.

### 5. Gedankengang: Zusammenfassungen der Anbieter, kein Rohtext

Mit `AI_ADVISOR_REASONING=summary` fordert die Engine vom Anbieter eine Reasoning-Zusammenfassung
an (Anthropic Extended Thinking, Gemini `includeThoughts`, OpenAI Responses-API). Sie kommt als
eigenes Event, nie als Teil der Antwort, wird mit der Nachricht feldverschlüsselt gespeichert
(`gedankengang`) und im Chat als einklappbarer Block mit dem Vermerk „Überlegungen der KI, keine
Auskunft“ gezeigt. Liefert das Modell nichts, zeigt der Block nur die Arbeitsschritte.

Die Option ist **standardmäßig aus**: Sie braucht ein Modell, das sie unterstützt, und kostet
Tokens. Anthropic lehnt einen erzwungenen Tool-Aufruf ab, solange Thinking aktiv ist; der
erzwungene Plan („Was hab ich vergessen?“) wird dort stattdessen im Prompt verlangt.

### 6. Gedächtnis nach Token-Budget

`buildAdvisorHistory` (Core, rein) ersetzt „die letzten zehn“: Die neuesten Züge bleiben wörtlich
bis zum Budget (Standard 3.000 geschätzte Tokens), jede frühere Antwort der Eule trägt eine Zeile
je Vorschlag mit dessen Ausgang (offen, übernommen, verworfen …), und alles Ältere wird zu **einer**
vorangestellten Notiz. Die Notiz entsteht deterministisch, ohne Modellaufruf. Der gespeicherte
Vorher-Wert eines Feldes geht nicht in den Prompt.

### 7. Systemprompt mit stabilem Präfix

Der Systemprompt besteht aus einem für alle gleichen Regelteil und dem fallbezogenen Teil (aktive
Maske, CaseDigest). Der Regelteil steht vorn; bei Anthropic trägt er einen expliziten
Cache-Breakpoint, die anderen Anbieter cachen ein wiederholtes Präfix selbst. Nichts Fallbezogenes
darf in den Regelteil wandern; ein Test hält das fest.

### 8. Messung je Antwort

Zu jeder Antwort werden Eingabe-, Ausgabe- und gecachte Tokens, die Zeit bis zum ersten Wort, die
Dauer und eine Trace-ID (die Lauf-ID) gespeichert (`verbrauch`, unverschlüsselt, ohne Inhalt) und
als eine strukturierte Logzeile `advisor_turn` geschrieben. Der Client bekommt diese Daten nicht.

### 9. Bewertung und Verlauf leeren

Eine fertige Antwort lässt sich mit Daumen hoch oder runter bewerten, bei „runter“ mit einem Grund
aus einer festen Liste. Es gibt keinen Freitext und keinen Klartext-Export aus dem Verlauf.
„Verlauf leeren“ löscht das Gespräch eines Steuerjahres; übernommene Werte bleiben in der
Erklärung. Solange eine Antwort läuft, wird das Leeren abgelehnt (409).

## Folgen

- **Mehrere API-Instanzen brauchen Redis.** Ohne `REDIS_URL` kann sich ein Client nur an der
  Instanz wieder einhängen, die den Lauf ausführt; landet er woanders, sieht er 404 und danach den
  Endzustand aus der Sitzung. Das ist korrekt, aber nicht nahtlos. Redis in Produktion hängt an #292.
- **Cloud Run (ADR-0053):** Ein Lauf, dem niemand zuhört, hat keine offene Anfrage. Mit
  anfragebasierter CPU-Zuteilung steht er dann still. Für die losgelöste Generierung muss der Dienst
  mit „CPU always allocated“ laufen. Das ist in der Infrastruktur noch nicht umgesetzt.
- **Ein Lauf lebt im API-Prozess, nicht in einem Worker.** Stirbt die Instanz, endet die Antwort
  als `failed`. Ein eigener Worker über die Job-Queue (ADR-0056) wäre robuster und ist bewusst nicht
  Teil dieser Entscheidung: Der Port `AdvisorRunLog` trennt Ausführung und Lesen schon so, dass ein
  Worker später nur die ausführende Seite ersetzt.
- **Ein abgerissener Leser kostet jetzt Geld.** Früher sparte ein geschlossener Tab den Rest des
  Modellaufrufs. Begrenzt wird das durch die Zeitgrenze je Antwort und das Tageskontingent.
- **Es gibt weiterhin keinen Filter für den Antworttext.** `advisor-safety.ts` prüft Schreibziele,
  nicht Text. Das gilt für die Antwort wie für den Gedankengang und ist ein eigenes Vorhaben.

## Verworfene Alternativen

- **Abriss heißt Abbruch (Stand vor #476).** Einfach, aber auf dem Handy ärgerlich und teuer in der
  Wahrnehmung: Die Frage ist bezahlt, die Antwort weg.
- **Teiltext laufend in Postgres schreiben, Client fragt nach.** Braucht kein Redis, erzeugt aber
  pro Antwort Dutzende verschlüsselte Schreibvorgänge und fühlt sich durch das Nachfragen träge an.
- **BullMQ-Worker sofort.** Sauber skalierbar, aber ein neuer Prozess und ein neues Deployment für
  ein Feature, das auch im API-Prozess korrekt ist. Der Port hält den Weg offen.
- **Rohes Reasoning zeigen.** Maximale Transparenz, aber das Modell kann dort Aussagen treffen, die
  wie Einzelfallberatung wirken, und es gibt keinen Textfilter, der sie abfinge.
- **Fassungen einer Antwort („1/2“).** Erwogen und verworfen: „Neu generieren“ ersetzt weiter die
  letzte Antwort (#451), damit nie unklar ist, welcher Vorschlag gilt.

## Nachweis

- Lebenszyklus, Bewertung, Leeren: `apps/api/test/advisor-lifecycle.test.ts`, gegen echtes Postgres
  `advisor-lifecycle.integration.test.ts` (inkl. Verschlüsselung des Gedankengangs im Rohzugriff).
- Lauf-Protokoll: `advisor-run-log.test.ts`, gegen echtes Redis `advisor-run-log.redis.integration.test.ts`.
- Losgelöste Läufe, Wiederaufnahme, Stopp, Besitz: `advisor-run.service.test.ts`, über HTTP
  `advisor-runs.http.test.ts`.
- Reasoning, Verbrauch, Prompt-Präfix: `langgraph-advisor.reasoning.test.ts`.
- Gedächtnis: `packages/core/src/interview/advisor-history.test.ts`.
- Client: `chat/runStream.test.tsx`, `CopilotBridgeResume.test.tsx`, `AdvisorChatPanelLifecycle.test.tsx`.

**Nicht nachgewiesen:** Anthropic und OpenAI. Gegen Gemini siehe Nachtrag.

## Nachtrag (11.11.2026): Lauf gegen das echte Modell

Mit einem echten Gemini-Schlüssel (`gemini-3.8-flash`) liefen `scripts/ai-eval/reasoning-check.ts`
und ein Kundenszenario im Browser (`e2e/advisor/customer-chat-scenario.mjs`): ein neuer Kunde, acht
Nachrichten, der jeden Vorschlag übernimmt. Im ersten Durchlauf stand danach **nichts** in der
Erklärung. Vier Ursachen, alle schon vor #476 vorhanden und hier behoben:

1. **Werkzeug-Schema.** Jedes `z.record` erzeugt `propertyNames`; Gemini antwortet darauf mit 400,
   und die Engine fiel ohne Spur auf die deterministische Antwort zurück. Das Modell bekommt das
   Schema jetzt ohne solche Schlüsselwörter (`toProviderToolSchema`); fehlgeschlagene Modellaufrufe
   werden geloggt.
2. **Feldnamen.** Das Modell kannte die Feldnamen der Masken nicht und leitete sie aus dem
   CaseDigest ab (`grossWageEur` statt `bruttoarbeitslohn`). Solche Entwürfe ließen sich nicht
   übernehmen. Der stabile Teil des Systemprompts nennt jetzt alle Felder, die die Eule vorschlagen
   darf (aus `WRITABLE_FIELDS_BY_SCREEN`, ohne die geschützten), samt erlaubter Werte; ein
   unbekanntes Feld wird schon beim Entwurf mit der Liste der gültigen abgelehnt.
3. **Übernehmen ohne Rückmeldung.** Scheiterte die Übernahme, passierte auf dem Bildschirm nichts.
   Der Chat zeigt jetzt die Meldung des Servers.
4. **Datenschutz-Wächter.** Der Fingerprint eines Eulen-Hinweises ist ein 16-stelliger Hex-Hash
   und kann die Form einer IBAN haben. Er hängt am Hinweis, nicht am Nutzer: Jeder mit dem Hinweis
   „Fortbildung ohne Fahrt“ für 2026 verlor den Chat an „IBAN detected“. `checkPiiFree` nimmt genau
   diese Form im Feld `fingerprint` jetzt aus.

Dazu zwei Anpassungen am Ablauf: Nach der letzten Werkzeug-Runde muss das Modell in Worten antworten
(sonst endete die Antwort als „Ich habe deine Steuerakte geprüft.“), und das Zeitlimit je Antwort
ist 60 statt 25 Sekunden, weil mit Reasoning schon das erste Wort 10 bis 20 Sekunden brauchte.

Stand nach dem vierten Durchlauf: Lohnsteuerbescheinigung vollständig, Arbeitsweg 38 km mit Pkw,
60 Homeoffice-Tage, Spende 300 €, Grundangaben; die Schätzung zeigt eine Erstattungsspanne.

**Zweite Runde (gleicher Tag): die offenen Punkte**

- **Fortbildungskosten als Betrag.** Neue Folgefrage `fortbildung-kosten` hinter „Fortbildung: Ja“.
  Die Schätzung rechnet sie als Werbungskosten; die Eule trägt sie zusammen mit `fortbildung: Ja`
  ein. Die Vorschau der Eule rechnet nicht mehr pauschal 450 € ein: Ohne Betrag nennt sie keine
  Wirkung. Vorher versprach sie eine Erstattung, die in der Schätzung nie vorkam.
- **Urlaubs- und Krankheitstage.** Die Eule fragt danach, bevor sie Pendeltage als fertig bezeichnet.
- **Entwurf mit mehreren Feldern auf einem neuen Datensatz.** Das erste Feld legte den
  Arbeitsweg-Datensatz mit Standardwerten an (Mo–Fr), das nächste Feld desselben Entwurfs wurde
  dann als „zwischenzeitlich geändert“ abgelehnt. Innerhalb einer Übernahme vergleicht der Schreibweg
  für einen Datensatz, den er selbst schon geschrieben hat, jetzt mit dem aktuellen Stand; die
  Prüfung aller Ausgangswerte vor dem ersten Schreiben bleibt.

Stand nach dem letzten Durchlauf (neun Nachrichten): Lohnsteuerbescheinigung vollständig; Arbeitsweg
38 km mit Pkw, 30 Urlaubs- und 5 Krankheitstage, 60 Homeoffice-Tage, daraus 166 Pendeltage und
2.397 € Entfernungspauschale; 850 € Fortbildung; 300 € Spende. Werbungskosten 3.607 €
(2.397 + 360 + 850), Erstattungsspanne 2.355 bis 2.439 €.

**Was offen bleibt**

- Der Fortbildungsbetrag ist nur über die Eule eintragbar und sichtbar. Die Frage gehört zum
  zweiten Interview-Abschnitt, der in der App noch keine Oberfläche hat (#321).
- Zeit bis zum ersten Wort im Median rund 12 Sekunden; rund 115.000 Eingabe-Tokens für neun
  Nachrichten, davon knapp 40 % aus dem Cache.
- Stammdaten trägt der Nutzer weiter selbst ein (gewollt); die Interview-Frage „Ausland“ blieb offen.
- Der Lauf hängt vom Modell ab: In einem von sechs Durchläufen wählte es für `transport` einen
  ungültigen Wert, bevor die erlaubten Werte im Prompt standen. Das Skript berichtet, es prüft nicht.
