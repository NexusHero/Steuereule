import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

// Advisor eval (ADR-0069): typical advice questions against the REAL model, checked for what a
// good answer must contain. Costs money and is not deterministic, so it runs by hand only, when
// the steuerberater skill or the owl's prompt changed:
//
//   AI_EVAL_GEMINI_API_KEY=… pnpm --filter @steuereule/api test:eval
//
// Without the key every case is skipped. It needs no database.
export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ['test/eval/**/*.eval.test.ts'],
    fileParallelism: false,
    testTimeout: 180_000,
    // The model is not deterministic: a case counts as broken when it fails twice in a row.
    retry: 1,
    env: { NODE_ENV: 'test', VITEST: 'true' },
  },
})
