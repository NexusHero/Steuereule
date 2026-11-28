# ADR-0102 — Ports & Adapters: two architecture tests enforce the boundaries

- **Status:** Accepted
- **Date:** 2026-11-22
- **Deciders:** NexusHero (Product Owner), SteuerEule Engineering
- **Applies to:** `apps/api/test/architecture.test.ts`, `apps/api/test/architecture-module-edges.json`, `packages/core/src/architecture.test.ts`, `apps/api/src/llm/single-shot-model.ts`, `apps/api/src/auth/bearer-token.repository*.ts`, `apps/api/src/common/transaction-runner.ts`, `docs/architecture.md` §4.1
- **Builds on:** ADR-0038 (deterministic core and KI port), ADR-0008 (field encryption), ADR-0021 (a control is proven by breaking it), ADR-0052 (assistant access over OAuth)

## Context

SteuerEule is built as Ports & Adapters (hexagonal architecture): a calculation core `@steuereule/core` without npm dependencies, application services in `apps/api`, and adapters at their edge for HTTP, the database, language models, payment and mail. Little of that was enforced. An audit on 2026-11-22 and an independent review of the first draft of this decision found:

1. **SDK imports in feature code.** Three document parsers and the owl's topic guard imported LangChain types. `auth/user-context.guard.ts` read three OAuth tables directly through `PrismaService`.
2. **Ports that depended on their adapter.** `account-deletion.repository.ts` imported its result type from the Prisma adapter. The `TransactionRunner` port shared a file with its Prisma implementation in `prisma/transaction.ts`, and `mcp-report.service.ts` asked `instanceof PrismaTransactionRunner`.
3. **A core test that checked less than it claimed.** `packages/core/src/architecture.test.ts` did not read folders recursively, so it never saw `domains/business/**` or `domains/ledger/**`. The documentation called the folders an acyclic stack `interview → domains → engine → math`. Measured, there are two folder-level cycles: `engine ↔ domains` and `domains ↔ interview`.
4. **No statement about coupling between feature modules.** 352 module-to-module edges between 50 folders, 16 pairs importing each other. Nothing stopped edge 353.

None of these was a bug in behaviour. Each makes the next one cheaper, and review finds such breaches only by chance.

## Goals

- A feature module in `apps/api` cannot import the database client or an external SDK without `pnpm test` failing. That includes the detours through `src/prisma/**` and through adapter classes.
- Every exception is one row of a table in the test, visible in review. An exception nobody needs any more fails the test too.
- New coupling between feature modules and new backward imports in the core are a visible decision, not a side effect.
- No new tool, no runtime cost.

## Non-goals

- **Reducing the existing coupling.** The 352 edges and the two folder cycles in the core stay. They are now measured and can only shrink.
- **Constraining tests.** The rules apply to `apps/api/src/**` and `packages/core/src/**` without test files. Tests may build adapters and SDKs directly.
- **`apps/mobile-web`.** The web app has no equivalent check.

## Decision

### 1. SDK boundaries as a table in `apps/api/test/architecture.test.ts`

The test reads every static and dynamic import under `apps/api/src` and checks it against a table. Each row names an SDK and the files that may import it:

| Boundary | What belongs to it | Allowed in |
|---|---|---|
| Database client | `@prisma/*`, `@prisma-keystore/*`, `prisma-field-encryption`, `@better-auth/prisma-adapter`, everything under `src/prisma/` except `prisma.module.ts` | `*.prisma.ts`, `prisma/`, and seven infrastructure files listed by name |
| Prisma adapters | every `*.prisma.ts` file | `*.module.ts` (binds a port to its adapter), `*.prisma.ts`, `auth/better-auth.ts` |
| LangChain | `@langchain/*` | eight files in `ki/`, listed by name |
| Stripe | `stripe` | `unlock/stripe-payment-provider.ts` |
| nodemailer | `nodemailer` | `auth/smtp-email-sender.ts` |
| better-auth | `better-auth`, `@better-auth/*` | `auth/`, `device/` |
| MCP SDK | `@modelcontextprotocol/*` | `mcp/` |
| Redis client | `ioredis` | `run-log/run-log.redis.ts`, `advisor/run/advisor-run-log.redis.ts`, `advisor/advisor.module.ts` |
| Playwright | `playwright-core` | `account/export/pdf-renderer.playwright.ts` |
| pdf-lib | `pdf-lib` | `printout/form-renderer.ts` |
| OpenTelemetry | `@opentelemetry/*` | `telemetry/` |
| Child processes | `node:child_process` | `business/elster-transmission.ts` |

Three properties of the table:

- **Each boundary is checked on its own.** A file that touches two boundaries needs permission in both. `auth/guest-account-upgrade.prisma.ts` is one: a Prisma adapter and a better-auth hook at once.
- **Named exceptions expire.** If a file is listed but no longer imports the SDK, the test fails. The list cannot go stale.
- **LangChain is confined to named files, not to a directory.** A new file in `ki/` may import LangChain only once it is in the table. The ports in `ki/` (`single-shot-model.ts`, `advisor-engine.token.ts`) are not.

### 2. Module coupling as a ratchet

The same test computes every *module → module* edge (a module is a folder directly under `src`) and compares the set with `apps/api/test/architecture-module-edges.json`. A difference in either direction fails: a new edge has to be added to the baseline on purpose, a removed one has to be struck. `UPDATE_ARCHITECTURE_BASELINE=1` rewrites the file.

### 3. The core test checks what actually holds

`packages/core/src/architecture.test.ts` now reads recursively and checks three things:

- **Allowed directions** between the five folders, as they exist today. `math` imports nothing, `common` only `math`, `engine` never `interview`.
- **Backward imports as a list.** Against the intended order `interview → engine → domains → common → math`, 13 files in `domains` import from `engine` and 10 from `interview`. The lists live in the test and may only get shorter.
- **No cycle of value imports between files.** That holds today and stays so. Type-only imports are exempt.

### 4. New and cleaned-up ports

- **`SingleShotModel`** (`llm/single-shot-model.ts`): one system prompt, one user message, text back, abortable with an `AbortSignal`. Four users: the parsers for receipts, the wage tax certificate and the Swiss salary certificate, and the topic guard. `KiModule` derives its factory from `CHAT_MODEL_FACTORY`, so both resolve a model slot the same way. The dependency is not optional: without a binding, Nest refuses to start.
- **`BearerTokenRepository`** (`auth/bearer-token.repository.ts`): three lookups for the guard. The guard still makes every decision itself (expired, revoked, client disabled, no consent).
- **`TransactionRunner`** now lives in `common/transaction-runner.ts`, apart from `PrismaTransactionRunner`. Instead of `instanceof`, the simulation asks the port for `rollsBack` and `isActive()`.
- **Ports own their types.** `DeleteAccountResult` is declared in the port `account-deletion.repository.ts`.
- **Tokens without SDK baggage.** `ADVISOR_ENGINE` is in `ki/advisor-engine.token.ts`, `assertFakeKiNotInProduction` in `llm/fake-ki-env.ts`. Importing them no longer loads LangChain.
- **Adapters say what they are.** `delete-account-transaction` and `guest-account-upgrade` are named `*.prisma.ts`.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **oxlint `no-restricted-imports` with overrides** (the first draft of this ADR) | A later override replaces an earlier one's rule entirely. A file in two adapter groups cannot be expressed, and every additional SDK group has to be repeated in every other override (4 groups took 244 lines). Relative paths such as `../prisma/encrypted-prisma.provider.js` and adapter classes went unchecked. Seeing the message in the editor does not outweigh that. |
| **dependency-cruiser** | Does the same and draws graphs. It would be another tool with its own configuration language. The test is about 200 lines, runs in milliseconds in the existing suite and is written in the language of the code. If the rules grow substantially, dependency-cruiser is the next step. |
| **Re-layering the core in this change** | The backward imports involve 23 files and the calculation model `engine/berechnung.ts`, which almost every vertical uses. That is a refactoring of its own. Until then the ratchet keeps it from getting worse. |
| **Review and documentation only** | That was the state before. |

## Consequences

- **Positive:** A violation fails `pnpm test` and the CI job `test`, with a message naming the file, the SDK and the port to use.
- **Positive:** The documentation can call a boundary *checked* and name the test.
- **Negative:** No hint in the editor. A violation shows up only when the tests run.
- **Negative:** Imports are found by pattern. A path computed at runtime, for example through `createRequire`, is invisible.
- **Negative:** `*.module.ts` may import any adapter class, because modules bind ports to adapters. Some modules hold more than wiring, for example `advisor/advisor.module.ts`, which chooses the Redis run log. Business logic placed there would go unnoticed.
- **Negative:** Every new dependency between modules produces a line in the baseline diff. That is intended and costs one extra step.

## Known limits

- **LangChain is not behind a port; it is in eight files.** The owl's prompt assembly (`ki/advisor-prompt.ts`), tool round and tool context are written in LangChain types. `mcp/` imports `TOOL_ARG_SCHEMAS` from `ki/advisor-tools.ts` and loads LangChain with it.
- **`pdf-lib` has no port.** `printout/form-renderer.ts` is the only file importing it, but services call `renderForms` directly.
- **DI tokens are not type-checked.** `@Inject(TOKEN) x: Port` trusts the module to bind a matching adapter. A missing binding fails at start-up (`test/boot/build-app-stays-database-free.test.ts`), a wrong one only in integration tests.

## Proof (ADR-0021)

The proof is in the repository and runs with every test run:

- `apps/api/test/architecture.test.ts` feeds the same check function twelve constructed violations, one per rule, and expects exactly one finding for each. Five constructed permitted imports must yield none.
- The core test was broken on 2026-11-22 with four probe files: an import from `math` into `engine`, a new import from `domains/business` into `interview`, and a cycle of two files in `common`. Four of six tests went red, and green again after removal.
- On its first run the API test found an exception nobody needed (`config/database-url.ts` does not import Prisma). It was struck.

## Update 2026-11-23: the core cycles are gone

The two folder cycles are removed. The modules `domains` used from above now sit in `domains`: the calculation model (`engine/berechnung.ts` → `domains/calculation.ts`), the assessment module, the filing-type comparison and the most-favourable check; the answer model of `interview/interview.ts` moved to `domains/answers.ts`, `AdvisorActionStatus` to `domains/action-status.ts`, and `Range` to `common/range.ts`. The backward lists are deleted. `ALLOWED` is now a strict order, `math → common → domains → engine → interview`, without exceptions.

The core test gained a third rule: no year compared with a bare literal outside `math/tax-parameters.ts`. Of the 36 lines with such a comparison in the core, 35 now read named years (`RULE_CHANGE_YEARS`, `appliesFrom`) or year steps (`valueForYear`) from there; the calendar guard in `common/workdays.ts` (2000 to 2100, not a tax rule) uses two named constants in its own file. The API holds no such rule; its only year switches are demo data in `business/demo-household.ts`.

Proof: constructed violations for each rule run with every test run (five upward imports, one cycle, six year comparisons, seven lines that must pass). On 2026-11-23 the rules were also broken once in real code, with an import from `domains/childcare.ts` into `engine` and a `year >= 2025` in the same file: both tests went red, and green again after removal.

## Update 2026-11-25: module cycles in the API are measured

The API test computes the strongly connected groups of the module graph. One group of 28 modules imports
itself round in a circle; it is listed in `MODULES_ON_A_CYCLE` and can only shrink. `account` left it:
the personal-data registry, the legal holds, the erasure flag and the move of a Person B's shadow data
moved into the module `personal-data`, which imports only `common` and `prisma`, so `auth`, `business`,
`link`, `submission` and `unlock` no longer import `account`. The guest takeover reaches the receipt files
through `StoragePort.move` instead of the Postgres adapter class.

## Update 2026-11-28: `llm/` and `run-log/` are modules of their own

Two parts of the owl that know nothing about tax returns moved out of `ki/` and `advisor/`, so the edge
baseline now guards the line between them and the tax-specific code:

- **`llm/`**: the chat-model factory, the single-shot port and its LangChain adapter, the slot and limit
  configuration, the model catalog, the connection check, the failure classification. It imports
  `common` and no other module. The day's call budget reads a counter through the port
  `ModelCallCounter` (`llm/model-call-counter.ts`); `KiModule` binds the shared rate-limit storage to it.
  With a direct import of `auth`, `llm` joined the module cycle, and the cycle test failed.
- **`run-log/`**: the run log port with its in-memory and Redis adapters, generic over the event type
  and the run info. `advisor/run/advisor-run-log.ts` names the owl's types and keeps the Redis
  namespace and key purpose the log used before, so instances of two releases read each other's runs.

The scripted model for the `fake` provider stays in `ki/fake-chat-model.ts`, because its script speaks
the owl's tools; `ki/advisor-chat-model.ts` hands it to the factory. `createChatModelFromConfig` in
`llm/` builds provider models only.

New edges in the baseline: `ki -> llm`, `advisor -> llm`, `receipt -> llm`, `lstb-scan -> llm`,
`ch-certificate-scan -> llm`, `llm -> common`, `advisor -> run-log`, `run-log -> common`. No edge was
removed and no module joined the cycle.
