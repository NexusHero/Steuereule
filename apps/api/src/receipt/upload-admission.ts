import { Inject, Injectable } from '@nestjs/common'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../auth/auth.tokens.js'
import { TooManyRequestsError } from '../common/domain-error.js'

function positiveIntFromEnv(name: string, fallback: number, env: NodeJS.ProcessEnv): number {
  const parsed = Number(env[name])
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

/** A guest's uploads per client address and day, in bytes (ADR-0109): a guest id is minted afresh without the cookie, so no per-account quota binds. */
export const GUEST_UPLOAD_BYTES_PER_DAY = 100 * 1024 * 1024
/**
 * All guests' uploads together per day, in bytes. The per-address budget does not bound someone with many addresses,
 * so this caps what anonymous traffic can write to the shared storage (ADR-0109). Accounts are not counted.
 */
export const GUEST_UPLOAD_BYTES_PER_DAY_TOTAL = 5 * 1024 * 1024 * 1024
const DAY_SECONDS = 24 * 60 * 60
const RETRY_AFTER_SECONDS = 3

/**
 * Uploads are buffered whole (up to 10 MB, then copied by encryption and the database driver), and a Cloud Run
 * instance serves 80 requests on 2 GiB. So an instance takes a few uploads at once, one per account or guest
 * address, and answers 429 with Retry-After for the rest instead of queueing them in memory (ADR-0109).
 */
@Injectable()
export class UploadAdmission {
  private inFlight = 0
  private readonly active = new Set<string>()
  private readonly maxInFlight: number
  private readonly guestBytesPerDay: number
  private readonly guestBytesPerDayTotal: number

  constructor(
    @Inject(BETTER_AUTH_BUNDLE) private readonly bundle: BetterAuthBundle,
  ) {
    const env = process.env
    this.maxInFlight = positiveIntFromEnv('UPLOAD_MAX_IN_FLIGHT', 4, env)
    this.guestBytesPerDay = positiveIntFromEnv('GUEST_UPLOAD_BYTES_PER_DAY', GUEST_UPLOAD_BYTES_PER_DAY, env)
    this.guestBytesPerDayTotal = positiveIntFromEnv('GUEST_UPLOAD_BYTES_PER_DAY_TOTAL', GUEST_UPLOAD_BYTES_PER_DAY_TOTAL, env)
  }

  /** Takes a slot for `key` (account id or guest address); the returned function gives it back. */
  acquire(key: string): () => void {
    if (this.inFlight >= this.maxInFlight || this.active.has(key)) {
      throw new TooManyRequestsError('UPLOAD_BUSY', 'Gerade werden andere Dateien hochgeladen. Versuch es in ein paar Sekunden noch mal.', {
        retryAfterSeconds: RETRY_AFTER_SECONDS,
      })
    }
    this.inFlight += 1
    this.active.add(key)
    let released = false
    return () => {
      if (released) return
      released = true
      this.inFlight -= 1
      this.active.delete(key)
    }
  }

  /** Counts a guest's file against the address's daily budget; refuses when it would pass it. */
  async chargeGuest(address: string, bytes: number): Promise<void> {
    const decision = await this.bundle.rateLimitStorage.consume(`guest-upload-bytes:${address}`, { window: 24 * 60 * 60, max: this.guestBytesPerDay }, bytes)
    if (!decision.allowed) {
      throw new TooManyRequestsError('GUEST_UPLOAD_LIMIT', 'Ohne Konto kannst du heute nicht mehr Dateien hochladen. Lege ein Konto an oder versuch es morgen noch mal.', {
        retryAfterSeconds: decision.retryAfter ?? DAY_SECONDS,
      })
    }
    // After the address, so an address already refused above cannot use up the shared budget.
    const all = await this.bundle.rateLimitStorage.consume('guest-upload-bytes:all', { window: DAY_SECONDS, max: this.guestBytesPerDayTotal }, bytes)
    if (!all.allowed) {
      throw new TooManyRequestsError('GUEST_UPLOAD_CAPACITY', 'Gäste können heute keine Dateien mehr hochladen, das Limit für alle ist erreicht. Lege ein Konto an, dann kannst du sofort weiter hochladen.', {
        retryAfterSeconds: all.retryAfter ?? DAY_SECONDS,
      })
    }
  }
}
