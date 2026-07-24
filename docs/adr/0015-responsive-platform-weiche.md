# ADR-0015: Responsive Layout via Platform Switch (Option C)

## Context

The app runs as a universal Expo + React-Native-Web app. We need wider layouts on tablets and
desktops. Option A (ADR-0014) uses breakpoint tokens + a `useBreakpoint` hook for fine-grained
responsive switching (375/768/1280). This ADR documents the simpler **Platform-Weiche** approach
as an alternative: switch layout based on `Platform.OS` only.

## Decision

We use `Platform.OS` from React Native to make a **binary** layout decision:

- `'web'` → wide layout (`maxWidth: 800`)
- `'ios'` / `'android'` → mobile layout (`maxWidth: 460`)

No tokens, no hooks, no resize reactivity. The decision is static per runtime.

### Implementation

```tsx
import { Platform } from 'react-native'

const isWide = Platform.OS === 'web'
const maxWidth = isWide ? 800 : 460
```

Each screen's `makeStyles` reads `Platform.OS` once and returns the appropriate `maxWidth`.

## Consequences

- **Positive**: Dead simple — no tokens, no hooks, no re-renders, no test mocking needed.
- **Positive**: Zero runtime cost — `Platform.OS` is a static constant.
- **Negative**: Cannot distinguish tablet from desktop — both are `'web'`. A 768px iPad gets the
  same 800px maxWidth as a 2560px monitor.
- **Negative**: Breakpoint values are hardcoded in screen files, not token-driven. Changing the
  thresholds means editing every screen instead of one manifest entry.
- **Negative**: No resize reactivity — on web, resizing the browser window never changes the
  layout (the platform is always `'web'`, regardless of window width).

## Alternatives Considered

| Alternative | Why not chosen here |
|-------------|-------------------|
| ADR-0014 (breakpoint tokens + hook) | More complex, but more flexible (3 breakpoints, token-driven, resize-reactive). Offered as a separate PR. |
| `useWindowDimensions` | Reactive but requires a hook and re-renders — more machinery than a static platform check. |
| CSS-only media queries | No native path (React-Native doesn't support `@media`). |
