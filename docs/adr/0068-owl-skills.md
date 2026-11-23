# ADR-0068 — Eule: Skills und Fragerunden

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** Ticket #495; `apps/api/skills/berater-interview/SKILL.md`, `apps/api/prisma/schema.prisma` (`AdvisorInterview`), `packages/core/src/interview/advisor-skills.ts`, `apps/api/src/ki/{advisor-skills,advisor-prompt,advisor-tools,advisor-tool-round}.ts`, `apps/mobile-web/src/screens/advisor/chat/{SkillsMenu,QuestionRound}.tsx`
- **Ergänzt:** ADR-0038 (Zero-Write), ADR-0067 (Projekte, Gespräche, Notizen)

## Kontext

Der Product Owner will die Eule wie einen Berater arbeiten lassen können: nicht nur auf Fragen
antworten, sondern gezielt durch die Erklärung fragen. Dafür braucht es Arbeitsweisen, die man an-
und ausschaltet („Skills“), und als ersten Skill ein Interview nach dem Vorbild von „grill-me“.

## Entscheidung

1. **Skills werden mitgeliefert, der Nutzer schaltet sie nur an und aus.** Keine eigenen
   Skill-Texte von Nutzern: Ein frei formulierter Anweisungstext wäre ein Weg, die Regeln der Eule
   zu umgehen (Prompt-Injection durch den Nutzer selbst, Zero-Write). Das Register steht in
   `ADVISOR_SKILL_IDS`; neue Skills sind eine Codeänderung mit Review.
2. **Ein Skill ändert, wie die Eule fragt, nicht was sie eintragen darf.** Sein Text kommt im
   Fall-spezifischen Teil des Systemprompts nach den festen Regeln. Entwürfe, Notizen, Prüfungen und
   Zero-Write gelten unverändert.
3. **Ein Skill gilt je Sitzung, nicht gespeichert.** Das Feld `skill` an der Nachricht schaltet ihn
   für diese Nachricht ein; die Oberfläche merkt die Wahl, bis die Seite neu lädt. Ein
   gespeicherter Skill je Nutzer oder Gespräch ist ein späterer Schritt.
4. **Berater-Interview = Runden mit Auswahlfeldern.** Das Werkzeug `ask_questions` stellt eine
   Runde von 1 bis 4 Fragen, jede mit 2 bis 4 antippbaren Antworten und der Empfehlung der Eule
   (muss eine der Antworten sein, sonst entfällt sie). Die Antworten gehen als gewöhnliche
   Nachricht zurück („1: Ja“, eine Zeile je Frage); daran ist nichts Besonderes, Entwürfe entstehen
   wie sonst. Die Runde bleibt bedienbar, solange sie die letzte Nachricht ist, danach ist sie
   Verlauf. Eine Frage kann auch frei beantwortet werden: Das Eingabefeld bleibt.
5. **Eine Runde ohne mindestens zwei Antworten je Frage wird verworfen,** nicht angezeigt.

## Hartnäckig und ehrlich (ergänzt 2026-11-13)

6. **Die App führt den Stand des Interviews, nicht das Modell.** Zehn Bereiche
   (`INTERVIEW_AREAS` in core: grunddaten, kinder, einkuenfte, arbeit, vorsorge, haushalt,
   belastungen, spenden, ausland, vorjahr) haben je Steuerjahr den Stand offen, erledigt oder
   trifft nicht zu. Die Eule hakt sie mit `mark_interview_area` ab. Gespeichert wird je Nutzer
   und Steuerjahr in `BeraterInterview` (verschlüsselt, mit Kontolöschung und Datenexport). Bei
   eingeschaltetem Skill steht der Stand in jedem Prompt.
7. **Fertig erst, wenn kein Bereich mehr offen ist.** Bis dahin endet jede Antwort mit einer
   neuen Runde. Am Ende fasst die Eule zusammen und lässt bestätigen (`apps/api/skills/berater-interview/SKILL.md`).
8. **Tatsache oder Entscheidung.** Jede Frage hat `kind`. Bei `fact` (was der Nutzer hatte oder
   tat) verwirft die API eine Empfehlung, und die Oberfläche zeigt keine, auch nicht bei älteren
   Runden ohne `kind`. Sonst würde „Empfehlungen übernehmen“ Tatsachen für den Nutzer behaupten.
   Nur `decision` trägt `recommended` und einen Satz `reason`.
9. **Mehrfachauswahl.** `multiple: true` erlaubt mehrere Antworten („Was davon hattest du?“);
   sie gehen als „1: A, B“ zurück. Antworten, die genau so aussehen, wie die App sie schreibt,
   überspringen den Themenprüfer (`isRoundAnswer`); vorher fiel jede Runde mit mehr als einer
   Frage durch diese Lücke und wurde geprüft.

## Folgen

- Das Modell kann in einem Gespräch ohne Skill `ask_questions` ebenfalls aufrufen; der
  Werkzeugtext verweist auf den Skill, die Oberfläche zeigt eine Runde aber immer.
- Nutzer können keine eigenen Skills anlegen. Wer das will, braucht erst eine Prüfung der Texte
  (Länge, Inhalt, Ausschluss von Anweisungen gegen die festen Regeln).

## Verworfen

- **Eigene Skills der Nutzer:** siehe 1.
- **Skills im Admin-Panel:** zusätzlicher Pflegeweg ohne Nutzen, solange es einen Skill gibt.
