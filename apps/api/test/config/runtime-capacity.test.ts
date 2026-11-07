import { describe, expect, it } from 'vitest'
import {
  computeAdaptiveDbPoolSize,
  computeAdaptivePdfConcurrency,
  detectContainerMemoryBytes,
  isUnderMemoryPressure,
  withAdaptiveDatabasePoolUrl,
} from '../../src/config/runtime-capacity.js'

const MiB = 1024 * 1024
const GiB = 1024 * MiB

describe('runtime-capacity (cgroup & CPU self-calibration)', () => {
  describe('detectContainerMemoryBytes', () => {
    it('reads cgroup v2 memory.max when finite and smaller than host memory', () => {
      const bytes = detectContainerMemoryBytes({
        hostTotalMemoryBytes: 16 * GiB,
        readCgroupFile: (path) => {
          if (path === '/sys/fs/cgroup/memory.max') return `${1 * GiB}\n`
          throw new Error('ENOENT')
        },
      })
      expect(bytes).toBe(1 * GiB)
    })

    it('falls back to cgroup v1 memory.limit_in_bytes when cgroup v2 is absent', () => {
      const bytes = detectContainerMemoryBytes({
        hostTotalMemoryBytes: 16 * GiB,
        readCgroupFile: (path) => {
          if (path === '/sys/fs/cgroup/memory/memory.limit_in_bytes') return `${2 * GiB}\n`
          throw new Error('ENOENT')
        },
      })
      expect(bytes).toBe(2 * GiB)
    })

    it('falls back to host totalmem when cgroup reports "max" (unconstrained container)', () => {
      const bytes = detectContainerMemoryBytes({
        hostTotalMemoryBytes: 8 * GiB,
        readCgroupFile: () => 'max\n',
      })
      expect(bytes).toBe(8 * GiB)
    })
  })

  describe('computeAdaptivePdfConcurrency', () => {
    it('scales from 1 tab on a 512 MiB container up to CPU/RAM-bounded limits on larger containers', () => {
      // 512 MiB container: (512 - 450) / 150 = 0 -> clamped to at least 1 tab
      expect(computeAdaptivePdfConcurrency({ containerMemoryBytes: 512 * MiB, vcpuCount: 1 })).toBe(1)

      // 1 GiB container (k3s pod): floor((1024 - 450) / 150) = 3 tabs
      expect(computeAdaptivePdfConcurrency({ containerMemoryBytes: 1 * GiB, vcpuCount: 1 })).toBe(3)

      // 2 GiB container on 1 vCPU: memory allows 10, CPU bound (1 * 4) caps at 4
      expect(computeAdaptivePdfConcurrency({ containerMemoryBytes: 2 * GiB, vcpuCount: 1 })).toBe(4)

      // 4 GiB container on 4 vCPUs: memory allows floor((4096 - 450) / 150) = 24, CPU bound (4 * 4) caps at 16
      expect(computeAdaptivePdfConcurrency({ containerMemoryBytes: 4 * GiB, vcpuCount: 4 })).toBe(16)
    })
  })

  describe('isUnderMemoryPressure', () => {
    it('triggers when RSS reaches or exceeds 85% of container memory ceiling', () => {
      expect(
        isUnderMemoryPressure({
          rssBytes: 800 * MiB,
          containerMemoryBytes: 1000 * MiB,
        }),
      ).toBe(false)

      expect(
        isUnderMemoryPressure({
          rssBytes: 860 * MiB,
          containerMemoryBytes: 1000 * MiB,
        }),
      ).toBe(true)
    })
  })

  describe('computeAdaptiveDbPoolSize & withAdaptiveDatabasePoolUrl', () => {
    it('computes (vCPUs * 2) + 1 connections per instance', () => {
      expect(computeAdaptiveDbPoolSize(1)).toBe(3)
      expect(computeAdaptiveDbPoolSize(2)).toBe(5)
      expect(computeAdaptiveDbPoolSize(4)).toBe(9)
    })

    it('appends adaptive connection_limit and pool_timeout when not set in DATABASE_URL', () => {
      expect(
        withAdaptiveDatabasePoolUrl('postgresql://u:p@localhost:5432/steuereule', { vcpuCount: 2 }),
      ).toBe('postgresql://u:p@localhost:5432/steuereule?connection_limit=5&pool_timeout=20')

      expect(
        withAdaptiveDatabasePoolUrl('postgresql://u:p@localhost:5432/steuereule?schema=public', {
          vcpuCount: 4,
        }),
      ).toBe('postgresql://u:p@localhost:5432/steuereule?schema=public&connection_limit=9&pool_timeout=20')
    })

    it('preserves explicit operator connection_limit untouched', () => {
      const explicit = 'postgresql://u:p@localhost:5432/steuereule?connection_limit=15'
      expect(withAdaptiveDatabasePoolUrl(explicit, { vcpuCount: 2 })).toBe(explicit)
    })

    it('leaves leading-whitespace URLs untouched so the boot guard sees the exact raw string', () => {
      const invalid = '  postgresql://u:p@localhost:5432/steuereule'
      expect(withAdaptiveDatabasePoolUrl(invalid, { vcpuCount: 2 })).toBe(invalid)
    })
  })
})
