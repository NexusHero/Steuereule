# ADR-0096 — Selectable model and thinking depth (Gründlich / Max)

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:**
  - `packages/core/src/interview/advisor-models.ts`
  - `apps/api/src/ki/{ai-runtime-config.service,chat-model.factory,langgraph-advisor.engine,advisor-model-catalog}.ts`
  - `apps/api/src/advisor/{advisor-models.service,advisor.controller,advisor.service,advisor-conversations,advisor.repository*}.ts`
  - `apps/api/prisma/migrations/20261118120000_conversation_chat_model/`
  - `apps/mobile-web/src/screens/advisor/{AdvisorChatPanel,OwlModeScreen*,CopilotBridgeProvider}.tsx`, `chat/ModelControls.tsx`
- **Builds on:** ADR-0069 (topic boundary), #481 (thinking level medium), #493 (fallback model)

## Context

Until now, the owl's model and thinking depth could only be set via environment variables (`AI_ADVISOR_MODEL`, `AI_ADVISOR_THINKING_LEVEL=medium`). Users want to let it think more thoroughly for difficult questions and to choose the model themselves, while seeing what that costs. The models differ in how the depth is controlled: newer Claude models via `effort`, Claude up to 4.5 via a token budget, Gemini 3 via `thinkingLevel` up to `high`, others not at all. A wrong parameter leads to a 400 error.

## Decision

1. **Two levels per message:** „Gründlich“ ("Thorough") is the previous default (medium) and remains the default setting. „Max“ thinks considerably deeper: Claude `effort: high`, Gemini `high`, Claude up to 4.5 a budget of 16,000 tokens. Claude `effort: max` was measured and rejected: for a simple question it needed 330 s instead of 17 s and about 15 times the cost of Gründlich (the user's decision after the test run). If a model cannot go deeper than Gründlich, there is no Max. Max applies only to the one message and switches itself off afterwards. A Max answer gets room for 20,000 tokens and the time of a task (120 s instead of 60 s); with the usual 4,096 tokens and 60 s it came back empty in the test run or ran into the time limit. It does not count extra against the daily quota; there is no separate limit.
2. **Model per conversation:** the user chooses from all chat models of the providers for which a key is stored. The list comes from the provider itself (Anthropic `GET /v1/models`, Gemini `models`, OpenAI `models`), is cached for 6 hours and always contains the default model. The default is Gemini 3.8 Flash with Gründlich (medium), even without an operator setting; every new conversation starts with it preselected. The fallback model is Claude Sonnet 5.5. The choice is stored on the conversation (`BeraterGespraech.modell`, "provider:model"). If the key of a chosen provider is missing later, the default model answers.
3. **One capability list in the core** (`advisor-models.ts`) defines per model how the depth is controlled and which levels exist. API (model setup) and app (offering) read the same list; the server checks itself.
4. **Costs relative and measured:** every answer stores in its usage (`verbrauch`, without content) provider, model, level, tokens and the time to the first word. The app shows the median of the last 2,000 answers relative to the default model with Gründlich, e.g. „ca. 3× Kosten · erste Worte nach ca. 15 s“ ("approx. 3× cost · first words after approx. 15 s"). Under 5 answers it says „noch nicht gemessen“ ("not measured yet"). A cost factor needs token prices; stored are Anthropic's list prices and, for Gemini 3.8 Flash, Google's regular price ($1.50 / $7.50 per million tokens; not the introductory price until 31.12.2026, so that the factors do not jump in January). Without a price it shows „Kosten noch nicht bekannt“ ("Cost not known yet") with the measured waiting time.
5. **Stays with the operator:** document scan, topic check (guard) and fallback model do not follow the choice. If the fallback model steps in on a Max question, it thinks at its own highest level; the status line says who is answering.
6. **No keys in URLs:** the model lists are requested with the key in the header (`x-api-key`, `x-goog-api-key`, `Authorization`).

## Consequences

- According to the measurement, Max costs several times as much as Gründlich; without a limit the user bears the decision alone, and the relative figure is the only brake.
- New models of a provider are selectable immediately, before they have passed the real-data test run. A model that calculates worse on tax then appears in the offering without a warning. Both are deliberately decided this way and can be restricted later (operator list, limit for Max).
- Switching the model in the middle of a conversation loses that conversation's prompt cache; that is why the model choice applies per conversation, not per message.
- Prices of other providers are missing; their cost factor stays unknown until prices are stored.
