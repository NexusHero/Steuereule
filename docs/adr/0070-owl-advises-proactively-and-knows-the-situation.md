# ADR-0070 — Eule: Sparplan, Ausblick, Bescheid-Check und „Unsere Situation“

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** Ticket #501; `packages/core/src/interview/{advisor-tasks,advisor-situation}.ts`, `apps/api/src/ki/{advisor-tasks,advisor-stance,advisor-prompt,advisor-tools,advisor-tool-round}.ts`, `apps/api/src/advisor/`, `apps/mobile-web/src/screens/advisor/chat/Situation.tsx`
- **Ergänzt:** ADR-0067 (Notizen), ADR-0069 (Beraterhaltung)

## Kontext

Die Idee des Produkts ist eine Eule, die berät und nicht nur ausfüllt. Mit ADR-0069 hat sie die
Haltung und das Wissen. Sie wartete aber weiter auf Fragen, sah vom Fall nur eine knappe
Kurzfassung des einen Steuerjahres, und nach der Abgabe endete ihre Arbeit.

## Entscheidung

1. **Sparplan (Schnellstart).** Die Eule geht den ganzen Fall gegen den Katalog der Sparhebel durch.
   Welche Hebel offen sind, bestimmt die App ohne Modell (`unusedSavingsLevers`): was im
   Fall-Überblick leer ist („offen“) und wofür es kein Feld gibt („fragen“). Die Antwort hat eine
   feste Gliederung: jetzt mitnehmen (nach Betrag), dazu fehlt eine Angabe, laufendes und nächstes
   Jahr. Kein Betrag ohne Werkzeug.
2. **Ausblick gehört zu jeder Beratung** (Haltung B11): was der Nutzer im laufenden und im nächsten
   Jahr ändern sollte.
3. **Bescheid-Check (Schnellstart).** Die Eule bekommt den Abgleich, den die App schon rechnet
   (Abweichungen je Feld, Stand, verbleibende Tage der Einspruchsfrist), und keine anderen Zahlen.
   Geht eine Abweichung zu Lasten des Nutzers und läuft die Frist, formuliert sie den Einspruch
   aus. Ohne erfassten Bescheid bittet sie um die Werte und erfindet nichts.
4. **Jeder Schnellstart beginnt mit einem Plan**, damit der Nutzer sieht, was die Eule tut.
5. **„Unsere Situation“ ist das Startwissen jedes Gesprächs.** Zwei Teile, beide ohne Namen:
   - ein Steckbrief, den die App aus den erfassten Angaben baut (Veranlagung, Beruf, Kinder mit
     Alter am Jahresende, Lohn gerundet, Arbeitsweg, Grenzgänger, Vermietung, Kapital) und der
     als Erstes im fallbezogenen Prompt steht;
   - ein Text des Nutzers in eigenen Worten (höchstens 1.500 Zeichen), **einer je Nutzer, gültig
     über alle Steuerjahre**, verschlüsselt gespeichert. Namen und Kennungen werden beim Speichern
     entfernt.
6. **Der Text gehört dem Nutzer.** Die Eule schreibt ihn nicht. Erfährt sie etwas Dauerhaftes,
   schlägt sie mit `suggest_situation` einen Satz vor (höchstens drei je Antwort, ohne
   personenbezogene Daten); gespeichert wird erst nach einem Tipp. Das ist bewusst strenger als bei
   den Projektnotizen (ADR-0067 § 3), weil dieser Text über Jahre wirkt.
7. **Die Beraterhaltung steckt in jedem Modellaufruf.** Ein Test prüft das für jeden Anbieter, mit
   und ohne Skill, für jeden Schnellstart und für das Zweitmodell.

## Folgen

- Datenexport und Kontolöschung umfassen den Text der Situation.
- Der Sparplan ist so gut wie der Fall-Überblick: Was die App nicht erfasst (Handwerker,
  Arbeitsmittel, Krankheitskosten), kann die Eule nur erfragen.
- Antwortet kein Modell, gibt es weder Sparplan noch Bescheid-Check, nur die festen Regeln.
- Nicht gegen ein echtes Modell erprobt.

## Verworfen

- **Sparplan automatisch bei jedem Öffnen:** ein bezahlter Modellaufruf ohne Zutun des Nutzers.
  Er ist stattdessen der erste Schnellstart auf dem leeren Chat.
- **Die Eule pflegt die Situation selbst:** siehe 6.
- **Hebel vom Modell erinnern lassen:** dann hinge die Vollständigkeit am Gedächtnis des Modells.
