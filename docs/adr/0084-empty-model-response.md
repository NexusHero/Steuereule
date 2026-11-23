# ADR-0084 — An empty model response is retried and then stated openly

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/ki/langgraph-advisor.engine.ts`
- **Builds on:** #487 (reasons for model errors), the follow-up without tools when a round ends silently

## Context

In the 2024 real case the user asked to enter the daughter's Kindergeld (child benefit) and Swiss
Kinderzulage (child allowance). The model returned nothing: no text and no draft, not even after the
follow-up. The app showed „Ich habe deine Steuerakte geprüft.“ ("I have checked your tax file."),
and the round looked answered. The same turn later ran cleanly live: Kindergeld and Kinderzulage were
prepared correctly. So it was a model dropout, not a knowledge problem.

## Decision

1. **A round without any result is retried once.** Without any result means: no text, no draft, no
   two paths, no selection, no question round and no note or interview change. Meanwhile the user
   sees „Die Eule fragt noch einmal nach …“ ("The owl is asking again …").
2. **If it stays empty, the fixed rules answer.** The answer carries the model error "unknown"
   („Das Sprachmodell hat nicht geantwortet.“ ("The language model did not respond.")), and the app
   offers a retry.
3. The default sentence remains only for rounds that prepared something but wrote nothing about it.

## Consequences

- A silent round costs at most a second model call.
- In operation every empty round is logged with provider and model.
