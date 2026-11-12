import { readFileSync } from 'node:fs'
import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { describe, expect, it } from 'vitest'
import { TAX_YEARS, getTaxYearParameters, incomeTax } from '@steuereule/core'
import { KNOWLEDGE_TARGET, renderKnowledgeModule } from '../scripts/generate-advisor-knowledge.js'
import { computeIncomeTax } from '../src/ki/advisor-income-tax.js'
import { ADVISOR_KNOWLEDGE, ADVISOR_KNOWLEDGE_TOPICS } from '../src/ki/advisor-knowledge.generated.js'
import { buildStableSystemPrompt } from '../src/ki/advisor-prompt.js'
import { AdvisorGraphState, runToolRound } from '../src/ki/advisor-tool-round.js'
import { computedFiguresOf } from '../src/ki/advisor-tools.js'

async function callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const state = {
    ...({} as typeof AdvisorGraphState.State),
    messages: [new AIMessage({ content: '', tool_calls: [{ name, args, id: 'call-1', type: 'tool_call' }] })] as BaseMessage[],
    toolRounds: 0,
    pendingActions: [],
    rejectedDrafts: [],
    pendingTwoPaths: null,
    choices: [],
    questionRound: null,
    noteChanges: [],
    sources: [],
  }
  const update = await runToolRound(state, undefined, { message: 'x', digest: {} as never }, () => 'act-1')
  const answer = update.messages.find((m): m is ToolMessage => m instanceof ToolMessage)
  return JSON.parse(String(answer!.content)) as Record<string, unknown>
}

describe('tax knowledge of the owl (#499)', () => {
  it('ships exactly what the steuerberater skill says: the generated module is up to date', () => {
    expect(readFileSync(KNOWLEDGE_TARGET, 'utf8')).toBe(renderKnowledgeModule())
  })

  it('has every topic, with a title and text', () => {
    for (const topic of ADVISOR_KNOWLEDGE_TOPICS) {
      expect(ADVISOR_KNOWLEDGE[topic].title.length, topic).toBeGreaterThan(3)
      expect(ADVISOR_KNOWLEDGE[topic].text.length, topic).toBeGreaterThan(500)
    }
  })

  it('agrees with the tax core on the basic allowance of every year it lists', () => {
    const row = /\| Grundfreibetrag \|([^\n]+)\|/.exec(ADVISOR_KNOWLEDGE.kennzahlen.text)![1]!.split('|').map((cell) => Number(cell.trim().replace(/\./g, '')))
    const years = [2023, 2024, 2025, 2026]
    years.forEach((year, i) => {
      // The allowance is the highest income that still costs no tax.
      expect(incomeTax(row[i]!, year), String(year)).toBe(0)
      expect(incomeTax(row[i]! + 100, year), String(year)).toBeGreaterThan(0)
    })
    expect(getTaxYearParameters(2025).lumpSums).toBeDefined()
  })

  it('says for which tax years each section was checked, and covers every year the tax core knows from 2023 on', () => {
    const coreYears = Object.keys(TAX_YEARS).map(Number).filter((year) => year >= 2023)
    for (const topic of ADVISOR_KNOWLEDGE_TOPICS) {
      const stand = /\*\*Stand:\*\* (\d{2}\.\d{2}\.\d{4}) · geprüft für die Steuerjahre (\d{4})–(\d{4})/.exec(ADVISOR_KNOWLEDGE[topic].text)
      expect(stand, `${topic} needs a „Stand“ line`).not.toBeNull()
      const [from, to] = [Number(stand![2]), Number(stand![3])]
      // A new tariff year in the core means: check the knowledge again and move the range.
      for (const year of coreYears) expect(year >= from && year <= to, `${topic} is not checked for ${year}`).toBe(true)
    }
  })

  it('reads a topic on request and refuses one that does not exist', async () => {
    const found = await callTool('lookup_tax_knowledge', { topic: 'selbststaendige-ust' })
    expect(found.ok).toBe(true)
    expect(String(found.text)).toContain('Kleinunternehmer')
    const missing = await callTool('lookup_tax_knowledge', { topic: 'geheimnisse' })
    expect(missing.ok).toBe(false)
  })
})

describe('tariff sums from the tax core (#499)', () => {
  it('matches the skill’s own calculator (verified against the BMF calculator) on the income tax', () => {
    expect(computeIncomeTax({ year: 2025, taxableIncome: 48000, splitting: false, churchTaxRate: 0, extraDeduction: 0 })).toMatchObject({ incomeTaxEur: 9988, soliEur: 0, totalEur: 9988, marginalRatePercent: 35 })
    expect(computeIncomeTax({ year: 2025, taxableIncome: 90000, splitting: true, churchTaxRate: 0.09, extraDeduction: 0 })).toMatchObject({ incomeTaxEur: 17922, soliEur: 0, churchTaxEur: 1612, assessment: 'joint' })
    expect(computeIncomeTax({ year: 2023, taxableIncome: 120000, splitting: false, churchTaxRate: 0.08, extraDeduction: 0 })).toMatchObject({ incomeTaxEur: 40427, soliEur: 2223, churchTaxEur: 3234 })
  })

  it('says what an extra deduction saves', () => {
    expect(computeIncomeTax({ year: 2026, taxableIncome: 48000, splitting: false, churchTaxRate: 0, extraDeduction: 1500 })).toMatchObject({ incomeTaxEur: 9852, savingEur: 512 })
  })

  it('refuses a church tax rate that does not exist', async () => {
    expect((await callTool('compute_income_tax', { year: 2025, taxableIncome: 48000, churchTaxRate: 0.05 })).ok).toBe(false)
    expect((await callTool('compute_income_tax', { year: 2025, taxableIncome: 48000, churchTaxRate: 0.09 })).ok).toBe(true)
  })

  it('knows no tariff for a year the core does not have', async () => {
    expect(computeIncomeTax({ year: 2019, taxableIncome: 48000, splitting: false, churchTaxRate: 0, extraDeduction: 0 })).toBeNull()
    expect((await callTool('compute_income_tax', { year: 2019, taxableIncome: 48000 })).ok).toBe(false)
  })

  it('counts as worked out by the app: the answer check accepts these figures', async () => {
    const answer = await callTool('compute_income_tax', { year: 2026, taxableIncome: 48000, extraDeduction: 1500 })
    const figures = computedFiguresOf([new ToolMessage({ content: JSON.stringify(answer), tool_call_id: 'call-1' })])
    expect(figures).toEqual(expect.arrayContaining([9852, 512]))
  })
})

describe('advisor stance (#499)', () => {
  it('is part of every answer’s stable prompt, with its limits', () => {
    const prompt = buildStableSystemPrompt()
    expect(prompt).toContain('Beraterhaltung (gilt immer)')
    expect(prompt).toContain('lookup_tax_knowledge')
    expect(prompt).toContain('compute_income_tax')
    expect(prompt).toContain('kein zugelassener Steuerberater')
    expect(prompt).toContain('§ 371 AO')
    expect(prompt).toContain('keinen Euro mehr zahlt, als das Gesetz verlangt')
    expect(prompt).toContain('Der Nutzen der App')
    expect(prompt).not.toContain('Nur private Einkommensteuererklärung')
  })
})
