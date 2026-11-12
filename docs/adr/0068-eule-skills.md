# ADR-0068 — Eule: Skills und Fragerunden

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** Ticket #495; `packages/core/src/interview/advisor-skills.ts`, `apps/api/src/ki/{advisor-skills,advisor-prompt,advisor-tools,advisor-tool-round}.ts`, `apps/mobile-web/src/screens/advisor/chat/{SkillsMenu,QuestionRound}.tsx`
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

## Folgen

- Das Modell kann in einem Gespräch ohne Skill `ask_questions` ebenfalls aufrufen; der
  Werkzeugtext verweist auf den Skill, die Oberfläche zeigt eine Runde aber immer.
- Nutzer können keine eigenen Skills anlegen. Wer das will, braucht erst eine Prüfung der Texte
  (Länge, Inhalt, Ausschluss von Anweisungen gegen die festen Regeln).

## Verworfen

- **Eigene Skills der Nutzer:** siehe 1.
- **Skills im Admin-Panel:** zusätzlicher Pflegeweg ohne Nutzen, solange es einen Skill gibt.
