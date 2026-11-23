import type { AuditService } from '../audit/audit.service.js'
import type { InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import type { UnlockService } from '../unlock/unlock.service.js'
import { BusinessContext } from './business-context.js'
import type { BusinessRepository } from './business.repository.js'
import { BusinessService } from './business.service.js'
import type { HebesatzDirectory } from './hebesatz.js'

/**
 * The self-employment services wired by hand, as BusinessModule wires them through Nest: for tests and
 * scripts that run without the container.
 */
export function composeBusinessService(
  repository: BusinessRepository,
  interview: InterviewAnswerRepository,
  audit: AuditService,
  hebesaetze: HebesatzDirectory,
  unlock?: UnlockService,
  now?: () => string,
): BusinessService {
  const context = new BusinessContext(repository, interview, unlock, now)
  return new BusinessService(repository, audit, hebesaetze, context)
}
