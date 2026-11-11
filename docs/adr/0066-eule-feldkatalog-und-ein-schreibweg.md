# ADR-0066 — Eule: ein Feldkatalog, eine Wertprüfung, ehrliche Vorschau

- **Status:** Accepted
- **Date:** 2026-11-11
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/interview/{field-catalog,record-handles,ki-port,advisor}.ts`, `apps/api/src/ki/{langgraph-advisor.engine,advisor-safety}.ts`, `apps/api/src/advisor/advisor.service.ts`, `apps/api/src/confirmation/confirmation.service.ts`, `apps/api/test/live/`, `.github/workflows/ai-eval-nightly.yml`
- **Ergänzt:** ADR-0038 (KI-Port, Zero-Write), ADR-0051 (Eulen-Modus), ADR-0064 (Antwort-Läufe)
- **Nummer:** 0065 ist von einem parallelen Zweig belegt (Adresssuche), deshalb 0066.

## Kontext

Die Eule soll die Steuererklärung über den Chat füllen können. Der Durchlauf gegen das echte
Modell (#476) hat gezeigt, wo das nicht trägt:

- Die Liste der Felder, die das Modell kennt, die Liste der Felder, die geschrieben werden dürfen,
  und die Regeln, welcher Wert in ein Feld passt, lagen an drei Stellen. 51 Felder speicherten auf
  dem Schreibweg der Eule jeden Wert, auch offensichtlichen Unsinn; eine ungültige Interview-Antwort
  machte danach das ganze Interview des Nutzers unlesbar.
- Eine Antwort konnte genau einen Entwurf tragen. Nannte der Nutzer drei Dinge, entstand einer,
  und der Antworttext behauptete drei.
- Vermietungsobjekte und Kinder sind mehrere Datensätze. Das Modell kannte ihre Kennungen nicht
  und erfand welche („1“, „Objekt 1“); die Entwürfe ließen sich nie übernehmen.
- Die Vorschau „bringt +X €“ kam aus einer Näherung über den Fall-Überblick. Für die meisten
  Felder war sie 0 oder falsch.

Die Frage dahinter: Muss für jedes Feld ein eigener KI-Adapter gebaut werden? Nein. Es fehlte eine
einzige Stelle, die jedes Feld beschreibt.

## Entscheidung

### 1. Der Feldkatalog ist die eine Quelle

`packages/core/src/interview/field-catalog.ts` beschreibt jedes Feld der Erklärung: Maske, Name,
Wertform (Betrag, Ganzzahl, Auswahl, Ja/Nein, Datum, Wochentage, Text, Interview-Antwort), ob die
Maske mehrere Datensätze hat und ob die Eule das Feld beschreiben darf. Daraus werden abgeleitet:

- die Feldliste im Systemprompt (`describeAiWritableFields`),
- die Menge der für die Eule beschreibbaren Felder (`AI_WRITABLE_FIELDS`),
- die Wertprüfung `validateFieldValue`, die einen Wert annimmt, in die gespeicherte Form bringt
  („9.600 €“ → `9600`, „Ja“ → `true`, „12.05.2019“ → `2019-05-12`, Auswahl in kanonischer
  Schreibweise) oder mit einem Grund in der Sprache des Nutzers ablehnt.

**Ein neues Feld gehört in den Katalog.** Ein Test hält Katalog und Schreibzugriff deckungsgleich
(`field-catalog-consistency.test.ts`); ein Feld, das nur an einer der beiden Stellen steht, lässt
den Test rot werden.

### 2. Eine Wertprüfung, an zwei Stellen aufgerufen

Dieselbe Prüfung läuft, wenn die Eule einen Entwurf anlegt, und noch einmal beim Schreiben
(`writeConfirmedByAdvisor`). Die erste Stelle sorgt dafür, dass ein Entwurf, der nicht übernehmbar
wäre, gar nicht entsteht und das Modell den Grund erfährt. Die zweite schützt vor Entwürfen aus
der Zeit vor einer Regel und vor jedem Weg, der die erste Stelle umgeht.

Die Masken des Nutzers behalten ihre eigene Eingabeprüfung (DTOs). Die strengere Prüfung gilt für
**neue Schreibvorgänge der Eule**; bereits gespeicherte Werte werden nicht migriert. „Rückgängig“
schreibt den alten Wert ungeprüft zurück, damit ein Zustand, der vorher bestand, immer
wiederherstellbar ist.

### 3. Mehrere Entwürfe pro Antwort, und die App sagt, was nicht ging

Eine Antwort trägt beliebig viele Entwürfe (höchstens acht; ein zweiter Entwurf für dasselbe Feld
ersetzt den ersten). Jede Ablehnung eines Entwurfs wird festgehalten. Was das Modell bis zum Ende
der Antwort nicht korrigiert hat, steht als „Nicht vorbereitet“ mit Grund unter der Antwort. Diese
Aussage kommt von der App, nicht vom Modell: Ob etwas vorbereitet wurde, entscheidet allein, ob
ein Werkzeug es bestätigt hat.

### 4. Datensätze über neutrale Namen; die Eule legt keine an

Das Modell bekommt für Vermietung und Kinder nur Namen: „Objekt 1“, „Kind 2“, in der gespeicherten
Reihenfolge. Die Zuordnung Name → Datensatz kennt nur der Server und setzt sie beim Anlegen des
Entwurfs ein. Weder Kennungen noch Namen oder Adressen gehen an das Modell.

- Ein Datensatz: der Name darf fehlen.
- Mehrere, keiner genannt: Rückfrage an den Nutzer. Das ist keine Ablehnung.
- Keiner: Die Eule bereitet nichts vor. **Datensätze legt der Nutzer in der Maske an**; die Antwort
  sagt das und bietet den Weg in die Maske an.

Das Anlegen bleibt bewusst beim Nutzer: Ein Objekt oder ein Kind bringt Pflichtangaben mit, die
die Eule nicht sehen darf (Name, Geburtsdatum, Adresse).

### 5. Die Vorschau ist die Schätzung der App, oder sie ist offen

Die Wirkung eines Entwurfs rechnet die Steuerschätzung der App zweimal: für den gespeicherten Stand
und mit den Feldern des Entwurfs. Der zweite Lauf schreibt über denselben Weg wie „Übernehmen“,
in einer Transaktion, die **immer** verworfen wird. Damit ist die Vorschau per Konstruktion das,
was nach dem Übernehmen in der Schätzung steht.

Kann die Schätzung nichts sagen (Angaben unvollständig, Lebenslage ohne automatische Schätzung),
zeigt die Karte keine Zahl, sondern „Wirkung noch offen“ mit dem Grund. Eine Wirkung von 0 € heißt
„ändert die Schätzung nicht“. Das Modell darf nur die gemeldeten Zahlen nennen.

Ohne Datenbank hinter der Engine (In-Memory-Tests, Regel-Fallback) bleibt die alte Näherung; sie
ist am fehlenden `effect` erkennbar.

### 6. Maßstab: Szenarien gegen das echte Modell, nachts

`apps/api/test/live/` spielt je Bereich der Erklärung einen Kundensatz gegen das echte Modell und
eine echte Datenbank, übernimmt die Entwürfe und liest die gespeicherten Werte zurück. Dazu die
Grenzen (unsinniger Wert, Stammdaten, kein Objekt). Das läuft im Nightly-Workflow und schreibt
einen Bericht; rot wird der Job erst mit `AI_EVAL_ENFORCE=1`, weil das Modell nicht deterministisch
ist. Deterministisch und im normalen CI geprüft wird dagegen: Kein Feld mit fester Form nimmt
Unsinn an (`advisor-field-coverage.integration.test.ts`).

## Folgen

- Ein neues Feld braucht einen Katalogeintrag; danach kann die Eule es ohne weiteren Code füllen.
- Freitextfelder (derzeit `chLohnausweis.bemerkungen`) lassen sich nicht inhaltlich prüfen und
  bleiben die einzige Ausnahme.
- Die Vorschau kostet zwei Schätzungen und eine verworfene Transaktion je Entwurf.
- Die Namen „Objekt n“ folgen der gespeicherten Reihenfolge. Löscht der Nutzer einen Datensatz,
  verschieben sie sich; ein Entwurf zeigt auf den Datensatz selbst und bleibt deshalb richtig,
  ein Entwurf auf einen gelöschten Datensatz lässt sich nicht übernehmen.

## Verworfen

- **Ein KI-Adapter je Feld:** vervielfacht genau die Dopplung, die das Problem war.
- **Die Eule legt Objekte und Kinder selbst an:** bräuchte personenbezogene Pflichtangaben im
  Modellkontext.
- **Vorschau über eine zweite, „überlagernde“ Rechnung im Speicher:** müsste für jede Maske
  nachbauen, wie ein Feld in den Datensatz eingeht, und könnte von der echten Schätzung abweichen.
