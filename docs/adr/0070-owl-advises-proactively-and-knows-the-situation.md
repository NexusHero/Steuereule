# ADR-0070 — Owl: savings plan, outlook, Bescheid check and „Unsere Situation“ ("Our situation")

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** Ticket #501; `packages/core/src/interview/{advisor-tasks,advisor-situation}.ts`, `apps/api/src/ki/{advisor-tasks,advisor-stance,advisor-prompt,advisor-tools,advisor-tool-round}.ts`, `apps/api/src/advisor/`, `apps/mobile-web/src/screens/advisor/chat/Situation.tsx`
- **Supplements:** ADR-0067 (notes), ADR-0069 (advisor stance)

## Context

The idea of the product is an owl that advises and does not just fill in. With ADR-0069 it has the
stance and the knowledge. But it still waited for questions, saw only a brief
summary of the one tax year of the case, and its work ended after filing.

## Decision

1. **Savings plan (quick start).** The owl goes through the whole case against the catalog of savings levers.
   Which levers are open is determined by the app without a model (`unusedSavingsLevers`): what is empty in the
   case overview ("open") and for what there is no field ("ask"). The answer has a
   fixed structure: take now (by amount), a detail is missing for this, current and next
   year. No amount without a tool.
2. **An outlook belongs to every consultation** (stance B11): what the user should change in the current and the next
   year.
3. **Bescheid check (quick start).** The owl receives the comparison the app already calculates
   (deviations per field, status, remaining days of the appeal deadline), and no other numbers.
   If a deviation is to the user's disadvantage and the deadline is running, it drafts the appeal
   in full. Without a recorded Bescheid (tax assessment notice) it asks for the values and invents nothing.
4. **Every quick start begins with a plan**, so that the user sees what the owl is doing.
5. **„Unsere Situation“ is the starting knowledge of every conversation.** Two parts, both without names:
   - a profile the app builds from the recorded details (assessment type, occupation, children with
     age at year end, wage rounded, commute, Grenzgänger (cross-border commuter), rental income, capital) that
     comes first in the case-specific prompt;
   - a text by the user in their own words (at most 1,500 characters), **one per user, valid
     across all tax years**, stored encrypted. Names and identifiers are removed on
     saving.
6. **The text belongs to the user.** The owl does not write it. If it learns something lasting,
   it suggests a sentence with `suggest_situation` (at most three per answer, without
   personal data); it is only stored after a tap. This is deliberately stricter than for
   the project notes (ADR-0067 § 3), because this text has an effect over years.
7. **The advisor stance is in every model call.** A test checks this for every provider, with
   and without a skill, for every quick start and for the second model.

## Consequences

- Data export and account deletion cover the text of the situation.
- The savings plan is as good as the case overview: what the app does not record (tradespeople,
  work equipment, medical costs), the owl can only ask about.
- If no model answers, there is neither a savings plan nor a Bescheid check, only the fixed rules.
- Not tested against a real model.

## Rejected

- **Savings plan automatically on every opening:** a paid model call without any action by the user.
  Instead it is the first quick start on the empty chat.
- **The owl maintains the situation itself:** see 6.
- **Letting the model remember the levers:** then completeness would depend on the model's memory.
