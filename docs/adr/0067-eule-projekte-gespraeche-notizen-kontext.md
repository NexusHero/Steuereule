# ADR-0067 — Eule: Steuerjahr als Projekt, mehrere Gespräche, Projektnotizen, Kontext mit Zusammenfassung

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** Ticket #481; `apps/api/src/advisor/`, `apps/api/src/ki/{langgraph-advisor.engine,ai-runtime-config.service,chat-model.factory}.ts`, `packages/core/src/interview/{advisor-history,advisor-notes,ki-port}.ts`, `apps/mobile-web/src/screens/advisor/`
- **Ergänzt:** ADR-0038 (KI-Port, Zero-Write), ADR-0064 (Antwort-Läufe), ADR-0066 (Feldkatalog, geprüfte Antwort)
- **Nummer:** 0065 ist von einem parallelen Zweig belegt (Adresssuche).

## Kontext

Die Eule führte genau ein Gespräch pro Steuerjahr. Der Verlauf wuchs mit jedem Thema, Antworten
wurden langsamer und ungenauer, und der ältere Teil fiel für das Modell still weg. Bis zum ersten
Wort vergingen rund zwölf Sekunden, in denen der Nutzer nichts sah. Vorbild für die Lösung sind
Projekte mit mehreren Sitzungen: ein gemeinsamer Wissensstand, darunter beliebig viele getrennte
Kontexte.

Die Entscheidungen stammen aus dem Grilling vom 12.11.2026 mit dem Product Owner.

## Entscheidung

### 1. Das Steuerjahr ist das Projekt

Niemand legt ein Projekt an. Mit der Erklärung eines Jahres gibt es das Projekt und sein erstes
Gespräch. Was alle Gespräche eines Jahres teilen:

- den Stand der Erklärung (der Fall-Überblick geht wie bisher in jede Antwort),
- die Projektnotizen (§ 3),
- die Entwürfe: Sie gehören zur Erklärung, nicht zum Gespräch. Ein Entwurf aus Gespräch A lässt
  sich übernehmen, während Gespräch B offen ist, und „durch neueren Entwurf ersetzt“ gilt über
  Gespräche hinweg.

### 2. Mehrere Gespräche, jedes mit eigenem Kontext

Ein Gespräch ist ein eigener Kontext: Das Modell sieht nur dessen Verlauf.

- Ohne Angabe öffnet sich das zuletzt benutzte Gespräch.
- „Neues Gespräch“ verwendet ein noch leeres wieder; es stapeln sich keine leeren.
- Der Titel entsteht aus der ersten Frage (ohne Namen und Kennungen, höchstens 60 Zeichen),
  ohne Modellaufruf. Umbenennen ist möglich.
- Höchstens 50 Gespräche pro Jahr. Das Tageskontingent zählt je Nutzer, nicht je Gespräch.
- Gespräche und Notizen sind privat je Nutzer, auch bei Zusammenveranlagung.
- Schnellstarts laufen im offenen Gespräch.
- Der bestehende Verlauf eines Jahres wird in der Migration das erste Gespräch.
- Es antwortet immer nur ein Gespräch gleichzeitig; während einer Antwort ist der Wechsel
  gesperrt. Paralleles Arbeiten in mehreren Gesprächen wurde bewusst nicht gebaut.

Eine Suche findet Text in den Titeln und Nachrichten aller Gespräche des Jahres; Groß- und
Kleinschreibung und Umlaute spielen keine Rolle. Die Nachrichten liegen verschlüsselt in der
Datenbank, deshalb sucht der Server über den entschlüsselten Text des einen Nutzers und Jahres
(höchstens 50 Gespräche) statt in der Datenbank.

Auf breiten Bildschirmen steht die Liste in einer Seitenleiste links vom Chat. Sie startet offen
und merkt sich, wenn sie eingeklappt wurde. Auf schmalen Bildschirmen öffnet derselbe Inhalt als
Sheet.

### 3. Projektnotizen: Die Eule schreibt hier selbst

Was in einem Gespräch geklärt wurde, aber kein Wert der Erklärung ist („Arbeitszimmer geprüft:
lohnt sich nicht, weil kein eigener Raum“), hält die Eule als Notiz zum Steuerjahr fest. Jedes
Gespräch des Jahres liest die Notizen.

**Die Eule legt Notizen ohne Klick an, ersetzt und entfernt sie.** Das ist eine bewusste Ausnahme
vom Grundsatz aus ADR-0038, dass die Eule nichts selbst schreibt. Sie gilt für Notizen und nur für
Notizen: Die Erklärung ändert sich weiterhin erst, wenn der Nutzer einen Entwurf übernimmt.

Was die Ausnahme tragbar macht:

- Jede Änderung steht unter der Antwort („Gemerkt: …“, „Notiz aktualisiert: …“, „Notiz entfernt:
  …“) mit „Rückgängig“. Rückgängig stellt den vorherigen Text oder die entfernte Notiz wieder her.
- Alle Notizen sind in der Seitenleiste sichtbar; der Nutzer kann jede ändern, löschen und eigene
  hinzufügen.
- Höchstens 20 Notizen je Jahr mit je 200 Zeichen, eine Zeile, keine personenbezogenen Daten
  (geprüft beim Anlegen durch das Modell und beim Speichern).
- Das Modell kennt Notizen nur unter neutralen Namen („Notiz 2“), nie unter ihrer Kennung.
- Notizen gelten je Steuerjahr und wandern nicht in das nächste Jahr.

### 4. Der Kontext eines Gesprächs ist sichtbar und wird zusammengefasst, wenn er voll ist

Das Modell liest die jüngsten Beiträge eines Gesprächs wörtlich, bis zu einem Budget von 6.000
geschätzten Tokens. Ein kleiner Ring im Eingabefeld zeigt, wie voll dieser Kontext ist; ab 80 %
färbt er sich um.

- **Voll:** Vor der nächsten Antwort fasst die Eule den älteren Teil zusammen und sagt das im Chat.
  Die jüngsten Beiträge (ein Viertel des Budgets, mindestens die letzte Frage mit Antwort) bleiben
  wörtlich.
- **Auf Wunsch:** Ein Tipp auf den Ring nennt den Füllstand und bietet „Jetzt zusammenfassen“.
- **Der Nutzer behält alles:** Alle Nachrichten bleiben lesbar. Eine Trennlinie „Älterer Verlauf
  zusammengefasst“ markiert die Stelle; die Zusammenfassung lässt sich dort aufklappen.
- Die Zusammenfassung schreibt das Modell in einem schlichten Aufruf ohne Werkzeuge, mit dem
  Auftrag, nichts hinzuzuerfinden und eine frühere Zusammenfassung fortzuführen. Antwortet kein
  Modell, entsteht sie ohne Modell aus den Fragen und dem Schicksal der Vorschläge. Ein volles
  Gespräch blockiert deshalb nie.

### 5. Gedankengang sichtbar, mittlere Denkstufe

Der Gedankengang (die Denk-Zusammenfassung des Anbieters) ist standardmäßig an: Ein Warten, dem
man zusehen kann, ist ein kürzeres Warten. Die Denkstufe für Gemini ist `medium`.

Gemessen gegen Gemini (`scripts/ai-eval/latency-check.ts`), Zeit bis zum ersten Wort der Antwort:

| Denkstufe | erstes Lebenszeichen | erstes Wort |
| --- | --- | --- |
| niedrig | 2 bis 3 s | 3 bis 6 s |
| **mittel (Voreinstellung)** | 3 bis 4 s | 6 bis 9 s |
| Modell wählt | 3 bis 4 s | 10 bis 13 s |
| hoch | 3 bis 4 s | 13 bis 20 s |

Mittel ist die Entscheidung des Product Owners: Gründlichkeit vor den letzten Sekunden.
`AI_ADVISOR_THINKING_LEVEL` und `AI_ADVISOR_REASONING=off` stellen es um.

### 6. Um das Eingabefeld steht nur das Feld

Das Banner mit dem Diktier-Tipp ist entfernt. Das Mikrofon-Symbol erscheint weiterhin dort, wo
das Diktieren auf dem Gerät möglich ist (ADR-0061).

### 7. Wenn das Sprachmodell nicht antwortet, sagt die Eule warum

Ein Anbieterfehler ist kein stiller Wechsel zu den eingebauten Regeln und kein nacktes „abgebrochen“.
Die API ordnet ihn einem Grund zu (Schlüssel oder Modell abgelehnt, Kontingent, überlastet,
Zeitüberschreitung, Verbindung, blockiert, unbekannt) und hängt ihn als `meta.modelFailure` an die
Antwort. Die Oberfläche zeigt darunter einen Hinweis mit dem Grund, dass die Antwort aus festen Regeln
kommt, und der technischen Angabe „Anbieter · HTTP-Status“. Meldungstexte des Anbieters verlassen den
Server nicht. „Noch einmal versuchen“ erscheint nur, wo Wiederholen helfen kann; ein abgelehnter
Schlüssel wird dem Nutzer als Sache des Betreibers genannt. Der Hinweis steht in der gespeicherten
Antwort und bleibt nach dem Neuladen. Bricht der Strom mitten in der Antwort ab, nennt auch der
Fehler den Grund.

### 8. Turbo: die Eule übernimmt selbst und zeigt es

Ein Schalter „Turbo“ am Eingabefeld (aus in jeder neuen Sitzung, #491). Aus bleibt alles wie in
ADR-0038: Die Eule bereitet Entwürfe vor und wartet auf den Klick. An, übernimmt der Server die
offenen Entwürfe einer Antwort, sobald sie fertig und gespeichert ist, in einem Schritt, genau wie
„Alle übernehmen“: mit Prüfung gegen zwischenzeitliche Änderungen, Herkunft „Assistent: SteuerEule“,
Prüfpfad und Rückgängig.

- Die Karten bleiben sichtbar, jetzt als „Übernommen“ mit altem und neuem Wert; darüber sagt eine
  Zeile, wie viele Änderungen die Eule übernommen hat (`meta.turbo`).
- Was nicht passt (Feld zwischenzeitlich geändert, Konflikt, abgelehnter Wert), wird nicht erzwungen:
  Alle Entwürfe bleiben offen. „Zwei Wege“ wartet immer auf eine Wahl.
- Das ist die zweite bewusste Ausnahme von Zero-Write, diesmal auf Wunsch des Nutzers je Nachricht.

### 9. Fällt das Modell aus, antwortet ein zweites (#493)

Jeder Anbieter-Client wiederholt kurze Fehler (429, 503, abgerissene Verbindung) zweimal mit Wartezeit.
Scheitert der Aufruf trotzdem, bevor das erste Wort da ist, fragt die Eule das Modell des Slots
`fallback` (`AI_FALLBACK_PROVIDER`, `_MODEL`, `_API_KEY`), einmal, mit eigenem Zeitlimit. Der
Gedankengang steht dort: „Gemini antwortet nicht. Die Eule fragt Claude …“. Das Ergebnis nennt das
Modell, das geantwortet hat, und den Fehler des ersten (`primaryFailure`), den die Verbindungsanzeige
mitzählt. Kein Zweitmodell eingerichtet, oder dasselbe Modell mit demselben Schlüssel, oder eine
blockierte Frage: Es antworten wie bisher die festen Regeln, mit dem Grund. Mitten in einer Antwort
wird nicht gewechselt; dort bleibt der Abbruch ehrlich sichtbar.

## Folgen

- Ein Gespräch löschen entfernt seine Nachrichten und die darin noch offenen Entwürfe;
  übernommene Werte bleiben.
- Eine Zusammenfassung kostet einen Modellaufruf, sobald ein Gespräch sein Budget erreicht.
- Die Zusammenfassung ist das einzige Gedächtnis des älteren Teils für das Modell. Was sie
  auslässt, weiß die Eule in diesem Gespräch nicht mehr; die Erklärung und die Notizen fangen das
  Wesentliche auf.
- Notizen ohne Klick heißt: Die Eule kann auch etwas vergessen, das der Nutzer behalten wollte.
  Aufgefangen wird das durch den Hinweis mit „Rückgängig“ und die Liste in der Seitenleiste.
- Datenexport und Kontolöschung umfassen Gespräche und Notizen.

## Verworfen

- **Frei anlegbare Projekte, eigene Anweisungen je Projekt, Datei-Uploads ins Projekt:** bringen
  Steuernutzern nichts; Belege gibt es schon.
- **Notizen erst nach Bestätigung:** Der Product Owner hat sich für das selbstständige Schreiben
  entschieden, mit Rückgängig als Sicherung.
- **Titel vom Modell formuliert:** kostet einen Aufruf je Gespräch und kommt verzögert.
- **Paralleles Arbeiten in mehreren Gesprächen:** kein erkennbarer Bedarf.
- **Notizen über alle Jahre:** veraltete Aussagen würden in neue Jahre hineinwirken.
