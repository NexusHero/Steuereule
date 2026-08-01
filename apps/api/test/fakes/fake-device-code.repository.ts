// In-memory fake keyed by deviceCode — mirrors FakeProfileRepository's shape
// (ADR-0004: honours the real per-deviceCode lookup, doesn't just echo back
// whatever it was fed). `recordRequestContext` throws on an unknown deviceCode,
// exactly like the real Prisma `.update()` would (see DeviceCodeRepository's own
// doc comment on why a missing row is a genuine bug, not a valid outcome).
import type {
  DeviceCodeRepository,
  DeviceCodeRequestContext,
} from '../../src/device/device-code.repository.js'

export class FakeDeviceCodeRepository implements DeviceCodeRepository {
  readonly calls: Array<{ deviceCode: string; context: DeviceCodeRequestContext }> = []
  private readonly known = new Set<string>()

  seedKnownDeviceCode(deviceCode: string): void {
    this.known.add(deviceCode)
  }

  recordRequestContext(deviceCode: string, context: DeviceCodeRequestContext): Promise<void> {
    if (!this.known.has(deviceCode)) {
      throw new Error(`FakeDeviceCodeRepository: no such deviceCode "${deviceCode}" — the real Prisma .update() would 404 the same way.`)
    }
    this.calls.push({ deviceCode, context })
    return Promise.resolve()
  }
}
