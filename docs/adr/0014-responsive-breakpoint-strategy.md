# ADR-0014: Responsive Breakpoint Strategy (Hybrid Approach)

## Status
Accepted

## Context
The Steuereule app runs as a universal Expo + React-Native-Web app. On tablets and desktops the narrow mobile layout (maxWidth: 460) wastes screen space. We need wider layouts for larger screens.

Three approaches were considered:

- **Option A (tokens + hook)**: Breakpoint tokens in `@steuereule/tokens`, `useBreakpoint()` hook in `@steuereule/ui`
- **Option B (CSS media queries only)**: No React hook, pure CSS `@media` — but React-Native-Web doesn't support `@media` in `StyleSheet.create()`
- **Option C (Platform-Weiche)**: `Platform.OS === 'web'` conditional — couples layout to platform, not viewport width

## Decision

We implement a **hybrid responsive strategy** with clear separation of concerns:

### 1. Breakpoint Tokens in `@steuereule/tokens`
- `s: 375`, `m: 768`, `l: 1280`
- Single source of truth, token-driven
- Used by `useBreakpoint()` and future StyleSheet media queries

### 2. `useBreakpoint()` Hook in `@steuereule/ui`
- Returns `"s" | "m" | "l"` based on current window width
- **MUST ONLY be used for structural layout switches at screen root level**
- Example: `if (bp === "s") return <MobileLayout /> else return <WideLayout />`
- **Anti-Pattern: MUST NOT be used for styling tweaks** (padding, font, maxWidth, grid columns) deep in the component tree — this causes cascade re-renders

### 3. Styling Adjustments (Future)
- For pure styling changes (padding, font-size, grid columns), we will use **StyleSheet-based media queries** that resolve natively
- These do NOT cause React re-renders
- This is NOT implemented yet — placeholder for future work

### Structural Layout Switch Pattern

Each screen calls `useBreakpoint()` ONCE at the root and uses the breakpoint value to select between `styles.screen` (maxWidth: 460) and `styles.wideScreen` (maxWidth: 960):

```tsx
function CockpitScreen() {
  const t = useTheme()
  const bp = useBreakpoint()           // ONCE at root
  const styles = makeStyles(t)
  return (
    <ScrollView
      testID="screen-container"
      style={bp === 's' ? styles.screen : styles.wideScreen}
    >
      {/* content */}
    </ScrollView>
  )
}
```

### Screens NOT modified
- `SplashScreen` — fullscreen, no maxWidth constraint

## Consequences
- ✅ Clear rule: hook = structural switch only, styling = media queries (future)
- ✅ Token-driven breakpoint values — change in one place
- ✅ No cascade re-renders from styling hooks
- ✅ E2E testable with Playwright viewport resize
- ⚠️ Today: only structural switching works. Styling media queries are a future feature.
- ⚠️ Screens that currently only need maxWidth adjustment should NOT use the hook — wait for media queries
