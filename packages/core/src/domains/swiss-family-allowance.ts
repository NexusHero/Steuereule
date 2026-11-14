/**
 * The Swiss Kinderzulage per child for Anlage Kind Zeile 6 (Kz 15) and the Differenzkindergeld (ADR-0088).
 * When both parents work in Switzerland the allowance comes with one parent's wage (Anlage N-Gre Z. 8). A
 * child's own amount wins; else the paying parent's yearly allowances are shared evenly among the children that
 * parent pays for. Children without a payer share what no child is assigned to.
 */
export type AllowancePayer = 'A' | 'B'

export interface ChildAllowanceInput {
  readonly payer: AllowancePayer | null
  /** An amount entered for the child itself, in EUR. */
  readonly ownEur: number | null
}

const positive = (n: number | null | undefined): n is number => n != null && Number.isFinite(n) && n > 0

export function swissAllowancePerChild(
  children: readonly ChildAllowanceInput[],
  totalsEur: Readonly<Record<AllowancePayer, number | null>>,
): (number | null)[] {
  const open = children.map((c) => !positive(c.ownEur))
  const assigned = (p: AllowancePayer) => children.filter((c, i) => open[i] && c.payer === p).length
  const unassigned = children.filter((c, i) => open[i] && c.payer === null).length
  const pool = (['A', 'B'] as const).filter((p) => assigned(p) === 0).reduce((sum, p) => sum + (positive(totalsEur[p]) ? totalsEur[p]! : 0), 0)
  return children.map((c, i) => {
    if (!open[i]) return c.ownEur
    if (c.payer !== null) {
      const total = totalsEur[c.payer]
      return positive(total) ? Math.round(total / assigned(c.payer)) : null
    }
    return pool > 0 ? Math.round(pool / unassigned) : null
  })
}
