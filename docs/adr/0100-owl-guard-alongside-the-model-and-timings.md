# ADR-0100 — Eule: Wächter neben dem Modell, Zeiten je Runde, Maske vor der Frage

- **Status:** Accepted
- **Date:** 2026-11-19
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/ki/{langgraph-advisor.engine,advisor-prompt,advisor-topic-guard,fake-chat-model}.ts`, `apps/api/src/advisor/advisor-turn.ts`, `packages/core/src/interview/ki-port.ts`
- **Baut auf:** ADR-0069 (Themengrenze; ändert dort „Prüfer vor dem Hauptmodell“), ADR-0096 (Modell und Denktiefe), #476 (Provider-Cache)

## Kontext

171 gespeicherte Antworten aus Testläufen: rund 100.000 Eingabe-Tokens je Antwort, davon 61 bis 81 % aus dem Cache, und 24 bis 36 Sekunden bis zum ersten Wort. Gespeichert war nur die Gesamtzeit; wo sie blieb, war nicht ablesbar.

## Entscheidung

1. **Zeiten je Antwort.** Neben den Tokens steht jetzt, wie lange die Vorbereitung der App, der Themen-Wächter, jede Modell-Runde und die Werkzeuge gedauert haben (`prepMs`, `guardMs`, `roundMs`, `toolMs`), im Verbrauchs-Datensatz und in der Logzeile `advisor_turn`.
2. **Der Wächter läuft neben dem Modell, nicht mehr davor.** Das Modell beginnt sofort. Bis zum Urteil des Wächters erreicht nichts davon den Nutzer, und kein Werkzeug läuft. Bei „themenfremd“ wird der begonnene Lauf verworfen und die feste Ablehnung gezeigt; bei „Grauzone“ beginnt der Lauf mit dem Grauzonen-Hinweis neu. Das ändert ADR-0069, die den Wächter davor stellte, damit eine Ablehnung nur den kleinen Aufruf kostet. Jetzt kostet eine Ablehnung zusätzlich die erste, abgebrochene Runde des Hauptmodells; der größte Teil davon kommt aus dem Cache.
3. **Was nur für eine Antwort gilt, steht vor der Frage, nicht im Fall-Block.** Die aktive Maske, die Aufforderung „erst planen“ und der Grauzonen-Hinweis stehen jetzt in der Frage-Nachricht, klar als Angaben der App markiert. Der Fall-Block bleibt direkt hinter den Regeln und ändert sich nur noch mit einem Wert, einem Beleg, einer Notiz oder dem Plan.

## Messung

Dasselbe Gespräch mit sechs Fragen, vorher und nachher, je einmal mit Claude Sonnet 5.5 und Gemini 3.8 Flash; die Maske wechselt zweimal. Erfundene Beispieldaten.

| | vorher | nachher |
|---|---|---|
| Zeit außerhalb des Modells je Antwort, Claude | 2,2 s | 0,3 s |
| Zeit außerhalb des Modells je Antwort, Gemini | 2,0 s | 0,2 s |
| Claude, Anteil aus dem Cache bei gewechselter Maske | 83 % und 75 % | 93 % und 93 % |
| Claude, Eingabe ohne Cache, alle sechs Antworten | 76.500 Tokens | 44.500 Tokens |

- Der Wächter selbst braucht weiter 1,3 bis 3 Sekunden; diese Zeit läuft jetzt neben der ersten Modell-Runde.
- Vorbereitung (rund 0,1 s) und Werkzeuge (unter 0,2 s) fallen nicht ins Gewicht. Die Zeit einer Antwort ist die Zeit der Modell-Runden.
- Von den 32.000 gesparten Tokens bei Claude stammen rund 30.000 aus der ersten Antwort, deren Cache im Lauf „vorher“ kalt war. Der saubere Effekt ist der Anteil bei gewechselter Maske.
- Geminis Cache-Zahlen schwanken (0 % bis über 100 % in einzelnen Antworten) und erlauben keine Aussage.
- Die Gesamtdauer je Antwort schwankt mit der Zahl der Runden, die das Modell wählt (Claude 10,9 s vorher, 10,7 s nachher bei mehr Runden). Der Inhalt der Antworten wurde nicht verglichen.

## Verworfen

- **Den ganzen Fall-Block hinter den Verlauf stellen.** Gebaut und gemessen: Der Block (rund 7.000 Tokens) wird dann bei jeder Antwort neu bezahlt, auch wenn sich nichts geändert hat (Claude, Antwort mit unverändertem Fall: 800 Tokens ohne Cache vorher, 7.400 danach). Das lohnt erst bei langen Gesprächen mit vielen Änderungen am Fall.
- **Regeln kürzen oder ein kleineres Modell:** Die Regeln liegen im Cache; der Gewinn wäre klein, das Risiko für die Qualität echt.

## Folgen

- Eine themenfremde Frage kostet mehr als bisher. Die Tagesgrenze der Nachrichten je Nutzer begrenzt das weiter.
- Mit den Zeiten je Runde lassen sich die nächsten Schritte messen statt schätzen: weniger Runden je Antwort und der Denkaufwand je Runde.
