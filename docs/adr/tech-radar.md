# Tech Radar

One line per technology so "what's our stance on X" is answerable without skimming the ADR log
(ultimate-dev-process §1.4). Rings: **Adopt** (default choice) · **Trial** (use with care, gaining
confidence) · **Assess** (evaluating, not yet committed) · **Hold** (avoid / legacy).

| Technology | Ring | Decided in |
|------------|------|-----------|
| pnpm workspace + Turborepo | Adopt | ADR-043 |
| Expo + React-Native-Web (universal app) | Adopt | ADR-044 |
| React DOM (marketing site, separate) | Adopt | ADR-044 |
| RN `StyleSheet` + Style Dictionary tokens | Adopt | ADR-050 |
| NestJS + Fastify (API-only) | Adopt | ADR-046 |
| REST + OpenAPI | Adopt | ADR-046 |
| better-auth | Adopt | ADR-046 |
| Prisma + managed EU Postgres | Adopt | ADR-047 |
| Redis (BullMQ queues) | Adopt | ADR-047 |
| k3s on Hetzner (EU) | Adopt | ADR-049 |
| LangChain.js / LangGraph.js (v1.x, behind KiService port) | Adopt | ADR-048 |
| TanStack Query | Adopt | ADR-0001 |
| OpenAPI-generated typed client (orval) | Adopt | ADR-0001 |
| i18next / react-i18next | Adopt | ADR-0002 |
| Prisma seed from single synthetic fixture | Adopt | ADR-0003 |
| Vitest · jest-expo + RN Testing Library · Playwright · MSW | Adopt | ADR-0004 |
| Walking-skeleton / vertical-slice delivery | Adopt | ADR-0005 |
| React Hook Form + Zod (forms) | Assess | _(later slice: Interview)_ |
| Chart library (victory-native / visx) | Hold | tech-direktion (no chart lib in V1) |
| Cloud LLM provider (OpenAI/Anthropic/Gemini/OpenRouter) | Assess | ADR-048 (parked, data-protection) |
| LangGraph RAG for legal knowledge (Eulen-Modus) | Assess | ADR-048 |
