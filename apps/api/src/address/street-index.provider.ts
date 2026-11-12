import { readFileSync } from 'node:fs'
import { Logger, type FactoryProvider } from '@nestjs/common'
import { StreetIndex } from './street-index.js'

/** `null` when no street data is installed: the search then says "not available" instead of guessing. */
export const STREET_INDEX = Symbol('STREET_INDEX')

export function resolveStreetDataPath(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const path = env.STREET_DATA_PATH
  return path && path.length > 0 ? path : undefined
}

const logger = new Logger('StreetIndex')

export function loadStreetIndex(path: string | undefined): StreetIndex | null {
  if (!path) return null
  try {
    const index = StreetIndex.fromCsv(readFileSync(path, 'utf-8'))
    logger.log(`Street data loaded: ${index.size} entries from ${path}`)
    return index
  } catch (error) {
    logger.warn(`Could not load street data (${path}): ${String(error)}; the address search answers "not available".`)
    return null
  }
}

export const streetIndexProvider: FactoryProvider<StreetIndex | null> = {
  provide: STREET_INDEX,
  useFactory: (): StreetIndex | null => loadStreetIndex(resolveStreetDataPath()),
}
