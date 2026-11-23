# ADR-0100 — The owl: guard alongside the model, timings per round, form before the question

- **Status:** Accepted
- **Date:** 2026-11-19
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/ki/{langgraph-advisor.engine,advisor-prompt,advisor-topic-guard,fake-chat-model}.ts`, `apps/api/src/advisor/advisor-turn.ts`, `packages/core/src/interview/ki-port.ts`
- **Builds on:** ADR-0069 (topic boundary; changes "checker before the main model" there), ADR-0096 (model and thinking depth), #476 (provider cache)

## Context

171 stored answers from test runs: around 100,000 input tokens per answer, 61 to 81 % of them from the cache, and 24 to 36 seconds until the first word. Only the total time was stored; where it went could not be read.

## Decision

1. **Timings per answer.** Next to the tokens it now records how long the app's preparation, the topic guard, each model round and the tools took (`prepMs`, `guardMs`, `roundMs`, `toolMs`), in the usage record and in the log line `advisor_turn`.
2. **The guard runs alongside the model, no longer before it.** The model starts immediately. Until the guard's verdict, none of it reaches the user, and no tool runs. On "off-topic" the started run is discarded and the fixed refusal is shown; on "gray zone" the run restarts with the gray-zone hint. This changes ADR-0069, which placed the guard before it so that a refusal only costs the small call. Now a refusal additionally costs the first, aborted round of the main model; most of it comes from the cache.
3. **What applies to only one answer goes before the question, not in the case block.** The active form, the "plan first" prompt and the gray-zone hint are now in the question message, clearly marked as information from the app. The case block stays directly after the rules and now changes only with a value, a document, a note or the plan.

## Measurement

The same conversation with six questions, before and after, once each with Claude Sonnet 5.5 and Gemini 3.8 Flash; the form changes twice. Invented sample data.

| | before | after |
|---|---|---|
| Time outside the model per answer, Claude | 2.2 s | 0.3 s |
| Time outside the model per answer, Gemini | 2.0 s | 0.2 s |
| Claude, share from the cache with a changed form | 83 % and 75 % | 93 % and 93 % |
| Claude, input without cache, all six answers | 76,500 tokens | 44,500 tokens |

- The guard itself still needs 1.3 to 3 seconds; this time now runs alongside the first model round.
- Preparation (around 0.1 s) and tools (under 0.2 s) are negligible. The time of an answer is the time of the model rounds.
- Of the 32,000 tokens saved with Claude, around 30,000 come from the first answer, whose cache was cold in the "before" run. The clean effect is the share with a changed form.
- Gemini's cache figures fluctuate (0 % to over 100 % in individual answers) and allow no conclusion.
- The total duration per answer fluctuates with the number of rounds the model chooses (Claude 10.9 s before, 10.7 s after with more rounds). The content of the answers was not compared.

## Rejected

- **Placing the whole case block after the conversation history.** Built and measured: the block (around 7,000 tokens) is then paid for again with every answer, even if nothing has changed (Claude, answer with an unchanged case: 800 tokens without cache before, 7,400 after). That only pays off in long conversations with many changes to the case.
- **Shortening the rules or a smaller model:** the rules are in the cache; the gain would be small, the risk to quality real.

## Consequences

- An off-topic question costs more than before. The daily message limit per user continues to cap that.
- With the timings per round, the next steps can be measured instead of estimated: fewer rounds per answer and the thinking effort per round.
