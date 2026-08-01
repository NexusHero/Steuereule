// In-memory fake keyed by both deviceCode and userCode — mirrors a real DeviceCode
// row's two independent unique keys (ADR-0004: honours the real per-code lookups,
// doesn't just echo back whatever it was fed). Every mutating method throws on an
// unknown code, exactly like the real Prisma `.update()` would (see
// DeviceCodeRepository's own doc comments on why a missing row is a genuine bug, not
// a valid outcome, for the methods where that's documented).
import type {
  DeviceCodeRepository,
  DeviceCodeRequestContext,
  DevicePendingRecord,
} from '../../src/device/device-code.repository.js'

interface FakeRow {
  deviceCode: string
  userCode: string
  status: string
  requestUserAgent: string | null
  requestRegion: string | null
  requestedAt: Date | null
}

export class FakeDeviceCodeRepository implements DeviceCodeRepository {
  readonly calls: Array<{ deviceCode: string; context: DeviceCodeRequestContext }> = []
  private readonly rowsByDeviceCode = new Map<string, FakeRow>()
  private readonly rowsByUserCode = new Map<string, FakeRow>()

  /** Seeds a full pending row — task 2's tests need the realistic deviceCode<->userCode
   *  pairing (and status), beyond task 0's "does this deviceCode exist". */
  seedRow(row: Partial<FakeRow> & { deviceCode: string; userCode: string }): void {
    const full: FakeRow = {
      status: 'pending',
      requestUserAgent: null,
      requestRegion: null,
      requestedAt: null,
      ...row,
    }
    this.rowsByDeviceCode.set(full.deviceCode, full)
    this.rowsByUserCode.set(full.userCode, full)
  }

  /** task 0's original convenience — a bare row keyed by deviceCode alone (userCode
   *  defaults to the same value), sufficient for tests that never look it up by
   *  userCode. */
  seedKnownDeviceCode(deviceCode: string): void {
    this.seedRow({ deviceCode, userCode: deviceCode })
  }

  recordRequestContext(deviceCode: string, context: DeviceCodeRequestContext): Promise<void> {
    const row = this.rowsByDeviceCode.get(deviceCode)
    if (!row) {
      throw new Error(`FakeDeviceCodeRepository: no such deviceCode "${deviceCode}" — the real Prisma .update() would 404 the same way.`)
    }
    this.calls.push({ deviceCode, context })
    row.requestUserAgent = context.userAgent
    row.requestRegion = context.region
    row.requestedAt = context.requestedAt
    return Promise.resolve()
  }

  findByUserCode(userCode: string): Promise<DevicePendingRecord | null> {
    const row = this.rowsByUserCode.get(userCode)
    if (!row) return Promise.resolve(null)
    return Promise.resolve({
      userCode: row.userCode,
      status: row.status,
      userAgent: row.requestUserAgent,
      region: row.requestRegion,
      requestedAt: row.requestedAt,
    })
  }
}
