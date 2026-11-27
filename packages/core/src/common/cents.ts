/** A euro amount in exact cents: sums of amounts with cents leave float noise (-3847.0600000000004) that must not reach a figure. */
export const roundToCents = (value: number): number => Math.round(value * 100) / 100
