# ADR-0006 — German base + English as a switchable UI locale (language switcher)

**Status:** Accepted · 2026-07-22 · refines ADR-0002

## Context

ADR-0002 chose i18next/react-i18next with **German as the base locale** and noted "adding a locale
later needs no rewrite." The open product question was whether English is merely *possible later* or a
**first-class, shipped locale** the user can switch to at runtime. Decision: ship both, switchable —
the i18n layer is already the cost, so the switch capability is essentially free, and a bilingual
build is a deliberate portfolio signal. The hard part is never the wiring; it is the tax/legal
vocabulary, which does not cleanly translate.

## Decision

- **Two shipped UI locales: `de` (base) and `en`, switchable at runtime** via
  `i18n.changeLanguage(...)`, exposed as a language toggle in Profil. Detected default = `de`
  (the app targets the German-speaking market); the user's choice persists.
- **Both catalogs stay complete as we build.** Every new user-facing key is added with **both a `de`
  and an `en` value at creation time** (review perspective 6 / ultimate-dev-process §2.5 gate). No
  English backlog accrues: English is complete for every screen that exists.
- **Tax and legal terms stay German in both locales.** "Anlage N", "Grenzgänger", "Fünftelregelung",
  "zumutbare Belastung", "Herkunft", "Fassung" are German legal concepts filed in German; in the `en`
  catalog they remain the German term (optionally with an English gloss in body copy), never a
  mistranslation. The glossary namespace is shared, not re-translated per locale.
- **Numbers, currency and dates remain `de-DE` in both locales** — unchanged from ADR-0001/0002. A
  German return is German-formatted regardless of UI language; the de-DE format helpers stay the
  single formatting source. Only text goes through i18next.

## Consequences

- The language switch is a text-layer concern only; `packages/core` formatting is untouched.
- Slightly revises the design-system SKILL rule from "app language is German" to "German base,
  English switchable" — the informal du-form and German tax vocabulary still govern the German
  catalog, and the tax terms carry into the English one.
- CI (later) can assert `de` and `en` key sets are identical, turning "English fell behind" into a
  failing check rather than a silent gap.

## Alternatives considered

- **German only** (the earlier reading of ADR-0002) — simplest, but forecloses a near-free,
  portfolio-relevant capability and would be an expensive retrofit if wanted later.
- **English UI with de-DE money only, no German UI** — wrong market fit; German must be the base.
- **Auto-translate the English catalog** — rejected for tax/legal copy: a wrong translation of a
  legal term is worse than the German term shown as-is.
