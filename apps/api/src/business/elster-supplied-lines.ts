import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Logger } from '@nestjs/common'
import { parseSuppliedLines, registerSuppliedLines } from '@steuereule/core'

const DEFAULT_DIR = new URL('../../assets/elster-lines/', import.meta.url)

/**
 * Loads the Anlage S/G lines read off Mein ELSTER (ADR-0101 §22) from `assets/elster-lines/*.json`
 * (or ELSTER_SUPPLIED_LINES_DIR). A file that fails the check is skipped and logged, never half used.
 */
export function loadSuppliedElsterLines(dir: string | URL = process.env.ELSTER_SUPPLIED_LINES_DIR ?? DEFAULT_DIR, logger = new Logger('ElsterLines')): number {
  const base = typeof dir === 'string' ? dir : fileURLToPath(dir)
  let files: string[]
  try {
    files = readdirSync(base).filter((f) => f.endsWith('.json'))
  } catch {
    return 0
  }
  let loaded = 0
  for (const file of files) {
    const raw = readFileSync(join(base, file), 'utf8')
    const parsed = parseSuppliedLines(raw, createHash('sha256').update(raw).digest('hex'))
    if (!parsed.ok) {
      logger.warn(`${file} skipped: ${parsed.errors.join(' ')}`)
      continue
    }
    registerSuppliedLines(parsed.supplied)
    loaded++
  }
  return loaded
}
