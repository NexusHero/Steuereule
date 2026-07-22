# Runtime view — REQ-001 Cockpit read flow

Sequence for the walking-skeleton read path (ultimate-dev-process §1.3). Must match the code shipping
in the REQ-001 implementation slice. Diagrams use Mermaid (project convention).

```mermaid
sequenceDiagram
    actor U as User
    participant App as Expo app (Cockpit)
    participant Q as TanStack Query
    participant C as OpenAPI-typed client
    participant API as NestJS + Fastify
    participant DB as Postgres (seeded)

    Note over DB: docker compose up → Prisma seed<br/>loads one synthetic fixture (no PII)
    U->>App: open Cockpit
    App->>Q: useCockpitSummary(steuerjahr)
    Q->>C: GET /steuerjahre/{jahr}/cockpit
    C->>API: HTTP GET (typed)
    API->>DB: query estimate range + open items
    DB-->>API: rows
    API-->>C: 200 CockpitSummary (OpenAPI schema)
    C-->>Q: typed payload
    Q-->>App: {data | isLoading | isError}
    App-->>U: range (Spannen-Ticker) + "N Angaben offen"<br/>i18n de · tabular-nums · one primary action

    Note over App: honest states —<br/>loading: skeleton · empty: "noch keine Angaben" · error: retry
```

Component tests exercise the same flow with an **MSW** mock pinned to the OpenAPI contract; the
acceptance test (Playwright) runs it against the **real seeded compose stack** (e2e overlay).
