// Which handler executes which of the owl's tools. Adding a tool to TOOL_ARG_SCHEMAS without a
// handler here does not compile.
import { type ToolName } from '../advisor-tools.js'
import { askClarificationTool } from './ask-clarification.js'
import { askQuestionsTool } from './ask-questions.js'
import { checkHoldingPeriodTool } from './check-holding-period.js'
import { checkRentalRepairsTool } from './check-rental-repairs.js'
import { compareTaxPathsTool } from './compare-tax-paths.js'
import { computeIncomeTaxTool } from './compute-income-tax.js'
import { deterministicChecksTool } from './deterministic-checks.js'
import { lookupLegalSourceTool } from './lookup-legal-source.js'
import { lookupTaxKnowledgeTool } from './lookup-tax-knowledge.js'
import { markInterviewAreaTool } from './mark-interview-area.js'
import { notesTool } from './notes.js'
import { planStepsTool } from './plan-steps.js'
import { proposeTwoPathsTool } from './propose-two-paths.js'
import { readCurrentEstimateTool } from './read-current-estimate.js'
import { readLawTextTool } from './read-law-text.js'
import { requestPersonalDataConsentTool } from './request-personal-data-consent.js'
import { simulateTaxDeltaTool } from './simulate-tax-delta.js'
import { stageFieldDraftTool } from './stage-field-draft.js'
import { stageBookingDraftTool } from './stage-booking-draft.js'
import { suggestSituationTool } from './suggest-situation.js'
import { withdrawDraftTool } from './withdraw-draft.js'
import { type ToolHandler } from './tool-call-context.js'

export { createToolCallContext, type ToolCallContext, type ToolHandler, type ToolRoundTurn } from './tool-call-context.js'

type NamesOf<H> = H extends ToolHandler<infer N> ? N : never

/** Takes the handlers only when together they cover every tool the model is offered. */
function coveringEveryTool<const H extends readonly ToolHandler[]>(
  handlers: H & ([Exclude<ToolName, NamesOf<H[number]>>] extends [never] ? unknown : { missingHandlerFor: Exclude<ToolName, NamesOf<H[number]>> }),
): H {
  return handlers
}

const TOOL_HANDLERS = coveringEveryTool([
  simulateTaxDeltaTool,
  stageFieldDraftTool,
  stageBookingDraftTool,
  withdrawDraftTool,
  proposeTwoPathsTool,
  askQuestionsTool,
  markInterviewAreaTool,
  suggestSituationTool,
  lookupTaxKnowledgeTool,
  computeIncomeTaxTool,
  compareTaxPathsTool,
  checkHoldingPeriodTool,
  checkRentalRepairsTool,
  deterministicChecksTool,
  readLawTextTool,
  askClarificationTool,
  notesTool,
  requestPersonalDataConsentTool,
  readCurrentEstimateTool,
  planStepsTool,
  lookupLegalSourceTool,
])

const HANDLER_BY_NAME: ReadonlyMap<ToolName, ToolHandler> = new Map(TOOL_HANDLERS.flatMap((handler) => handler.names.map((name) => [name, handler as ToolHandler] as const)))

/** The handler of a tool the model is offered; coveringEveryTool guarantees there is one. */
export function toolHandlerFor(name: ToolName): ToolHandler {
  return HANDLER_BY_NAME.get(name)!
}
