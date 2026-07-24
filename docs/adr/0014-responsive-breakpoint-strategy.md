# ADR-0014: Responsive Breakpoint Strategy (Hybrid Approach)

## Context

The Tech-Direktion (`finanzo-funke-design-system/project/guidelines/tech-direktion.md`) defines
three viewport targets: **375 / 768 / 1280 px**, and the QA checklist
(`guidelines/qa-checkliste.md`) requires every screen to be tested at all three. The app is built
as a universal Expo + React-Native-Web app (`apps/mobile-web`), running on smartphones, tablets,
and desktop browsers.

Today, all screens hardcode `maxWidth: 460` in their root `ScrollView` style, which centres the
content but never adapts the layout to wider viewports. There are no breakpoint tokens in
`@steuereule/tokens` and no responsive hook in `@steuereule/ui`.

We need a systematic way for screens to switch between mobile and wide layouts so the app makes
honest use of tablets and desktops (the "prüfen & abgeben" use case per the Tech-Direktion).

## Decision

We adopt a **hybrid approach** with two clearly separated concerns:

### 1. Breakpoint Tokens in `@steuereule/tokens`

Three breakpoints are added to the design-system manifest and generated into the theme:

| Token | Value | Meaning |
|-------|-------|---------|
| `breakpoint.s` | 375 | Phone (portrait) |
| `breakpoint.m` | 768 | Tablet |
| `breakpoint.l` | 1280 | Desktop |

These are the **single source of truth** — matching the QA checklist's three viewports exactly.

### 2. `useBreakpoint()` Hook in `@steuereule/ui`

A hook that returns the **current breakpoint** (`'s' | 'm' | 'l'`):

- **On web**: reads `window.innerWidth` via React Native's `useWindowDimensions` (which
  react-native-web maps to the browser viewport), resolves against the token values.
- **On native**: same `useWindowDimensions`, resolves against the device screen width.

Usage is **restricted to structural layout switches only**:

```tsx
// ✅ Correct: top-level structural decision
function CockpitScreen() {
  const bp = useBreakpoint()
  if (bp === 's') return <CockpitMobileLayout />
  return <CockpitWideLayout />
}
```

```tsx
// ❌ Anti-pattern: styling-level decision (causes unnecessary re-renders)
function SomeCard() {
  const bp = useBreakpoint()
  return <View style={{ padding: bp === 's' ? 12 : 24 }}>
}
```

**Why the restriction?** `useWindowDimensions` triggers a re-render on every resize event.
Using it deep in the component tree for padding/font tweaks would cascade re-renders through
the whole subtree. Structural switches at the screen root are acceptable because they swap the
entire subtree anyway (one unmount + one mount, not N style updates).

### 3. Styling-level Responsiveness: StyleSheet (future)

For pure styling adjustments (padding, font size, grid columns) that don't change the component
tree shape, we will adopt StyleSheet-based media queries when react-native-web's support matures
sufficiently. This ADR does **not** block on that — screens that need only a `maxWidth` bump
continue using the existing `makeStyles(t)` pattern. The hook is reserved for genuine layout
forks.

## Consequences

- **Positive**: Screens can now render distinct mobile vs. wide layouts, making the app genuinely
  usable on tablets and desktops (the Tech-Direktion's "prüfen & abgeben" story).
- **Positive**: Breakpoint values are token-driven — changing `s`/`m`/`l` in one place
  propagates to every screen.
- **Positive**: The hook is testable (mock `useWindowDimensions` → assert on breakpoint).
- **Negative**: Every screen that forks needs to maintain two layout variants until/unless a
  shared responsive layout primitive is extracted.
- **Risk**: If developers ignore the anti-pattern rule and use `useBreakpoint` for styling deep
  in the tree, resize performance degrades. Mitigation: the ESLint adherence rules
  (`_adherence.oxlintrc.json`) will flag `useBreakpoint` usage outside of screen-level files.

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| CSS-only media queries | React-Native-Web does support `@media` in `StyleSheet.create`, but the API is not available on native — breaks the universal app contract. |
| `Platform.OS === 'web'` switch | Too coarse: tablet web and desktop web are both `'web'`; can't distinguish 768 vs 1280. |
| Container queries | Not supported by react-native-web; CSS-only, no native path. |
| `Dimension.get('window')` (imperative) | No reactivity — doesn't update on resize/orientation change. `useWindowDimensions` is the RN-blessed reactive API. |
