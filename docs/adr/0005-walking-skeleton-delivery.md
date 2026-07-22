# ADR-0005 — UI takeover delivered as vertical slices, walking-skeleton first

**Status:** Accepted · 2026-07-22

## Context

The design-system UI (all screens, as HTML/JSX prototypes) is to be implemented for real in the Expo
app. The tempting path — port every screen statically first "so the UI stands" — conflicts with the
process: it produces a big, untested drop with hardcoded German strings (violating §2.5) and
placeholder data, all of which is substantially reworked when real data, honest states, and tests
arrive. §6 wants one logical change per PR; §3.5 wants acceptance against the real artifact early.

The visual breadth "seeing the whole UI" is **already provided** by the design-system prototype and
(for components) the state-gallery — re-porting static screens duplicates it.

## Decision

- Deliver the UI takeover as **vertical slices**, **walking-skeleton first**: the first slice
  (**REQ-001**, Cockpit) proves the whole architecture end-to-end (seed → API → typed client →
  TanStack Query → DS components → screen → i18n → acceptance test) and establishes every reusable
  pattern.
- Each slice = **one REQ + tests-first + one PR**; each screen arrives **complete** (data + honest
  empty/loading/error states + i18n + tests), never static-then-rework.
- The hardest visual risk (bespoke Funke effects on RN/RNW) is proven in `packages/ui` + the
  **state-gallery** as components are ported on demand, not by porting static screens.
- Visual breadth is carried by the **design-system prototype** (reference) + the gallery, not by a
  static re-port.

## Consequences

- End-to-end proof is early; patterns are established once and reused; the app widens screen by screen.
- The design-system prototype stays the canonical visual reference throughout.

## Alternatives considered

- **All screens static first, then wire** — rejected: rework + forbidden hardcoded/untested debt; the
  breadth it buys already exists in the prototype.
- **All DS components + gallery first, then screens** — viable fallback ordering (broad visual proof
  early) but defers the end-to-end data proof; kept as a contingency, not the default.
