---
name: steuereule-design
description: Use this skill to generate well-branded interfaces and assets for SteuerEule (Design-Sprache „Funke"), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Load-bearing rules (never break):
- **Language convention:** English is the default across the whole development process — code,
  identifiers, comments, commit messages, PR titles/bodies, technical docs. The **app/product
  language is German base, English switchable** (ADR-0006): German is the default user locale
  because SteuerEule targets the German-speaking market, and English is a shipped, runtime-
  switchable locale. All user-facing copy goes through i18n keys (never hardcoded); every new key
  is added with **both a `de` and an `en` value** at creation time. Tax terms (Anlage N, Herkunft,
  Fassung, Grenzgänger) and the informal „du" form stay German in **both** locales; numbers and
  currency stay `de-DE` in both. The existing German product/design documentation (guidelines,
  ADRs) stays German.
- Violett `#7C5CFF` markiert AUSSCHLIESSLICH KI-Output (`data-ai="true"`); Limette `#C9F229` ist die App.
- Jede Zahl trägt einen Herkunfts-Chip (Beleg, Regel, Rechenweg). Zahlen immer `tabular-nums`.
- Genau eine Primäraktion pro Screen. Deutsch, du-Form, keine Emoji.
