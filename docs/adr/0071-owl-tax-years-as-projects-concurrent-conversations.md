# ADR-0071 — Eule: Steuerjahre als Projekte in der Seitenleiste, Gespräche antworten gleichzeitig

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** Ticket #503; `apps/api/src/advisor/{advisor.service,advisor-shared,advisor.repository}.ts`, `apps/mobile-web/src/screens/advisor/{CopilotBridgeProvider,OwlModeScreen}.tsx`, `apps/mobile-web/src/screens/advisor/chat/ConversationList.tsx`
- **Ändert:** ADR-0067 § 2 („Es antwortet immer nur ein Gespräch gleichzeitig … Paralleles Arbeiten wurde bewusst nicht gebaut“)

## Kontext

Seit ADR-0067 ist das Steuerjahr das Projekt, die Seitenleiste zeigte aber nur die Gespräche des
einen offenen Jahres, und während einer Antwort war der Wechsel gesperrt. Der Product Owner will
das Verhalten, das man von Claude kennt: Projekte mit ihren Gesprächen untereinander, und Gespräche,
die nebeneinander antworten.

## Entscheidung

1. **Die Seitenleiste zeigt alle Steuerjahre als Projekte.** Oben das offene Jahr mit seinen
   Gesprächen (umbenennen, löschen, suchen wie bisher), darunter jedes weitere Jahr, das Gespräche
   hat, zugeklappt. Die Sitzung liefert dafür `projects`.
2. **Ein Gespräch eines anderen Jahres öffnet dieses Jahr für die ganze App.** Fall-Überblick,
   Entwürfe und Notizen gehören zum Jahr; ein Gespräch von 2024 neben den Zahlen von 2026 wäre
   falsch. Wechselt das Jahr an anderer Stelle der App, zeigt die Eule das zuletzt benutzte
   Gespräch des neuen Jahres.
3. **Gespräche antworten gleichzeitig.** Der Client führt den Zustand einer Antwort je Gespräch
   (Text, Gedanken, Plan, Fehler, Abbruch). Der Wechsel ist nie gesperrt; Stopp trifft das offene
   Gespräch. Der Server hatte Läufe schon voneinander getrennt.
4. **Ein Gespräch hat eine Antwort zur selben Zeit.** Eine zweite Frage in ein Gespräch, das gerade
   antwortet, lehnt der Server ab (`ADVISOR_CONVERSATION_BUSY`). Eine Antwort, die länger als fünf
   Minuten als „läuft“ gespeichert ist, gilt als verwaist und sperrt nicht.
5. **Wer antwortet, ist sichtbar.** In der Liste steht „antwortet gerade …“, aus dem Zustand des
   Geräts und aus dem Server (`answering`), also auch für eine Antwort von einem anderen Gerät. Ein
   Gespräch, das antwortet, lässt sich nicht löschen.

6. **Der Chat ist die Bühne, die Ränder sind leise.** Die Linien zwischen Liste, Chat und Werkbank
   lassen sich ziehen (Breite je Gerät gemerkt, Pfeiltasten gehen auch); der Chat behält immer
   mindestens 380 px. Liste und Werkbank tragen keine Hauptknöpfe mehr: „Neues Gespräch“,
   „Änderung übernehmen“ und „Zurück zum Cockpit“ sind leise Knöpfe, die Werkbank hat keinen
   farbigen Rahmen. Der eine laute Knopf je Entwurf bleibt in der Antwort im Chat.
7. **Übernehmen aus der Werkbank bleibt im Gespräch.** Vorher sprang die App danach ins Cockpit;
   das Cockpit zeigt das Ergebnis jetzt, wenn der Nutzer selbst dorthin geht.

## Folgen

- Gleichzeitige Antworten sind gleichzeitige Modellaufrufe. Das Tageskontingent zählt weiter je
  Nutzer.
- Zwei Gespräche können denselben Wert vorschlagen; „durch neueren Entwurf ersetzt“ gilt wie
  bisher über Gespräche hinweg. Mit Turbo schreibt das erste, das fertig ist; das zweite scheitert
  an der Prüfung gegen zwischenzeitliche Änderungen und bleibt ein Entwurf.
- Nach einem Neuladen hängt sich das Gerät an die Antwort des offenen Gesprächs wieder an; die
  anderen laufen auf dem Server weiter und werden beim Öffnen eingeholt.

## Verworfen

- **Gespräche anderer Jahre lesen, ohne das Jahr zu wechseln:** siehe 2.
- **Mehrere Antworten im selben Gespräch:** Reihenfolge im Verlauf wäre Zufall.
- **Frei anlegbare Projekte:** bleibt verworfen wie in ADR-0067.
