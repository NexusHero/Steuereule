# ADR-0073 — Owl: drafts for Person B in the Zusammenveranlagung

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/interview/{advisor-household,advisor,ki-port}.ts`, `packages/core/src/common/pii-masking.ts`, `apps/api/src/ki/{advisor-tools,advisor-tool-round,advisor-prompt}.ts`, `apps/api/src/advisor/{advisor.service,advisor-drafts,advisor-case-facts}.ts`, `apps/api/src/link/link.service.ts`, `apps/api/skills/berater-interview/SKILL.md`, `apps/mobile-web/src/screens/advisor/chat/ProposalCards.tsx`
- **Builds on:** ADR-0054 (Person A also enters data for Person B), ADR-0038/ADR-0066 (zero write, one write path, field catalog)

## Context

The owl's drafts (`stage_field_draft`, `propose_two_paths`) knew the form, field and entry, but no
person. In a Zusammenveranlagung (joint assessment) in which Person B has no account of their own,
nothing the user said about their wife or husband could therefore be entered through the chat. In
the real-case test a married couple mentioned the wife's Swiss Lohnausweis (Swiss salary
certificate) and commute: the owl could prepare nothing, and the built-in rules (fallback without a
model) entered the wife's "24 km" as the husband's commute.

## Decision

1. **A draft names the person.** `AdvisorActionProposal.person` is `'A' | 'B'`; if it is missing,
   it is the user (A). Both tools accept `person` with the default `A`, for
   `propose_two_paths` per path. A draft for B and one for A on the same field are two different
   targets: they sit side by side, do not replace each other and do not collide in the batch.
2. **Writes go through the same path as in the form.** Base value, stale check, apply and undo
   resolve `LinkService.dataUser(userId, jahr, person)` for each draft, exactly like the forms with
   `?person=B`. The same rules therefore apply: B only in a Zusammenveranlagung that A created, and
   only as long as B has no account of their own (`PERSON_B_OWNS_DATA`). If B has since got an
   account, applying fails with this reason; dismissing always works. The impact preview writes B's
   fields into B's record (in the rolled-back transaction) and reads the user's joint estimate.
3. **Only B's own forms.** Person B exists for `lstb`, `chLohnausweis`, `commute` and `rente`
   (ADR-0054 § 2). Children, rental income, capital and the interview belong to the joint tax
   return; a draft for B there is rejected with `JOINT_SCREEN`. Locked fields stay locked for B
   (the same check before the person check and on the write path).
4. **The owl knows the household, not names.** The turn receives `household`: whether there is a
   Person B, whether the user may enter data for them, and B's already entered figures (gross salary
   from the LStB or CH, commute, pension). To the model, B is always called "Person B". B's first and
   last name are replaced with "Person B" in the user's message before it is stored or sent to the
   model, and are otherwise on the list of names removed from every text. The name appears only in
   the app.
5. **The prompt says when B is meant.** Rule 14 in the fixed part of the prompt: everything the user
   says about wife, husband or partner is Person B; if unclear → ask. The skill
   „Berater-Interview“ asks about the personal areas for both in a Zusammenveranlagung.
6. **The rules without a model never draft from a sentence about another person.** If the message
   mentions wife, husband, partner, child (or "Person B"), `evaluateAdvisorTurn` returns no draft,
   but says honestly that this needs the model or the form. The rules know only the user's fields
   and must not enter anything belonging to someone else there.
7. **The card shows the person.** A draft for B carries „für ‹Vorname›“ ("for ‹first name›")
   (without a known name „für Person B“). The app fetches the first name via the link, only while
   such a draft is visible. Apply and undo use the same buttons and endpoints.

## Consequences

- The chat can now fill a joint tax return for both; the live test
  `owl-person-b.live.test.ts` checks this against the real model (skipped without a key).
- If the user is Person B themselves (own account, linked), the owl must not draft anything for the
  partner; the prompt tells it so. The partner is then also called "Person B" in the prompt.
- There is no form in the app yet for B's `chLohnausweis` (the API takes no `person` there).
  The values land in B's record, which the estimate and printout read; the user can only view them
  once this form is built for B.
- A `ui_command` that opens the form for a locked field opens the user's form, not B's.
- The word-boundary matching of names now works with Unicode letters: names with an umlaut at the
  start („Ümit“) were previously not removed.

## Addendum: No silent default for the person (17.11.2026)

**Occasion.** In the real-data run with a Grenzgänger couple (chat 2024/2025, four runs) the owl
created a draft for Person B without `person` three times: B's health insurer, B's first name and
B's commute. The schema silently set `person` to `A`. The card would thus have overwritten the
user's value, visible e.g. as "67 → 26". The owl noticed the error itself twice, but could not
withdraw the card and asked the user to reject it. The card had no button for that.

**Decision.**

1. **The person is mandatory where the field exists twice.** `person` no longer has a default value
   in the tool schema. In a Zusammenveranlagung in which the user enters data for B,
   `checkDraftPerson` rejects a draft on a single-person form (`PERSON_B_SCREENS` and B's own
   interview answers) without `person` with `PERSON_REQUIRED`. The owl receives the reason and
   creates the draft again correctly in the same answer. Joint forms and households without B stay
   as they were: there, no value still means "the user".
2. **The title must match the person.** If the title of a draft for the user names Person B, via the
   handle "Person B" or B's first or full name as a separate word, the server rejects it with
   `PERSON_MISMATCH`. B's names come from B's profile (`spouseForAdvisor`) and travel as
   `aliases` only within the server. They do not go into the prompt; the case prompt still calls B
   only "Person B".
3. **The owl can withdraw.** The tool `withdraw_draft` withdraws a draft from the same answer (form,
   field, record if applicable, and person), including a path from `propose_two_paths`.
4. **The user can dismiss.** Every open card has a button „Verwerfen“ ("Dismiss"). It uses the
   existing endpoint `dismiss` and afterwards shows „Verworfen“ ("Dismissed").

**Consequences.**

- For single-person forms in a Zusammenveranlagung the owl now always specifies `person: "A"`
  or `"B"`. If it forgets, this costs one tool call, but never a wrong value.
- The name matching finds only names the app knows. If the user refers to B by a nickname, only
  point 1 applies.
- **Every card on a single-person form names its owner.** In a Zusammenveranlagung a draft for the
  user on these forms also carries „für ‹Vorname›“ (without a known name „für dich“ ("for you")),
  next to B's „für ‹Vorname›“. A card that would write B's figure into the user's field thus
  visibly reads „für Suhay · 67 → 26“. Joint forms stay unlabeled. The app fetches the names from
  the link and profile, only while such a card is visible.
