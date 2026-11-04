import { Inject, Injectable, Logger } from '@nestjs/common'

export const DATABASE_REACHABILITY_CHECK = Symbol('DATABASE_REACHABILITY_CHECK')

export type DatabaseReachabilityCheck = () => Promise<void>

/** The liveness/readiness building block. */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name)

  constructor(
    @Inject(DATABASE_REACHABILITY_CHECK) private readonly checkDatabaseReachable: DatabaseReachabilityCheck,
  ) {}

  async isDatabaseReachable(): Promise<boolean> {
    try {
      await this.checkDatabaseReachable()
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      this.logger.warn(`readiness probe: database unreachable — ${message}`)
      return false
    }
  }
}
