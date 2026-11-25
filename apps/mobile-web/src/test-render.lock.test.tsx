// One test wrapper: a test that needs a query client takes it from `test-render.tsx` (`renderWithQuery`,
// `makeTestQueryClient`) instead of building its own client and provider stack. A test file that builds a
// client of its own fails here.
//
// LEGACY lists the files written before the shared wrapper; it only shrinks: a file that no longer builds a
// client must leave the list, and no file may be added to it.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname)
const OWN_CLIENT = /new\s+QueryClient\(/

/** Files that build a client for a reason of their own. */
const ALLOWED: Readonly<Record<string, string>> = {
  'test-render.tsx': 'the shared wrapper itself',
  'query-client.test.tsx': "tests the app's own defaults (APP_QUERY_DEFAULTS), which a test client replaces",
}

const LEGACY: ReadonlySet<string> = new Set([
  'auth/useSocialSignInAvailable.test.tsx',
  'lib/hapticsWiring.test.tsx',
  'lib/receipts/useReceiptReader.test.tsx',
  'screens/LoginScreen.test.tsx',
  'screens/OnboardingScreen.test.tsx',
  'screens/PrivacyScreen.test.tsx',
  'screens/ProfileScreen.test.tsx',
  'screens/RegistrationScreen.test.tsx',
  'screens/advisor/AdvisorChatPanelConsent.test.tsx',
  'screens/advisor/CopilotBridgeParallel.test.tsx',
  'screens/advisor/CopilotBridgeProvider.test.tsx',
  'screens/advisor/CopilotBridgeReceiptBatch.test.tsx',
  'screens/advisor/OwlInlineMask.test.tsx',
  'screens/advisor/OwlModeScreen.test.tsx',
  'screens/advisor/OwlModeScreenConnected.test.tsx',
  'screens/advisor/chat/BookingDraftCard.states.test.tsx',
  'screens/advisor/chat/BookingDraftCard.test.tsx',
  'screens/advisor/chat/PersonalDataConsentCard.test.tsx',
  'screens/advisor/chat/StoredReceiptPicker.test.tsx',
  'screens/advisor/owlDrafts.test.tsx',
  'screens/assessment/AssessmentScreen.interactions.test.tsx',
  'screens/assessment/AssessmentScreen.test.tsx',
  'screens/business/businessProfileTax.test.tsx',
  'screens/business/businessUnits.test.tsx',
  'screens/business/filingPath.test.tsx',
  'screens/business/selfEmploymentSwitch.test.tsx',
  'screens/capital/CapitalScreen.states.test.tsx',
  'screens/capital/CapitalScreen.test.tsx',
  'screens/catalog/CatalogScreen.boosters.test.tsx',
  'screens/catalog/CatalogScreen.focus.test.tsx',
  'screens/catalog/CatalogScreen.states.test.tsx',
  'screens/catalog/CatalogScreen.test.tsx',
  'screens/children/ChildrenScreen.flows.test.tsx',
  'screens/children/ChildrenScreen.test.tsx',
  'screens/children/HouseholdChildrenSection.actions.test.tsx',
  'screens/children/HouseholdChildrenSection.test.tsx',
  'screens/cockpit/CockpitMissing.test.tsx',
  'screens/cockpit/CockpitScreen.hero.test.tsx',
  'screens/cockpit/CockpitScreen.test.tsx',
  'screens/cockpit/CockpitSlice5.test.tsx',
  'screens/cockpit/SubmissionMarker.test.tsx',
  'screens/confirmation/ConfirmationScreen.test.tsx',
  'screens/confirmation/ConfirmationScreen.values.test.tsx',
  'screens/cross-border/CrossBorderScreen.paths.test.tsx',
  'screens/cross-border/CrossBorderScreen.shell.test.tsx',
  'screens/cross-border/CrossBorderScreen.test.tsx',
  'screens/deadlines/DeadlinesBanner.test.tsx',
  'screens/device/DeviceApprovalScreen.test.tsx',
  'screens/device/DeviceListSection.test.tsx',
  'screens/device/DeviceScreen.test.tsx',
  'screens/device/useDeviceSessions.test.tsx',
  'screens/filing-type-comparison/FilingTypeComparisonScreen.states.test.tsx',
  'screens/filing-type-comparison/FilingTypeComparisonScreen.test.tsx',
  'screens/history/AssessmentUploadEntry.test.tsx',
  'screens/history/HistoryDevelopmentScreen.test.tsx',
  'screens/history/HistoryDocumentsScreen.test.tsx',
  'screens/history/HistoryScreen.test.tsx',
  'screens/history/HistoryYearScreen.test.tsx',
  'screens/history/MaskLessonHint.test.tsx',
  'screens/interview/InterviewScreen.test.tsx',
  'screens/login/ForgotPassword.test.tsx',
  'screens/lstb/LstbScreen.states.test.tsx',
  'screens/lstb/LstbScreen.test.tsx',
  'screens/master-data/MasterDataScreen.test.tsx',
  'screens/oauth/OauthConsentScreen.params.test.tsx',
  'screens/oauth/OauthConsentScreen.test.tsx',
  'screens/onboarding/req-012-onboarding-vertical-join.test.tsx',
  'screens/pension/PensionerScreen.fields.test.tsx',
  'screens/pension/PensionerScreen.test.tsx',
  'screens/plausibility/PlausibilityScreen.test.tsx',
  'screens/plausibility/usePlausibility.test.tsx',
  'screens/printout/GlassFormPreview.liveRows.test.tsx',
  'screens/printout/GlassFormPreview.sections.test.tsx',
  'screens/printout/GlassFormPreview.test.tsx',
  'screens/printout/OfficialFormScreen.test.tsx',
  'screens/printout/PrintoutScreen.actions.test.tsx',
  'screens/printout/PrintoutScreen.test.tsx',
  'screens/printout/useAcroFieldSaver.test.tsx',
  'screens/privacy/OwlPersonalDataSection.test.tsx',
  'screens/profile/AssistentenListSection.test.tsx',
  'screens/receipts/ReceiptsScreen.reading.test.tsx',
  'screens/receipts/ReceiptsScreen.test.tsx',
  'screens/rental/RentalScreen.interactions.test.tsx',
  'screens/rental/RentalScreen.test.tsx',
  'screens/security/SecurityScreen.test.tsx',
  'screens/strom/StromPages.test.tsx',
  'screens/strom/StromScreen.flows.test.tsx',
  'screens/strom/StromScreen.test.tsx',
  'screens/submission/SubmissionScreen.test.tsx',
  'screens/workdays/WorkdaysScreen.interactions.test.tsx',
  'screens/workdays/WorkdaysScreen.test.tsx',
  'test-advisor.tsx',
])

function files(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...files(path))
    else if (/\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

function isTestSupport(rel: string): boolean {
  const name = rel.split('/').pop() ?? ''
  return /\.test\.tsx?$/.test(name) || name.startsWith('test-') || /TestKit\.tsx?$/.test(name)
}

describe('one test wrapper', () => {
  const builders = files(SRC)
    .map((file) => relative(SRC, file))
    .filter((rel) => isTestSupport(rel) && OWN_CLIENT.test(readFileSync(join(SRC, rel), 'utf8')))
    .sort()

  it('no test builds a query client of its own; it renders with renderWithQuery or takes makeTestQueryClient()', () => {
    expect(builders.filter((rel) => ALLOWED[rel] === undefined && !LEGACY.has(rel))).toEqual([])
  })

  it('the legacy list and the allowed rows name only files that still build a client', () => {
    expect([...LEGACY, ...Object.keys(ALLOWED)].filter((rel) => !builders.includes(rel))).toEqual([])
  })

  it('the legacy list does not grow', () => {
    expect(LEGACY.size).toBeLessThanOrEqual(92)
  })
})
