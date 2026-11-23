# ADR-0064 — Owl chat: answer runs, detached from the connection, with resumption

- **Status:** Accepted
- **Date:** 2026-11-11
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** Ticket #476; `apps/api/src/advisor/` (in particular `run/`), `apps/api/src/ki/langgraph-advisor.engine.ts`, `packages/core/src/interview/{advisor,advisor-history,ki-port}.ts`, `apps/mobile-web/src/screens/advisor/`
- **Supplements:** ADR-0038 (AI port, zero-write), ADR-0051 (owl mode), ADR-0008 (encrypted fields)
- **Touches:** ADR-0053 (beta hosting on Cloud Run), ADR-0056 (job queue), product ADR-047 (Redis)

## Context

Until #476, an answer from the owl was tied to the HTTP connection it was streamed over. If the
connection dropped (dead zone, tab in the background, proxy timeout), the paid model call was
aborted and a question without an answer remained in the history. The answer was only saved once it
was finished; an aborted partial text existed only in the browser. Events had neither an identifier
nor an order, the model received the last ten messages as text across the board and did not know
what had become of its own suggestions.

## Decision

### 1. An answer is a run with its own lifecycle

The assistant message is created **before** the model is called, with status `streaming`
and a run ID. It ends in exactly one of three states: `complete`, `aborted` (stopped)
or `failed`. With `aborted` and `failed`, the text written up to that point is kept; the
message carries **no** suggestions, because half an answer must not produce anything that can be applied.

No path leaves a message on `streaming`: stop, timeout, an error in the
engine, a reader that leaves, and the shutdown of the instance all end in a final state. A
message whose run no instance knows any more (crash, deployment) is marked as `failed` the next
time the session is loaded.

### 2. The run is detached from the connection

`AdvisorRunService.start` checks synchronously (the daily quota remains a normal HTTP error),
stores the question and the answer placeholder and then lets the run continue without `await`. Every
event goes into a **run log** (`AdvisorRunLog`) with a gapless sequence number starting at 1. The
HTTP response only reads from this log; closing it ends the reader, never the run.

Two implementations behind the same port:

| | `InMemoryAdvisorRunLog` | `RedisAdvisorRunLog` |
| :--- | :--- | :--- |
| When | without `REDIS_URL` (local, tests, one instance) | with `REDIS_URL` |
| Storage | in the API process | one Redis Stream per run, entry ID `<seq>-0`, final entry `end` |
| Reattaching | only at the same instance | at any instance |
| Stop | local listener | Pub/Sub, reaches the executing instance |
| Retention | 5 minutes after the end | 5 minutes after the end (TTL), 15 minutes for runs that never ended |

The events in the log are ephemeral and expire with the stream. Only the message itself is stored
durably, field-encrypted as before.

### 3. Protocol over SSE

`POST …/advisor/stream` starts a run and streams it. Every event carries its sequence number
as SSE `id:`; the first event is `start` with the run ID, the stored question and the ID of the answer.
`GET …/advisor/runs/{runId}/events` delivers the events after `Last-Event-ID` (or `?after=`).
The events `start` and `reasoning` are new. A comment heartbeat every 15 seconds keeps sluggish
proxies open. Someone else's run responds like an unknown one: 404.

The client reads via `followRun`: if the connection ends without `done` or `error`, it reattaches with
the last sequence number (up to six attempts with growing intervals) and discards
events it already had. If the server no longer knows the run, the client reloads the session;
the final state is there.

### 4. Only stop ends an answer

`POST …/advisor/runs/{runId}/stop` is the only way to end a run early. The
stop button closes the connection **and** calls this endpoint. An answer that runs to completion after a
connection drop counts toward the daily quota: it was ordered and delivered. The
time limit per answer (`turnTimeoutMs`) applies unchanged and limits orphaned runs.

### 5. Reasoning: provider summaries, no raw text

With `AI_ADVISOR_REASONING=summary`, the engine requests a reasoning summary from the provider
(Anthropic Extended Thinking, Gemini `includeThoughts`, OpenAI Responses API). It comes as a
separate event, never as part of the answer, is stored field-encrypted with the message
(`gedankengang`) and shown in the chat as a collapsible block with the note „Überlegungen der KI, keine
Auskunft“ ("The AI's reasoning, not information"). If the model delivers nothing, the block only shows the work steps.

The option is **off by default**: it needs a model that supports it, and costs
tokens. Anthropic rejects a forced tool call while thinking is active; the
forced plan („Was hab ich vergessen?“ ("What did I forget?")) is requested in the prompt there instead.

### 6. Memory by token budget

`buildAdvisorHistory` (core, pure) replaces "the last ten": the newest turns stay verbatim
up to the budget (default 3,000 estimated tokens), every earlier answer of the owl carries one line
per suggestion with its outcome (open, applied, rejected …), and everything older becomes **one**
prepended note. The note is produced deterministically, without a model call. The stored
previous value of a field does not go into the prompt.

### 7. System prompt with a stable prefix

The system prompt consists of a rules part that is the same for everyone and the case-specific part (active
screen, CaseDigest). The rules part comes first; with Anthropic it carries an explicit
cache breakpoint, the other providers cache a repeated prefix themselves. Nothing case-specific
may move into the rules part; a test pins this down.

### 8. Measurement per answer

For every answer, input, output and cached tokens, the time to first word, the
duration and a trace ID (the run ID) are stored (`verbrauch`, unencrypted, without content) and
written as one structured log line `advisor_turn`. The client does not receive this data.

### 9. Rating and clearing the history

A finished answer can be rated with thumbs up or down, with "down" with a reason
from a fixed list. There is no free text and no plain-text export from the history.
„Verlauf leeren“ ("Clear history") deletes the conversation of a tax year; applied values stay in the
tax return. While an answer is running, clearing is rejected (409).

## Consequences

- **Several API instances need Redis.** Without `REDIS_URL`, a client can only reattach at the
  instance that executes the run; if it lands elsewhere, it sees 404 and then the
  final state from the session. That is correct, but not seamless. Redis in production depends on #292.
- **Cloud Run (ADR-0053):** A run that nobody is listening to has no open request. With
  request-based CPU allocation it then stands still. For detached generation the service must
  run with "CPU always allocated". This is not yet implemented in the infrastructure.
- **A run lives in the API process, not in a worker.** If the instance dies, the answer ends
  as `failed`. A separate worker via the job queue (ADR-0056) would be more robust and is deliberately not
  part of this decision: the port `AdvisorRunLog` already separates execution and reading so that a
  worker later only replaces the executing side.
- **A dropped reader now costs money.** Previously a closed tab saved the rest of the
  model call. This is limited by the time limit per answer and the daily quota.
- **There is still no filter for the answer text.** `advisor-safety.ts` checks write targets,
  not text. This applies to the answer as well as to the reasoning and is a separate project.

## Rejected alternatives

- **Drop means abort (state before #476).** Simple, but annoying on the phone and expensive in
  perception: the question is paid for, the answer gone.
- **Write partial text continuously to Postgres, client polls.** Needs no Redis, but produces
  dozens of encrypted writes per answer and feels sluggish because of the polling.
- **BullMQ worker right away.** Cleanly scalable, but a new process and a new deployment for
  a feature that is also correct in the API process. The port keeps the way open.
- **Show raw reasoning.** Maximum transparency, but the model can make statements there that
  look like individual advice, and there is no text filter that would catch them.
- **Versions of an answer ("1/2").** Considered and rejected: „Neu generieren“ ("Regenerate") continues to replace the
  last answer (#451), so that it is never unclear which suggestion applies.

## Evidence

- Lifecycle, rating, clearing: `apps/api/test/advisor-lifecycle.test.ts`, against real Postgres
  `advisor-lifecycle.integration.test.ts` (incl. encryption of the reasoning in raw access).
- Run log: `advisor-run-log.test.ts`, against real Redis `advisor-run-log.redis.integration.test.ts`.
- Detached runs, resumption, stop, ownership: `advisor-run.service.test.ts`, over HTTP
  `advisor-runs.http.test.ts`.
- Reasoning, usage, prompt prefix: `langgraph-advisor.reasoning.test.ts`.
- Memory: `packages/core/src/interview/advisor-history.test.ts`.
- Client: `chat/runStream.test.tsx`, `CopilotBridgeResume.test.tsx`, `AdvisorChatPanelLifecycle.test.tsx`.

**Not verified:** Anthropic and OpenAI. For Gemini see the addendum.

## Addendum (11 November 2026): run against the real model

With a real Gemini key (`gemini-3.8-flash`), `scripts/ai-eval/reasoning-check.ts`
and a customer scenario in the browser (`e2e/advisor/customer-chat-scenario.mjs`) were run: a new customer, eight
messages, who applies every suggestion. In the first pass, **nothing** was in the
tax return afterwards. Four causes, all already present before #476 and fixed here:

1. **Tool schema.** Every `z.record` produces `propertyNames`; Gemini responds to that with 400,
   and the engine fell back to the deterministic answer without a trace. The model now receives the
   schema without such keywords (`toProviderToolSchema`); failed model calls
   are logged.
2. **Field names.** The model did not know the field names of the screens and derived them from the
   CaseDigest (`grossWageEur` instead of `bruttoarbeitslohn`). Such drafts could not be
   applied. The stable part of the system prompt now names all fields the owl may suggest
   (from `WRITABLE_FIELDS_BY_SCREEN`, without the protected ones), together with the allowed values; an
   unknown field is rejected already at draft time with the list of valid ones.
3. **Applying without feedback.** If applying failed, nothing happened on the screen.
   The chat now shows the server's message.
4. **Privacy guard.** The fingerprint of an owl hint is a 16-character hex hash
   and can have the shape of an IBAN. It is attached to the hint, not to the user: everyone with the hint
   „Fortbildung ohne Fahrt“ ("Training without travel") for 2026 lost the chat to "IBAN detected". `checkPiiFree` now exempts exactly
   this shape in the field `fingerprint`.

In addition, two adjustments to the flow: after the last tool round, the model must answer in words
(otherwise the answer ended as „Ich habe deine Steuerakte geprüft.“ ("I have checked your tax file.")), and the time limit per answer
is 60 instead of 25 seconds, because with reasoning even the first word took 10 to 20 seconds.

State after the fourth pass: Lohnsteuerbescheinigung (wage tax certificate) complete, commute 38 km by car,
60 home office days, donation €300, basic details; the estimate shows a refund range.

**Second round (same day): the open points**

- **Training costs as an amount.** New follow-up question `fortbildung-kosten` behind „Fortbildung: Ja“ ("Training: Yes").
  The estimate counts them as Werbungskosten (work-related expenses); the owl enters them together with `fortbildung: Ja`.
  The owl's preview no longer includes a flat €450: without an amount it names no
  effect. Before, it promised a refund that never appeared in the estimate.
- **Vacation and sick days.** The owl asks about them before it calls commuting days finished.
- **Draft with several fields on a new record.** The first field created the
  commute record with default values (Mon–Fri), the next field of the same draft was
  then rejected as "changed in the meantime". Within one apply, the write path now compares,
  for a record it has already written itself, against the current state; the
  check of all initial values before the first write remains.

State after the last pass (nine messages): Lohnsteuerbescheinigung complete; commute
38 km by car, 30 vacation and 5 sick days, 60 home office days, resulting in 166 commuting days and
€2,397 Entfernungspauschale (distance allowance); €850 training; €300 donation. Werbungskosten €3,607
(2,397 + 360 + 850), refund range €2,355 to €2,439.

**What remains open**

- The training amount can only be entered and seen via the owl. The question belongs to the
  second interview section, which has no UI in the app yet (#321).
- Time to first word around 12 seconds at the median; around 115,000 input tokens for nine
  messages, of which just under 40% from the cache.
- Master data is still entered by the user themselves (intended); the interview question „Ausland“ ("Abroad") remained open.
- The run depends on the model: in one of six passes it chose an
  invalid value for `transport`, before the allowed values were in the prompt. The script reports, it does not check.
