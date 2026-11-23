# ADR-0068 — Owl: skills and question rounds

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** Ticket #495; `apps/api/skills/berater-interview/SKILL.md`, `apps/api/prisma/schema.prisma` (`AdvisorInterview`), `packages/core/src/interview/advisor-skills.ts`, `apps/api/src/ki/{advisor-skills,advisor-prompt,advisor-tools,advisor-tool-round}.ts`, `apps/mobile-web/src/screens/advisor/chat/{SkillsMenu,QuestionRound}.tsx`
- **Supplements:** ADR-0038 (zero-write), ADR-0067 (projects, conversations, notes)

## Context

The Product Owner wants to be able to let the owl work like an advisor: not just answer questions,
but ask its way through the tax return in a targeted manner. This needs ways of working that can be switched on
and off ("skills"), and as the first skill an interview modeled on "grill-me".

## Decision

1. **Skills are shipped; the user only switches them on and off.** No custom
   skill texts from users: a freely worded instruction text would be a way to bypass the owl's rules
   (prompt injection by the user themselves, zero-write). The registry is in
   `ADVISOR_SKILL_IDS`; new skills are a code change with review.
2. **A skill changes how the owl asks, not what it may enter.** Its text comes in the
   case-specific part of the system prompt after the fixed rules. Drafts, notes, checks and
   zero-write apply unchanged.
3. **A skill applies per session, not stored.** The field `skill` on the message switches it on
   for this message; the UI remembers the choice until the page reloads. A
   stored skill per user or conversation is a later step.
4. **Advisor interview = rounds with choice fields.** The tool `ask_questions` poses a
   round of 1 to 4 questions, each with 2 to 4 tappable answers and the owl's recommendation
   (must be one of the answers, otherwise it is dropped). The answers go back as an ordinary
   message ("1: Ja", one line per question); there is nothing special about it, drafts arise
   as usual. The round stays operable as long as it is the last message, after that it is
   history. A question can also be answered freely: the input field remains.
5. **A round without at least two answers per question is discarded,** not shown.

## Persistent and honest (added 2026-11-13)

6. **The app keeps the state of the interview, not the model.** Ten areas
   (`INTERVIEW_AREAS` in core: grunddaten, kinder, einkuenfte, arbeit, vorsorge, haushalt,
   belastungen, spenden, ausland, vorjahr) each have, per tax year, the state open, done or
   not applicable. The owl ticks them off with `mark_interview_area`. Storage is per user
   and tax year in `BeraterInterview` (encrypted, included in account deletion and data export). With the skill
   switched on, the state is in every prompt.
7. **Finished only when no area is open any more.** Until then every answer ends with a
   new round. At the end the owl summarizes and asks for confirmation (`apps/api/skills/berater-interview/SKILL.md`).
8. **Fact or decision.** Every question has `kind`. With `fact` (what the user had or
   did) the API discards a recommendation, and the UI shows none, not even for older
   rounds without `kind`. Otherwise „Empfehlungen übernehmen“ ("Apply recommendations") would assert facts on the user's behalf.
   Only `decision` carries `recommended` and a one-sentence `reason`.
9. **Multiple choice.** `multiple: true` allows several answers („Was davon hattest du?“ ("Which of these did you have?"));
   they go back as "1: A, B". Answers that look exactly the way the app writes them
   skip the topic checker (`isRoundAnswer`); before, every round with more than one
   question fell through this gap and was checked.

## Consequences

- The model can also call `ask_questions` in a conversation without a skill; the
  tool text refers to the skill, but the UI always shows a round.
- Users cannot create their own skills. Anyone who wants that first needs a review of the texts
  (length, content, exclusion of instructions against the fixed rules).

## Rejected

- **Users' own skills:** see 1.
- **Skills in the admin panel:** an additional maintenance path with no benefit, as long as there is one skill.
