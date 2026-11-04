export interface DeviceCodeRequestContext {
  userAgent: string | null
  ip: string | null
  region: string | null
  requestedAt: Date
}

/** The match-verification payload `GET /v1/device/pending` needs — read fresh from the row, never cached/hard-coded. */
export interface DevicePendingRecord {
  userCode: string
  status: string
  userAgent: string | null
  region: string | null
  requestedAt: Date | null
}

export const DEVICE_CODE_REPOSITORY = Symbol('DEVICE_CODE_REPOSITORY')

/** The persistence seam for DeviceCode's *our-owned* columns. */
export interface DeviceCodeRepository {
  recordRequestContext(deviceCode: string, context: DeviceCodeRequestContext): Promise<void>

  findByUserCode(userCode: string): Promise<DevicePendingRecord | null>
}
