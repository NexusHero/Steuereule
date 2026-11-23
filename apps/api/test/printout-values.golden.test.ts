// Pins the whole output of `printoutValues` for representative facts. The snapshot is the JSON text,
// so the order of the field ids and of the gaps is pinned along with the values.
import { describe, expect, it } from 'vitest'
import { printoutValues } from '../src/printout/printout-values.js'
import { GOLDEN_CASES } from './fixtures/printout-facts.js'

describe('printoutValues golden output', () => {
  for (const [name, facts] of Object.entries(GOLDEN_CASES)) {
    it(name, () => {
      expect(JSON.stringify(printoutValues(facts), null, 2)).toMatchSnapshot()
    })
  }
})
