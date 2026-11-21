// Internal names in the owl's answers (real-data run): field ids, tool names, and an instruction meant
// for the model shown to the user as the reason a draft was not prepared.
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { AdvisorEnginePort, AdvisorTurnRequest, CaseDigest } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { AdvisorGraphState, runToolRound } from '../src/ki/advisor-tool-round.js'
import { userReason } from '../src/ki/advisor-tools.js'
import { buildAdvisorTestKit } from './fakes/advisor-test-kit.js'

const digest: CaseDigest = {
  taxYear: 2024,
  filingStatus: 'zusammen',
  lstbPersonA: { grossWageEur: null, wageTaxEur: null, socialSecurityEur: null },
  crossBorder: { isCrossBorderCh: true, grossWageChf: null, withholdingTaxChf: null, pillar3aChf: null, healthInsuranceChf: null, dailySicknessBenefitChf: null, nonReturnDays: null },
  commuteAndWorkdays: { workdays: 220, homeOfficeAnswer: null, homeOfficeDays: 0, distanceKm: null },
  catalogExpenses: { hasTraining: false, relocationCostsEur: null, donationsEur: null, selfPaidKvPvEur: null, riesterEur: null, doubleHouseholdRentEur: null },
  childrenCount: 0,
  rentalObjectsCount: 0,
  capitalGainEur: null,
  priorYearComparison: { donationsEur: null },
  openOwlHints: [],
  printoutMissingFields: [],
  estimatedRefundEur: null,
}

async function round(args: Record<string, unknown>, over: Partial<AdvisorTurnRequest> = {}) {
  const state = {
    ...({} as typeof AdvisorGraphState.State),
    messages: [new AIMessage({ content: '', tool_calls: [{ name: 'stage_field_draft', args: { label: 'Eintrag', reason: 'x', sourceId: 'estg-9-1', ...args }, id: 'c0', type: 'tool_call' as const }] })] as BaseMessage[],
    toolRounds: 0, pendingActions: [], rejectedDrafts: [], pendingTwoPaths: null, choices: [], questionRound: null, situationSuggestions: [], noteChanges: [], sources: [],
  }
  return runToolRound(state, undefined, { message: 'x', digest, ...over }, () => 'act-1')
}

describe('why a draft was not prepared, as the user reads it', () => {
  it('says in the user’s words that the person is missing, not how the model should call the tool', async () => {
    const household = { personB: { handle: 'Person B', recordable: true, figures: null, aliases: [] } }
    const update = await round({ screen: 'interview', field: 'ch-nichtrueckkehrtage', newValue: '0', label: 'Nichtrückkehrtage Schweiz' }, { household })
    expect(update.rejectedDrafts).toHaveLength(1)
    const reason = update.rejectedDrafts[0]!.reason
    expect(reason).not.toMatch(/`|person:|Lege den Entwurf/)
    expect(reason).toContain('für wen')
    // The model still gets the instruction it can act on.
    expect(String(update.messages[0]!.content)).toContain('person: \\"A\\"')
  })

  it('never shows a field id or a list of field names', () => {
    expect(userReason('UNKNOWN_FIELD: "kind.kindergeld" gibt es nicht. Gültige Felder für "kind": firstName, taxId.')).not.toMatch(/kind\.|firstName/)
    expect(userReason('AI_WRITE_FORBIDDEN: Feld "kopplung.filingType" enthält personenbezogene Daten. Ohne Einwilligung …')).not.toContain('kopplung.filingType')
    expect(userReason('INVALID_VALUE: „abc“ passt nicht zu "lstb.lohnsteuer". Erwartet wird ein Betrag.')).not.toContain('lstb.lohnsteuer')
    expect(userReason('NO_PERSON_B: Es gibt für dieses Steuerjahr keine Zusammenveranlagung mit Person B.')).toBe('Es gibt für dieses Steuerjahr keine Zusammenveranlagung mit Person B.')
    expect(userReason('SOMETHING_NEW: Bitte `stage_field_draft` mit `instance` aufrufen.')).not.toMatch(/`|stage_field_draft/)
  })
})

describe('the stored answer', () => {
  it('carries no field id and no tool name, whatever the model wrote', async () => {
    const engine: AdvisorEnginePort = {
      async runTurn() {
        throw new Error('not used')
      },
      async *streamTurn() {
        yield { event: 'done', data: { replyText: 'Weitere Einkünfte (interview.einkuenfte): Nein. Ihr steht bei 226 € [read_current_estimate]. Erst `kopplung.filingType` übernehmen.', meta: {}, mode: 'langgraph' } }
      },
    }
    const kit = buildAdvisorTestKit(engine)
    const res = await kit.service.sendMessage('user-names', 2024, { message: 'Wie steht es?' })
    expect(res.assistantMessage.content).toBe('Weitere Einkünfte: Nein. Ihr steht bei 226 €. Erst in der Maske „Kopplung“ übernehmen.')
  })
})
