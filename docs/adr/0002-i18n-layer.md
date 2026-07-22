# ADR-0002 — i18n layer: i18next / react-i18next, German base locale

**Status:** Accepted · 2026-07-22

## Context

ultimate-dev-process §2.5 and review perspective 6: every user-facing string goes through an i18n
layer — a hardcoded string is a finding. The product language is **German** (the app targets the
German-speaking market); the code/process is English. The layer must work on Expo (RN), on
React-Native-Web, and on the separate React-DOM marketing site (ADR-044), and keep tax terminology
consistent with the glossary (Anlage N, Herkunft, Fassung, …).

## Decision

- **i18next + react-i18next.** German is the base/default locale; keys are extracted; the catalog is
  shared across the RN app, RNW, and the marketing site. Mature, RN-proven, largest ecosystem.
- **Numbers, currency and dates stay on the de-DE format helpers**, not i18next number formatting —
  one formatting source (design-system rule 10 / ADR-0001), i18next only for text/plurals.
- Keys/namespaces mirror the glossary so tax terms are translated once and consistently.

## Consequences

- No hardcoded user-facing literals; a lint rule (later) enforces it, review perspective 6 checks it.
- Translations are resource files, versioned; adding a locale later needs no rewrite.
- Copy in the design-system prototype (inline German) is migrated into the catalog as screens are
  ported.

## Alternatives considered

- **LinguiJS** — compile-time, smaller runtime, but a smaller RN ecosystem/tooling surface.
- **react-intl (FormatJS)** — heavier, less RN-idiomatic.
- **expo-localization alone** — provides locale detection but no catalog/management layer.
