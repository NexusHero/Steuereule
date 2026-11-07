import { readFileSync } from 'node:fs'
import { availableParallelism, totalmem } from 'node:os'

const MiB = 1024 * 1024

/** Baseline RAM reserved for Node.js + the main headless Chromium browser process. */
export const CHROMIUM_BASELINE_BYTES = 450 * MiB

/** Approximate peak RAM consumed by a single Chromium tab rendering an A4 PDF. */
export const CHROMIUM_PER_TAB_BYTES = 150 * MiB

/** High-water mark ratio (85% of container RAM) above which additional concurrent tabs wait. */
export const MEMORY_PRESSURE_RATIO = 0.85

const CGROUP_MEMORY_PATHS = [
  '/sys/fs/cgroup/memory.max',
  '/sys/fs/cgroup/memory/memory.limit_in_bytes',
] as const

export interface ContainerMemoryProbeOptions {
  readCgroupFile?: (path: string) => string
  hostTotalMemoryBytes?: number
}

/**
 * Detects the effective memory ceiling of the current container/process by inspecting
 * Linux cgroup v2 (`memory.max`) and v1 (`memory.limit_in_bytes`), falling back to
 * `os.totalmem()` when unconstrained (`"max"`) or running on non-Linux hosts (macOS).
 */
export function detectContainerMemoryBytes(options: ContainerMemoryProbeOptions = {}): number {
  const hostMem = options.hostTotalMemoryBytes ?? totalmem()
  const readCgroup =
    options.readCgroupFile ??
    ((path: string): string => readFileSync(path, 'utf8'))

  for (const path of CGROUP_MEMORY_PATHS) {
    try {
      const raw = readCgroup(path).trim()
      if (!raw || raw === 'max') continue
      const parsed = Number(raw)
      if (Number.isFinite(parsed) && parsed > 0 && parsed < hostMem) {
        return parsed
      }
    } catch {
      // Cgroup file does not exist on macOS or older kernels; continue to fallback.
    }
  }

  return hostMem
}

export interface AdaptivePdfConcurrencyOptions {
  containerMemoryBytes?: number
  vcpuCount?: number
}

/**
 * Computes the safe concurrent Chromium PDF tab limit from actual container RAM and CPU
 * parallelism instead of a static magic number:
 *
 *   memoryBound = floor((containerMemoryBytes - 450 MiB) / 150 MiB)
 *   cpuBound    = max(2, vCPUs * 4)
 *   limit       = clamp(memoryBound, 1, cpuBound)
 */
export function computeAdaptivePdfConcurrency(options: AdaptivePdfConcurrencyOptions = {}): number {
  const memoryBytes = options.containerMemoryBytes ?? detectContainerMemoryBytes()
  const vcpus = Math.max(1, options.vcpuCount ?? availableParallelism())

  const availableForTabs = Math.max(0, memoryBytes - CHROMIUM_BASELINE_BYTES)
  const memoryBound = Math.max(1, Math.floor(availableForTabs / CHROMIUM_PER_TAB_BYTES))
  const cpuBound = Math.max(2, vcpus * 4)

  return Math.max(1, Math.min(memoryBound, cpuBound))
}

export interface MemoryPressureProbeOptions {
  rssBytes?: number
  containerMemoryBytes?: number
  thresholdRatio?: number
}

/**
 * Returns true when current process RSS exceeds the container memory high-water mark
 * (default 85%), signaling that new memory-heavy jobs should queue behind active ones.
 */
export function isUnderMemoryPressure(options: MemoryPressureProbeOptions = {}): boolean {
  const rss = options.rssBytes ?? process.memoryUsage().rss
  const limit = options.containerMemoryBytes ?? detectContainerMemoryBytes()
  const ratio = options.thresholdRatio ?? MEMORY_PRESSURE_RATIO
  return rss >= limit * ratio
}

/**
 * Computes the per-instance PostgreSQL connection pool size using the standard
 * HikariCP / PostgreSQL core-count formula: `(vCPUs * 2) + 1`, with a minimum of 3.
 */
export function computeAdaptiveDbPoolSize(vcpuCount: number = availableParallelism()): number {
  const cores = Math.max(1, vcpuCount)
  return Math.max(3, cores * 2 + 1)
}

export interface AdaptiveDatabaseUrlOptions {
  vcpuCount?: number
  defaultPoolTimeoutSeconds?: number
}

/**
 * Enriches a PostgreSQL connection URL with an adaptively sized `connection_limit`
 * (`(vCPUs * 2) + 1`) and `pool_timeout` if not already explicitly present in the URL.
 * Preserves any explicit operator setting in `DATABASE_URL` untouched.
 */
export function withAdaptiveDatabasePoolUrl(
  databaseUrl: string,
  options: AdaptiveDatabaseUrlOptions = {},
): string {
  if (databaseUrl !== databaseUrl.replace(/^\s+/, '')) {
    return databaseUrl
  }
  const trimmed = databaseUrl.replace(/\s+$/, '')
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return databaseUrl
  }

  if (parsed.searchParams.has('connection_limit')) {
    return databaseUrl
  }

  const poolSize = computeAdaptiveDbPoolSize(options.vcpuCount)
  const poolTimeout = options.defaultPoolTimeoutSeconds ?? 20
  const separator = trimmed.includes('?') ? '&' : '?'
  const hasPoolTimeout = parsed.searchParams.has('pool_timeout')

  return hasPoolTimeout
    ? `${trimmed}${separator}connection_limit=${poolSize}`
    : `${trimmed}${separator}connection_limit=${poolSize}&pool_timeout=${poolTimeout}`
}
