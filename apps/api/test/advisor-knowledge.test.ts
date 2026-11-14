import { readFileSync } from 'node:fs'
import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { describe, expect, it } from 'vitest'
import { TAX_YEARS, getTaxYearParameters, incomeTax } from '@steuereule/core'
import { SKILLS_TARGET, parseSkill, renderSkillsModule } from '../scripts/generate-skills.js'
import { computeIncomeTax } from '../src/ki/advisor-income-tax.js'
import { ADVISOR_KNOWLEDGE, ADVISOR_KNOWLEDGE_TOPICS } from '../src/ki/skills.generated.js'
import { buildStableSystemPrompt } from '../src/ki/advisor-prompt.js'
import { AdvisorGraphState, runToolRound } from '../src/ki/advisor-tool-round.js'
import { computedFiguresOf } from '../src/ki/advisor-tools.js'
import { toolResultLine } from '../src/ki/advisor-tool-results.js'

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
    situationSuggestions: [],
    noteChanges: [],
    sources: [],
  }
  const update = await runToolRound(state, undefined, { message: 'x', digest: {} as never }, () => 'act-1')
  const answer = update.messages.find((m): m is ToolMessage => m instanceof ToolMessage)
  return JSON.parse(String(answer!.content)) as Record<string, unknown>
}

describe('tax knowledge of the owl (#499)', () => {
  it('ships exactly what the skill files say: the module is built from apps/api/skills', () => {
    expect(readFileSync(SKILLS_TARGET, 'utf8')).toBe(renderSkillsModule())
    expect(ADVISOR_KNOWLEDGE_TOPICS).not.toContain('quellen')
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

describe('skill files', () => {
  const skill = (frontmatter: string, body = 'Tu etwas.') => `---\n${frontmatter}\n---\n\n${body}\n`

  it('reads the frontmatter and keeps the instructions word for word', () => {
    expect(parseSkill(skill('name: x\ndescription: Ein Satz.\nactivation: user\ncommand: x\nreferences: [a, b]', 'Zeile 1\n\nZeile 2'), 'x')).toEqual({ name: 'x', description: 'Ein Satz.', activation: 'user', command: 'x', references: ['a', 'b'], body: 'Zeile 1\n\nZeile 2' })
  })

  it('refuses a skill the build cannot trust', () => {
    expect(() => parseSkill('Nur Text', 'x')).toThrow(/frontmatter/)
    expect(() => parseSkill(skill('name: y\ndescription: d\nactivation: user'), 'x')).toThrow(/folder name/)
    expect(() => parseSkill(skill('name: x\ndescription: d\nactivation: sometimes'), 'x')).toThrow(/activation/)
    expect(() => parseSkill(skill('name: x\nactivation: user'), 'x')).toThrow(/description/)
    expect(() => parseSkill(skill('name: x\ndescription: d\nactivation: always\ncommand: x'), 'x')).toThrow(/command/)
    expect(() => parseSkill(skill('name: x\ndescription: d\nactivation: user', ''), 'x')).toThrow(/empty/)
  })
})

describe('suggestions for the situation (#501)', () => {
  it('are collected for the user to take over, and refused when they name someone', async () => {
    expect(await callTool('suggest_situation', { text: 'Hauskauf für 2027 geplant.' })).toMatchObject({ ok: true, suggested: 'Hauskauf für 2027 geplant.' })
    expect((await callTool('suggest_situation', { text: 'Kredit läuft über IBAN DE89370400440532013000.' })).ok).toBe(false)
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

  it('applies the progression clause to wage replacement benefits (§ 32b EStG)', async () => {
    // 10.000 € Elterngeld lift the rate on 40.000 € to that of 50.000 € (10.691 €): 21,382 % → 8.552 €.
    const result = computeIncomeTax({ year: 2025, taxableIncome: 40000, splitting: false, churchTaxRate: 0, extraDeduction: 0, wageReplacementEur: 10000 })
    expect(result).toMatchObject({ incomeTaxEur: 8552, wageReplacementEur: 10000, withoutBenefitsEur: 7320 })
    expect(await callTool('compute_income_tax', { year: 2025, taxableIncome: 40000, wageReplacementEur: 10000 })).toMatchObject({ ok: true, incomeTaxEur: 8552 })
  })

  it('compares joint and separate assessment with the app’s comparison, and stays open while benefits are unknown', async () => {
    const clear = await callTool('compare_filing_types', { year: 2025, taxableIncomeA: 70000, taxableIncomeB: 10000, wageReplacementEur: 0 })
    expect(clear).toMatchObject({ ok: true, outcome: 'joint' })
    expect(Number(clear.savingEur)).toBeGreaterThan(0)
    expect(Number(clear.separateTotalEur) - Number(clear.jointTotalEur)).toBe(clear.savingEur)
    expect(await callTool('compare_filing_types', { year: 2025, taxableIncomeA: 70000, taxableIncomeB: 10000 })).toMatchObject({ ok: true, outcome: 'open' })
    expect(await callTool('compare_filing_types', { year: 2025, taxableIncomeA: 40000, taxableIncomeB: 40000, wageReplacementEur: 0 })).toMatchObject({ ok: true, savingEur: 0 })
  })

  it('checks the flat-rate tax against the personal rate on capital income', async () => {
    // Little other income: the personal rate is lower than 25 %.
    const low = await callTool('check_capital_taxation', { year: 2025, capitalIncomeEur: 5000, otherTaxableIncome: 14000, wageReplacementEur: 0 })
    expect(low).toMatchObject({ ok: true, outcome: 'personal', saverAllowanceEur: 1000 })
    const high = await callTool('check_capital_taxation', { year: 2025, capitalIncomeEur: 5000, otherTaxableIncome: 90000, wageReplacementEur: 0 })
    expect(high).toMatchObject({ ok: true, outcome: 'flat_rate' })
    expect((await callTool('check_capital_taxation', { year: 2025, capitalIncomeEur: 5000, otherTaxableIncome: 14000, churchTaxRate: 0.05 })).ok).toBe(false)
  })

  it('checks the holding period of a private sale and the year’s exemption limit (§ 23 EStG)', async () => {
    expect(await callTool('check_holding_period', { kind: 'crypto', acquiredOn: '2024-03-15', soldOn: '2025-03-15', totalGainsOfYearEur: 800 })).toMatchObject({ ok: true, taxable: true, taxFreeFrom: '2025-03-16', exemptionLimitEur: 1000, withinExemptionLimit: true })
    expect(await callTool('check_holding_period', { kind: 'property', acquiredOn: '2020-05-01', soldOn: '2026-05-01', ownUseYearOfSaleAndTwoBefore: true })).toMatchObject({ ok: true, taxable: false, ownUseExempt: true })
    expect((await callTool('check_holding_period', { kind: 'crypto', acquiredOn: '2025-03-16', soldOn: '2025-03-15' })).ok).toBe(false)
  })

  it('checks repairs after buying a rented building against the 15 % limit', async () => {
    const result = await callTool('check_rental_repairs', { acquiredOn: '2024-04-01', buildingCostEur: 200000, repairs: [{ doneOn: '2024-06-01', netEur: 18000 }] })
    expect(result).toMatchObject({ ok: true, limitEur: 30000, roomLeftEur: 12000, exceeds: false, windowEnd: '2027-04-01' })
    expect(toolResultLine('check_rental_repairs', result)).toBe('noch 12.000 € Platz')
  })

  it('computes gift and inheritance tax, and checks the small business rule and trade tax', async () => {
    expect(await callTool('compute_gift_tax', { relation: 'child', onDeath: false, valueEur: 500000 })).toMatchObject({ ok: true, taxClass: 'I', taxEur: 11000 })
    expect(await callTool('check_small_business', { year: 2025, priorYearTurnoverEur: 26000, currentYearTurnoverEur: 10000 })).toMatchObject({ ok: true, eligible: false, crossed: 'prior_year' })
    expect(await callTool('estimate_trade_tax', { profitEur: 80050, multiplierPercent: 490 })).toMatchObject({ ok: true, tradeTaxEur: 9515, netBurdenEur: 1747 })
    expect((await callTool('estimate_trade_tax', { profitEur: 80050, multiplierPercent: 150 })).ok).toBe(false)
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
