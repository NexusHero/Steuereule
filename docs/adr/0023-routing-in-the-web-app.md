# ADR-0023 — Routing in the web app: `@react-navigation/native` with a `linking` configuration

- **Status:** Accepted
- **Date:** 2026-08-01
- **Deciders:** Stakeholder (NexusHero). Options and the technical half by Musti (lead); the ruling
  went **against** the lead's recommendation (Option C), which is recorded below rather than
  re-argued.
- **Context tags:** frontend, navigation, new runtime dependency
- **Introduced by:** REQ-014 / `steuereule#238` (QR device authorization), PR `steuereule#239`

## Context

The app has never had URL handling. Navigation was a `useState<Stage>` union at the composition root
(`apps/mobile-web/App.tsx:44` before this slice). Every screen was reachable only by having pressed
the thing before it.

REQ-014 breaks that. A QR code opens a URL on a *second* device, and that URL has to resolve to a
screen. There is no in-memory state to carry the user there, so navigation stops being an internal
detail and becomes an external contract.

Three constraints were checked before any option was ranked:

- **`app.json` is `web.output: "single"`** (SPA). This is *not* the constraint it is usually taken
  for — `expo-router` supports single/SPA output. The real constraint is elsewhere.
- **The test harness is Vitest + `@vitejs/plugin-react` + jsdom** (`apps/mobile-web/vitest.config.ts`),
  not Metro and not `jest-expo`. `expo-router` resolves its route tree through Metro's
  `require.context`, and `expo-router/testing-library` is built on `jest-expo`; under Vitest neither
  exists.
- **`react-native-web`'s `Linking` is not a router primitive.** `getInitialURL()` returns a value
  captured once at module load (`react-native-web/dist/exports/Linking/index.js:12`) and its `url`
  event fires only for `openURL` calls made through it — never for a real `popstate`. Anything built
  on it is a deep-link reader, not a router.

A new framework or major dependency is a forward-looking architecture decision, so the choice went to
the stakeholder rather than being settled by the lead or by the implementing developer.

## Decision

**`@react-navigation/native` with a `linking` configuration.** It is a plain React library with no
bundler-level requirements, which is what separates it from `expo-router`'s Metro/`jest-expo`
coupling.

Landed dependencies (`apps/mobile-web/package.json`):

| Package | Version | Why it is here |
|---|---|---|
| `@react-navigation/native` | `^7.3.14` | The router itself; owns the `linking` URL↔state mapping |
| `@react-navigation/native-stack` | `^7.18.6` | The chosen navigator |
| `react-native-screens` | `~4.11.1` | Required by the native-stack navigator |
| `react-native-safe-area-context` | `5.4.0` | Required by the native-stack navigator |

Four packages, not one. Every future navigator inherits them.

### Normative constraint — the composition root

**The router lives at the composition root only.** `App.tsx` is the one file in `apps/mobile-web`
permitted to import from `@react-navigation/*`.

**Screens stay prop-driven.** A screen receives callbacks (`onDone`/`onGuest`/`onNavigate`-style) and
**never imports the router, never calls a navigation hook, and never imports a navigation type.** The
route wrapper components at the root are what translate a screen's callback into a
`navigation.navigate`/`replace` call.

This is normative, not advisory: **a diff in which a screen imports from `@react-navigation/*` is
refused at review**, and this clause is what authorises that refusal. It is a design constraint being
imposed, not a prediction about how the code will turn out.

## Consequences

**Positive**

- `Stage` is retired in favour of a typed `RootStackParamList` route table at the root. Every stage
  that existed is now a real, externally openable URL.
- **The composition-root constraint bounds the test blast radius to one file.** 14 of the 15 existing
  `apps/mobile-web` test files mount a component directly with props (exactly one `render(` call per
  screen test); only `App.test.tsx` mounts the real `App`. **With the constraint the radius is 1 file;
  without it, 15.** The number follows from the constraint, not from which router was chosen — it
  would have held under Option C too.

**Negative / accepted**

- **Job Size 8 on `#238` predates the harness question and does not price it.** The estimate was set
  before anyone knew whether these packages run under Vitest+jsdom. It was never re-cut. Any reading
  of this slice's cost against 8 is reading against a number that answers a different question.
- **Making the harness run these packages cost a bundler-resolution fix, and the first version of it
  silently moved the harness off production's `react-native-web` build.** This cost was not on the
  table when the option was chosen, and it is specific to Option B. Checked against the installed
  `@expo/metro-config@0.20.18` (`build/ExpoMetroConfig.js:182`), which is what actually bundles this
  app's web output:

  ```js
  resolverMainFields: ['react-native', 'browser', 'main'],
  ```

  **`module` is not in Metro's list at all.** `react-native-web@0.20.0` ships no `exports`, no
  `browser` and no `react-native` field, so Metro resolves it through `main` → `dist/cjs/index.js`.

  | | resolves `react-native-web` to |
  |---|---|
  | Metro web (what ships) | `dist/cjs/index.js` |
  | Vitest, before this slice | `dist/cjs/index.js` |
  | Vitest, with `mainFields: ['module', 'main']` | `dist/index.js` |

  So a global config that prefers `module` does **not** move the harness closer to production — it
  moves it *away*, in a third direction, on the app's entire UI primitive layer, **while the suite
  stays green throughout**. A green suite was never going to catch it; comparing resolved module
  paths is what did. Option C would not have introduced this divergence at all.

  **Resolved in `ce37cc3`, and the invariant is now enforced rather than promised.** The global
  `resolve.mainFields`/`resolve.extensions` override was replaced by two mechanisms scoped to
  exactly the three navigation packages that need them (`deps.inline` for their extensionless
  relative imports; a dedicated `screensWebPlatformResolver` plugin for the `.web.js`-beside-`.js`
  case). The standing invariant — **the harness must resolve the same `react-native-web` build Metro
  ships** — is asserted directly by `reactNativeWebProductionParity.test.tsx`, via `require.resolve`,
  and **control-proved per ADR-0021**: reintroducing the exact `mainFields` override with nothing
  else changed turns the assertion red (the resolution canary recorded 392 resolved paths inside the
  package, the first being `dist/index.js`, the `module` build); reverting turns it green. The
  transitive-dependency question left open at review time (`styleq`, `inline-style-prefixer`, …) is
  answered by the same mechanism rather than package by package: Vite's resolver never gets far
  enough into `react-native-web` to load any of its files.

  **A *global* `resolve.mainFields`/`resolve.extensions` override must never come back.** That is the
  durable rule this episode bought; the parity test is what keeps it from being a comment nobody
  reads.

- **`useFrameSize` cannot be proven under jsdom, so the Chromium e2e gate is load-bearing for the
  router.** jsdom does not implement `ResizeObserver`; the test setup supplies a no-op that never
  fires, so `@react-navigation/elements`' `useFrameSize` sees no frame size. A navigator that renders
  correctly only *after* a real measurement would look green in Vitest and be wrong in a browser.
  This is a standing limitation of the harness, not a temporary one — **it belongs in the T1 test
  plan, not only in a code comment.**
- **Coverage applies to the router like everything else.** `vitest.config.ts` enforces 90%
  statements/branches/functions/lines. The route table and its wrappers are production code and carry
  that burden.

## Alternatives considered

**Option C — an in-house `Router` module at the composition root** (path-based, History API
`pushState`/`popstate`, typed `Route` union replacing `Stage`). ~100–150 lines we own and test, zero
new dependencies, and the only option that **provably** ran against the harness as it stood. **This
was the lead's recommendation and it was not taken.** Recorded because the trade-off it names — one
slice, one unbounded risk — is the thing a future reader will want to weigh again if the dependency
cost above compounds.

**Option A — `expo-router`.** Framework-native to Expo, file-based, real deep linking. Rejected on
cost: it needs Metro's `require.context` and `jest-expo`, i.e. a test-harness migration or a Vite
shim *inside this slice*, and it replaces `index.js`'s `registerRootComponent(App)` entry — which is
exactly what `App.test.tsx:35-46`'s deliberate dynamic-import-after-MSW ordering hangs off. Nobody
here has run `expo-router` under Vitest, and that work was never sized.

**Building on `react-native-web`'s `Linking`.** Not viable — see Context; it cannot observe
`popstate`.
