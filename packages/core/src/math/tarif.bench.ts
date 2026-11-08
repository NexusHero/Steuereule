import { bench, describe } from 'vitest'
import { incomeTax, splittingTariff, solidaritaetszuschlag } from './tarif'

describe('Tarif & Tax Engine Throughput Benchmark', () => {
  bench('incomeTax (§ 32a EStG Grundtarif single evaluation)', () => {
    incomeTax(65_000, 2026)
  })

  bench('splittingTariff (§ 32a Abs. 5 EStG married evaluation)', () => {
    splittingTariff(65_000, 45_000, 2026)
  })

  bench('solidaritaetszuschlag evaluation', () => {
    solidaritaetszuschlag(15_000, 2026)
  })

  bench('full tax calculation loop (100 distinct income tiers)', () => {
    for (let income = 10_000; income <= 100_000; income += 1_000) {
      const tax = incomeTax(income, 2026)
      const soli = solidaritaetszuschlag(tax, 2026)
      void (tax + soli)
    }
  })
})
