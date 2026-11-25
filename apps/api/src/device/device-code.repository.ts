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

  /**
   * Notes the approving session's `createdAt` on a code this user claimed (API-1). Written before the approval,
   * so no token exchange can run between the two.
   */
  recordApprovalAnchor(userCode: string, userId: string, sessionCreatedAt: Date): Promise<void>

  /** The anchor noted for a device code, read before the code is redeemed (redeeming deletes the row). */
  findApprovalAnchor(deviceCode: string): Promise<Date | null>

  /**
   * Gives the session the device flow minted the anchored `createdAt` and clamps its expiry to that session's
   * absolute cap (ADR-0103): a QR sign-in neither counts as fresh nor extends the 30 days.
   */
  anchorSession(sessionToken: string, createdAt: Date, latestExpiry: Date): Promise<void>
}
