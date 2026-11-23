# ADR-0066 — Owl: one field catalog, one value check, honest preview, checked answer

- **Status:** Accepted
- **Date:** 2026-11-11
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/interview/{field-catalog,record-handles,advisor-answer-check,ki-port,advisor}.ts`, `.github/workflows/deploy.yml`, `infra/gcp/`, `apps/api/src/ki/{langgraph-advisor.engine,advisor-safety}.ts`, `apps/api/src/advisor/advisor.service.ts`, `apps/api/src/confirmation/confirmation.service.ts`, `apps/api/test/live/`, `.github/workflows/ai-eval-nightly.yml`
- **Supplements:** ADR-0038 (AI port, zero-write), ADR-0051 (owl mode), ADR-0064 (answer runs)
- **Number:** 0065 is taken by a parallel branch (address search), hence 0066.

## Context

The owl is meant to be able to fill in the tax return via the chat. The run against the real
model (#476) showed where this does not hold up:

- The list of fields the model knows, the list of fields that may be written,
  and the rules for which value fits a field were in three places. 51 fields stored, on
  the owl's write path, any value, even obvious nonsense; an invalid interview answer
  then made the user's whole interview unreadable.
- An answer could carry exactly one draft. If the user named three things, one was created,
  and the answer text claimed three.
- Rental properties and children are several records. The model did not know their identifiers
  and invented some ("1", "Objekt 1"); the drafts could never be applied.
- The preview "brings +X €" came from an approximation over the case overview. For most
  fields it was 0 or wrong.

The question behind this: does a separate AI adapter have to be built for every field? No. What was missing was a
single place that describes every field.

## Decision

### 1. The field catalog is the one source

`packages/core/src/interview/field-catalog.ts` describes every field of the tax return: screen, name,
value shape (amount, integer, choice, yes/no, date, weekdays, text, interview answer), whether the
screen has several records and whether the owl may write the field. Derived from this are:

- the field list in the system prompt (`describeAiWritableFields`),
- the set of fields writable by the owl (`AI_WRITABLE_FIELDS`),
- the value check `validateFieldValue`, which accepts a value and brings it into the stored form
  ("9.600 €" → `9600`, "Ja" → `true`, "12.05.2019" → `2019-05-12`, choice in canonical
  spelling) or rejects it with a reason in the user's language.

**A new field belongs in the catalog.** A test keeps the catalog and write access congruent
(`field-catalog-consistency.test.ts`); a field that is only in one of the two places turns
the test red.

### 2. One value check, called in two places

The same check runs when the owl creates a draft, and once more on writing
(`writeConfirmedByAdvisor`). The first place ensures that a draft that could not be applied
is not created at all and that the model learns the reason. The second protects against drafts from
the time before a rule and against any path that bypasses the first place.

The user's screens keep their own input validation (DTOs). The stricter check applies to
**new writes by the owl**; values already stored are not migrated. „Rückgängig“ ("Undo")
writes the old value back unchecked, so that a state that existed before can always be
restored.

### 3. Several drafts per answer, and the app says what did not work

An answer carries any number of drafts (at most eight; a second draft for the same field
replaces the first). Every rejection of a draft is recorded. Whatever the model has not corrected by the end
of the answer appears as „Nicht vorbereitet“ ("Not prepared") with a reason under the answer. This
statement comes from the app, not from the model: whether something was prepared is decided solely by whether
a tool confirmed it.

### 4. Records via neutral names; the owl creates none

For rental income and children, the model only receives names: „Objekt 1“ ("Property 1"), „Kind 2“ ("Child 2"), in the stored
order. Only the server knows the mapping name → record and inserts it when creating the
draft. Neither identifiers nor names or addresses go to the model.

- One record: the name may be missing.
- Several, none named: follow-up question to the user. That is not a rejection.
- None: the owl prepares nothing. **The user creates records in the screen**; the answer
  says so and offers the way into the screen.

Creating stays deliberately with the user: a property or a child comes with mandatory details that
the owl must not see (name, date of birth, address).

### 5. The preview is the app's estimate, or it is open

The effect of a draft is computed twice by the app's tax estimate: for the stored state
and with the draft's fields. The second run writes via the same path as „Übernehmen“ ("Apply"),
in a transaction that is **always** discarded. This makes the preview by construction what
will be in the estimate after applying.

If the estimate cannot say anything (details incomplete, life situation without automatic estimate),
the card shows no number but „Wirkung noch offen“ ("Effect still open") with the reason. An effect of €0 means
„ändert die Schätzung nicht“ ("does not change the estimate"). The model may only name the reported numbers.

Without a database behind the engine (in-memory tests, rules fallback), the old approximation remains; it
can be recognized by the missing `effect`.

### 6. Yardstick: scenarios against the real model, at night

`apps/api/test/live/` plays one customer sentence per area of the tax return against the real model and
a real database, applies the drafts and reads back the stored values. In addition the
limits (nonsensical value, master data, no property). This runs in the nightly workflow and writes
a report; the job only turns red with `AI_EVAL_ENFORCE=1`, because the model is not deterministic.
What is checked deterministically and in normal CI, on the other hand: no field with a fixed shape accepts
nonsense (`advisor-field-coverage.integration.test.ts`).

### 7. The finished answer text is checked, without a model

The prompt asks the model to stick to rules; `checkAdvisorAnswer` finds the answers
in which it did not. The check runs after every answer, purely with rules:

- a euro amount as an effect („bringt dir 450 € Erstattung“ ("gets you a €450 refund")) that neither a tool computed
  nor the user named and that is in no draft,
- „Ich habe … eingetragen“ ("I have entered …"): the owl never writes itself,
- „Ich habe … vorbereitet“ ("I have prepared …"), without a draft existing,
- a source reference that does not exist in the source catalog,
- a topic outside private income tax (trade tax, VAT, balance sheet) where the
  referral to a tax advisor or Lohnsteuerhilfeverein (wage tax assistance association) is missing.

The text stays as it was written. The app places a notice beneath it
(`meta.notices`). A readable notice is better than a silently altered answer,
and the text is already visible during streaming anyway. The check recognizes patterns, not
substantively wrong tax law; the nightly evaluation remains responsible for that.

### 8. Operation on Cloud Run

- **CPU stays allocated** (`--no-cpu-throttling`): an answer keeps running after the
  HTTP response has ended (ADR-0064). With throttled CPU it freezes at that moment.
- **Session affinity** (`--session-affinity`): as long as there is no shared Redis, a
  run lives only on the instance that executes it. Affinity keeps the client there.
- **Without a shared log, an unknown run is only considered lost after 3 minutes.** Before that
  it may be running on another instance; marking the answer as failed would be
  wrong. No run lives longer than the time budget of one answer (at most 120 s).
- **Redis is prepared, but off** (`enable_redis` in `infra/gcp`): the smallest
  Memorystore instance costs more than the beta's monthly budget. Turn it on as soon as more than one
  instance regularly serves the chat; any other Redis goes via the secret `REDIS_URL`.
- **Model keys** (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) are optional
  secrets of the deployment. Without any of them, the owl answers from the built-in rules.

## Consequences

- A new field needs a catalog entry; after that the owl can fill it without further code.
- Free-text fields (currently `chLohnausweis.bemerkungen`) cannot be checked for content and
  remain the only exception.
- The preview costs two estimates and one discarded transaction per draft.
- The names "Objekt n" follow the stored order. If the user deletes a record,
  they shift; a draft points to the record itself and therefore stays correct,
  a draft on a deleted record cannot be applied.

## Rejected

- **One AI adapter per field:** multiplies exactly the duplication that was the problem.
- **The owl creates properties and children itself:** would need personal mandatory details in the
  model context.
- **Preview via a second, "overlaying" calculation in memory:** would have to rebuild for every screen
  how a field enters the record, and could deviate from the real estimate.
