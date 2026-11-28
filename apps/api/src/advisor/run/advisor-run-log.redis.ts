import type { AdvisorStreamEvent } from '@steuereule/core'
import type { Redis } from 'ioredis'
import type { FieldEncryptionKeySet } from '../../common/field-encryption-keys.js'
import { RedisRunLog } from '../../run-log/run-log.redis.js'
import { RUN_RETENTION_MS, type AdvisorRunInfo } from './advisor-run-log.js'

/**
 * The owl's answers on the shared Redis run log. Namespace and key purpose are the names the log has always
 * used, so instances of two releases read each other's runs during a deploy.
 */
export class RedisAdvisorRunLog extends RedisRunLog<AdvisorStreamEvent, AdvisorRunInfo> {
  constructor(redis: Redis, keys: FieldEncryptionKeySet, retentionMs: number = RUN_RETENTION_MS) {
    super(redis, keys, { namespace: 'steuereule:advisor:run', keyPurpose: 'advisor-run-log', retentionMs })
  }
}
