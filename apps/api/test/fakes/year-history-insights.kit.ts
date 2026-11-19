// The insights of the Verlauf (ADR-0099) over empty fakes, for tests that exercise the Verlauf for
// something else and need no children, Anlagen or receipts.
import type { CommuteRepository } from '../../src/commute/commute.repository.js'
import { YearHistoryInsightsService } from '../../src/year-history/year-history-insights.service.js'
import { FakeCapitalRepository } from './fake-capital.repository.js'
import { FakeChildRepository } from './fake-child.repository.js'
import { FakePensionRepository } from './fake-pension.repository.js'
import { FakeReceiptRepository } from './fake-receipt.repository.js'
import { FakeRentalRepository } from './fake-rental.repository.js'

export function emptyYearHistoryInsights(commute: CommuteRepository): YearHistoryInsightsService {
  return new YearHistoryInsightsService(new FakeChildRepository(), new FakeCapitalRepository(), new FakePensionRepository(), new FakeRentalRepository(), commute, new FakeReceiptRepository())
}
