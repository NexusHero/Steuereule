# ADR-0069 — Eule: Beraterhaltung immer, Steuerwissen zum Nachschlagen, alle Steuerthemen

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** Ticket #499; `.agents/skills/steuerberater/`, `apps/api/src/ki/{advisor-stance,advisor-knowledge.generated,advisor-income-tax,advisor-tools,advisor-tool-round,advisor-prompt}.ts`, `packages/core/src/interview/{advisor,advisor-answer-check}.ts`
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
   der acht Abschnitte. Die Quelle bleibt der Skill im Repo; `advisor-knowledge.generated.ts`
   entsteht daraus (`pnpm --filter @steuereule/api run knowledge:generate`), ein Test schlägt
   fehl, wenn beides auseinanderläuft. `quellen.md` (Nachschlagen im Netz) wird nicht ausgeliefert.
3. **Gerechnet wird mit dem Rechenkern.** `compute_income_tax` rechnet Tarif, Soli und
   Kirchensteuer mit `packages/core/src/math`, nicht mit dem Python-Skript. Der Kern rundet Soli
   und Kirchensteuer auf volle Euro ab, das Skript auf Cent; die Einkommensteuer ist identisch.
4. **Es gelten die Zahlen der App.** Die Tabelle `kennzahlen` ergänzt, was die App nicht rechnet.
   Ein mit „prüfen“ markierter Wert wird als unsicher genannt. Ein Test vergleicht den
   Grundfreibetrag der Tabelle mit dem Kern.
5. **Die Themengrenze entfällt.** Die Eule berät erklärend auch zu Umsatzsteuer, Selbstständigen
   und Gewerbe, Erbschaft und Schenkung, Verfahren. Entwürfe gibt es weiter nur für die Felder der
   App, und Zero-Write gilt unverändert. Entfernt sind die Ablehnung solcher Fragen vor dem
   Modellaufruf und der Hinweis „gehört nicht zur privaten Einkommensteuererklärung“.
6. **Was bleibt:** keine verbindliche Rechtsauskunft (wird weiter vor dem Modell abgelehnt), keine
   Hilfe bei Hinterziehung, der Schutz vor Prompt-Injection, die PII-Prüfung, der Verweis an
   einen zugelassenen Steuerberater in den Fällen aus B8, und die Prüfung „Betrag nicht von der
   App berechnet“.

## Offen und Risiken

- **Rechtlich ungeprüft.** Geschäftsmäßige Hilfeleistung in Steuersachen ist nach dem
  Steuerberatungsgesetz zugelassenen Personen vorbehalten. Punkt 5 ist die Entscheidung des
  Product Owners vom 12.11.2026; eine rechtliche Prüfung vor dem Verkauf steht aus.
- Für Umsatzsteuer und Erbschaftsteuer gibt es keinen Rechner in der App. Die Eule zeigt dort
  Formel und Schritte und nennt es eine Überschlagsrechnung; die Prüfung der Antwort markiert
  Wirkungsbeträge, die kein Werkzeug gerechnet hat.
- Das Wissen ist so aktuell wie der Skill. Wer `references/*.md` ändert, muss neu generieren.
- Nicht gegen ein echtes Modell erprobt: ob das Modell zuverlässig nachschlägt, bevor es antwortet.

## Verworfen

- **Alles Wissen fest in den Prompt:** rund 40 KB je Antwort, langsamer, teurer.
- **Das Python-Skript auf dem Server ausführen:** zweiter Rechenweg neben dem geprüften Kern.
- **Skill-Tabelle als maßgebliche Zahlenquelle:** zwei Quellen, die auseinanderlaufen können.
