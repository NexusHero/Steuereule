import type { AuditService } from '../audit/audit.service.js'
import type { InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import type { UnlockService } from '../unlock/unlock.service.js'
import { BusinessContext } from './business-context.js'
import type { BusinessRepository } from './business.repository.js'
import { BusinessService } from './business.service.js'
import type { HebesatzDirectory } from './hebesatz.js'
import { LedgerService } from './ledger.service.js'
import { BusinessProfileService } from './business-profile.service.js'
import { BusinessElsterService } from './business-elster.service.js'
import { BusinessSummaryService } from './business-summary.service.js'
import { BusinessTaxService } from './business-tax.service.js'
import { VatService } from './vat.service.js'
import { AssetService } from './asset.service.js'
import { BankImportService } from './bank-import.service.js'
import { BusinessExportService } from './business-export.service.js'
import { PayrollService } from './payroll.service.js'

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
  const ledger = new LedgerService(repository, audit, context)
  const vat = new VatService(repository, audit, context)
  const tax = new BusinessTaxService(audit, context, ledger, hebesaetze)
  return new BusinessService(
    new BusinessProfileService(repository, audit, context),
    ledger,
    new BankImportService(repository, audit, context, ledger),
    new AssetService(repository, audit, context, ledger),
    new PayrollService(repository, audit, context, ledger),
    vat,
    tax,
    new BusinessSummaryService(repository, context, vat, tax),
    new BusinessElsterService(audit, context, ledger, vat, tax, hebesaetze),
    new BusinessExportService(repository, audit, context, ledger),
  )
}
