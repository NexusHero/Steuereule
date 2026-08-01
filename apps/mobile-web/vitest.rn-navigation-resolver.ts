// Scoped resolution for react-native-screens / react-native-safe-area-context under Vitest
// (#238 task 1a, Musti's review of 2026-08-01 on 810a513/dfe4895 — see vitest.config.ts for the
// full account of what the first attempt got wrong).
//
// Two things are true about these two packages that together caused task 1a's original failure:
//
// 1. Their `main` (CJS) build is genuine `require(...)`-based CommonJS, not a transpiled-to-CJS
//    ESM module — and vite-node's SSR transform only rewrites `import`/`export` syntax into its
//    own instrumented, resolver-aware form. A file with no ESM syntax to rewrite (this is one)
//    keeps its raw `require(...)` calls, which then run through a real, unmodified Node
//    `require` — bypassing Vite's resolver, and therefore this plugin, entirely, regardless of
//    `deps.inline` in vitest.config.ts (that only controls whether the *top-level* import is
//    externalised, not what a CJS file's own internal `require`s do once loaded). Their `module`
//    build, by contrast, is real `import`/`export` syntax, which *does* get rewritten — so it is
//    the only build whose internal resolution this plugin (or anything else Vite-side) can
//    actually influence at all.
// 2. Independently of (1): both builds ship a real web implementation next to the native one,
//    disambiguated purely by filename (`Foo.web.js` sits next to `Foo.js`, never instead of it).
//    Vite's default `.js`-only extension resolution deterministically picks the *native* file
//    whenever both exist, which pulls in `react-native/Libraries/*`'s Flow-typed source and
//    fails to parse (esbuild has no Flow support).
//
// So the fix has to do two things, both scoped to exactly these two packages, nothing else:
// resolve their own top-level import to the `module` build (not `resolve.mainFields` — that is
// a *global* Vite option and moving it broke `react-native-web`'s resolution, see
// vitest.config.ts), and prefer `.web.js` for every relative import inside that build.
//
// Every other package (`react-native-web` chief among them) never reaches either branch here —
// `resolveId` returns `null` for anything that isn't one of these two packages' own bare import
// or an import whose *importer* already lives inside one of their `lib/module` directories.
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'

const PLATFORM_SPLIT_PACKAGES = ['react-native-screens', 'react-native-safe-area-context']

/** `.web.js` first, then the bare file, then the same two as a directory index — the only
 * resolution vocabulary these two packages' own build output actually uses. */
function preferWebVariant(pathWithoutJsExtension: string): string | null {
  const candidates = [
    `${pathWithoutJsExtension}.web.js`,
    `${pathWithoutJsExtension}.js`,
    join(pathWithoutJsExtension, 'index.web.js'),
    join(pathWithoutJsExtension, 'index.js'),
  ]
  return candidates.find(existsSync) ?? null
}

/** Reads the package's own `module` field directly — not Vite's `resolve.mainFields` — so
 * nothing here can leak into any other package's field-preference order. Resolved starting from
 * the importer (or this file, for the top-of-graph case), which is what makes it correct under
 * pnpm's strict, per-dependency `node_modules` layout. */
function moduleEntryFor(packageName: string, importer: string | undefined): string | null {
  try {
    const pkgJsonPath = createRequire(importer ?? import.meta.url).resolve(`${packageName}/package.json`)
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as { module?: string }
    if (typeof pkg.module !== 'string') return null
    return preferWebVariant(join(dirname(pkgJsonPath), pkg.module).replace(/\.js$/, ''))
  } catch {
    return null
  }
}

function importerIsInsideScopedModuleBuild(importer: string): boolean {
  return PLATFORM_SPLIT_PACKAGES.some((pkg) => importer.includes(`/node_modules/${pkg}/lib/module/`))
}

export function screensWebPlatformResolver(): Plugin {
  return {
    name: 'screens-web-platform-resolver',
    enforce: 'pre',
    resolveId(source, importer) {
      if (PLATFORM_SPLIT_PACKAGES.includes(source)) {
        return moduleEntryFor(source, importer)
      }
      if (importer && source.startsWith('.') && importerIsInsideScopedModuleBuild(importer)) {
        return preferWebVariant(join(dirname(importer), source).replace(/\.js$/, ''))
      }
      return null
    },
  }
}
