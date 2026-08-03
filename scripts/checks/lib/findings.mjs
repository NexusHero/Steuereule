// Small findings collector shared by register-check.mjs and adr-check.mjs. Every check
// method runs to completion and records what it found rather than throwing on the first
// problem (ADR-0021's own "control proof" convention below deliberately plants several
// breaks at once and expects one run to name all of them, not just the first).

export class Findings {
  constructor() {
    /** @type {{check: string, message: string}[]} */
    this.items = []
  }

  add(check, message) {
    // De-duplicated: the same (check, message) pair can legitimately be produced more than
    // once (e.g. an ADR number referenced twice in one file) — that's not a second finding.
    if (this.items.some((i) => i.check === check && i.message === message)) return
    this.items.push({ check, message })
  }

  get ok() {
    return this.items.length === 0
  }

  /** Prints every finding, grouped by check id, and returns the process exit code. */
  report(label) {
    if (this.ok) {
      console.log(`${label}: PASS — no findings.`)
      return 0
    }
    console.log(`${label}: FAIL — ${this.items.length} finding(s).\n`)
    const byCheck = new Map()
    for (const item of this.items) {
      if (!byCheck.has(item.check)) byCheck.set(item.check, [])
      byCheck.get(item.check).push(item.message)
    }
    for (const [check, messages] of byCheck) {
      console.log(`[${check}] ${messages.length} finding(s):`)
      for (const m of messages) console.log(`  - ${m}`)
      console.log('')
    }
    return 1
  }
}
