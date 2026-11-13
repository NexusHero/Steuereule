# ADR-0084 — Eine leere Antwort des Modells wird wiederholt und dann offen benannt

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/ki/langgraph-advisor.engine.ts`
- **Baut auf:** #487 (Gründe für Modellfehler), dem Nachhaken ohne Werkzeuge bei stummem Rundenende

## Kontext

Im Echtfall 2024 bat der Nutzer, Kindergeld und Schweizer Kinderzulage der Tochter einzutragen. Das Modell gab
nichts zurück: keinen Text und keinen Entwurf, auch nicht nach dem Nachhaken. Die App zeigte „Ich habe deine
Steuerakte geprüft.“, und die Runde sah beantwortet aus. Derselbe Zug lief später live sauber durch: Kindergeld
und Kinderzulage wurden richtig vorbereitet. Es war also ein Aussetzer des Modells, kein Wissensproblem.

## Entscheidung

1. **Eine Runde ohne jedes Ergebnis wird einmal wiederholt.** Ohne jedes Ergebnis heißt: kein Text, kein Entwurf,
   keine zwei Wege, keine Auswahl, keine Fragerunde und keine Notiz- oder Interviewänderung. Der Nutzer sieht
   dabei „Die Eule fragt noch einmal nach …“.
2. **Bleibt sie leer, antworten die festen Regeln.** Die Antwort trägt den Modellfehler „unknown“ („Das
   Sprachmodell hat nicht geantwortet.“), und die App bietet die Wiederholung an.
3. Der Standardsatz bleibt nur für Runden, die etwas vorbereitet, aber nichts dazu geschrieben haben.

## Folgen

- Eine stumme Runde kostet höchstens einen zweiten Modellaufruf.
- Im Betrieb steht jede leere Runde mit Anbieter und Modell im Log.
