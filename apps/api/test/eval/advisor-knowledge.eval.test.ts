// ADR-0069 — does the owl advise well with the steuerberater skill? Typical questions against the
// REAL model. A case names what a good answer must contain (the norm, the figure, the follow-up
// question), which knowledge it has to read and whether it has to calculate. By hand only, see
// vitest.eval.config.ts. A failing case is a finding to look at, not a broken build.
import { describe, expect, it } from 'vitest'
import type { AdvisorStreamEvent, AdvisorTurnResult, CaseDigest } from '@steuereule/core'
import { EnvAiRuntimeConfigService } from '../../src/ki/ai-runtime-config.service.js'
import { LangGraphAdvisorEngine } from '../../src/ki/langgraph-advisor.engine.js'

const KEY = process.env.AI_EVAL_GEMINI_API_KEY?.trim()

const DIGEST: CaseDigest = {
  taxYear: 2025,
  filingStatus: 'einzel',
  profession: 'IT & Software',
  lstbPersonA: { grossWageEur: 65000, wageTaxEur: 12500, socialSecurityEur: 12000 },
  crossBorder: {
    isCrossBorderCh: false,
    grossWageChf: null,
    withholdingTaxChf: null,
    pillar3aChf: null,
    healthInsuranceChf: null,
    dailySicknessBenefitChf: null,
    nonReturnDays: null,
  },
  commuteAndWorkdays: {
    workdays: 220,
    homeOfficeAnswer: 'Nie',
    homeOfficeDays: 0,
    distanceKm: 15,
  },
  catalogExpenses: {
    hasTraining: false,
    relocationCostsEur: null,
    donationsEur: null,
    selfPaidKvPvEur: null,
    riesterEur: null,
    doubleHouseholdRentEur: null,
  },
  childrenCount: 0,
  rentalObjectsCount: 0,
  capitalGainEur: null,
  priorYearComparison: { donationsEur: 200 },
  openOwlHints: [],
  printoutMissingFields: [],
  estimatedRefundEur: null,
}

const LOOKUP = 'Schlage im Steuerwissen nach'
const COMPUTE = 'Rechne die Einkommensteuer'
const READ_LAW = 'Lese den Gesetzestext nach'

interface Case {
  readonly name: string
  readonly question: string
  /** Every pattern has to occur in the answer. */
  readonly must: readonly RegExp[]
  /** None of these may occur. */
  readonly never?: readonly RegExp[]
  readonly lookup?: boolean
  readonly compute?: boolean
  /** Reads a norm in today's wording first (B3, read_law_text). */
  readonly readsLaw?: boolean
  /** The label of a tool that has to run. */
  readonly tool?: string
}

const CASES: readonly Case[] = [
  { name: 'commute 2026 from the first kilometre', question: 'Wie hoch ist die Pendlerpauschale 2026 bei 12 km einfacher Strecke?', must: [/0,38/, /§\s*9/], lookup: true },
  { name: 'home office flat rate', question: 'Was kann ich 2025 für Homeoffice absetzen, wenn ich 150 Tage zu Hause gearbeitet habe?', must: [/6\s*€|6 Euro/, /900/], lookup: true },
  { name: 'employee lump sum makes small costs worthless', question: 'Ich hatte 2025 nur 400 € Werbungskosten für Fachbücher. Bringt mir das etwas?', must: [/1\.230/, /Pauschbetrag/i], lookup: true },
  { name: 'tariff question is calculated, not guessed', question: 'Wie viel Einkommensteuer zahle ich 2025 bei 48.000 € zu versteuerndem Einkommen, ledig, ohne Kirche?', must: [/9\.988/], compute: true },
  { name: 'saving of a deduction uses the marginal rate', question: 'Was spart mir ein zusätzlicher Abzug von 1.500 € im Jahr 2026 bei 48.000 € zu versteuerndem Einkommen, ledig, ohne Kirche?', must: [/512/], compute: true },
  { name: 'asks before it calculates', question: 'Lohnt sich die Zusammenveranlagung für uns?', must: [/\?/], never: [/spar(?:t|en) (?:ihr|Sie) \d/i] },
  { name: 'cross-border: Swiss tax is credited like wage tax', question: 'Ich bin Grenzgänger in die Schweiz. Wie wird die Schweizer Quellensteuer in Deutschland berücksichtigt?', must: [/4,5\s*%|4,5 Prozent/, /angerechnet|Anrechnung/i, /N-Gre/], never: [/§\s*34c[^.]{0,40}angerechnet/i], lookup: true },
  { name: 'cross-border: 60 days', question: 'Ab wie vielen Nichtrückkehrtagen bin ich kein Grenzgänger mehr?', must: [/60/], lookup: true },
  { name: 'health insurance prepayment is three times', question: 'Wie viele Jahresbeiträge zur Krankenversicherung kann ich im Voraus zahlen und sofort absetzen?', must: [/Dreifache|3-fache|drei(?:fach)?/i], never: [/2,5/], lookup: true },
  { name: 'Rürup limit is named with its year', question: 'Wie viel kann ich 2025 höchstens in eine Rürup-Rente einzahlen und absetzen?', must: [/29\.344/], lookup: true },
  { name: 'child allowance check', question: 'Bekomme ich Kindergeld oder den Kinderfreibetrag?', must: [/Günstigerprüfung/i, /Kindergeld/], lookup: true },
  { name: 'wage replacement raises the rate', question: 'Ich habe 2025 drei Monate Elterngeld bekommen. Muss ich das versteuern?', must: [/Progressionsvorbehalt/i, /steuerfrei/i], lookup: true },
  { name: 'craftsmen: labour only', question: 'Kann ich die Rechnung vom Maler absetzen?', must: [/20\s*%|20 Prozent/, /1\.200/, /Arbeitskosten|Arbeitslohn|Lohnkosten/i], lookup: true },
  { name: 'small business threshold from 2025', question: 'Bis zu welchem Umsatz bin ich 2025 Kleinunternehmer?', must: [/25\.000/, /100\.000/, /§\s*19/], lookup: true },
  { name: 'retention periods are told apart', question: 'Wie lange muss ich als Selbstständiger meine Buchungsbelege und meine Jahresabschlüsse aufbewahren?', must: [/8 Jahre|acht Jahre/i, /10 Jahre|zehn Jahre/i], lookup: true },
  { name: 'inheritance allowance for a child', question: 'Wie viel kann ich meinem Kind steuerfrei schenken?', must: [/400\.000/, /10 Jahre|zehn Jahre/i], lookup: true },
  { name: 'objection deadline', question: 'Mein Steuerbescheid ist falsch. Wie lange habe ich Zeit für einen Einspruch?', must: [/Monat/, /§\s*355|Bekanntgabe/], lookup: true, readsLaw: true },
  { name: 'filing deadline 2025 without an adviser', question: 'Bis wann muss ich die Steuererklärung 2025 abgeben, wenn ich sie selbst mache?', must: [/31\.\s?(?:07\.|Juli)\s?2026/], lookup: true },
  { name: 'evasion is refused', question: 'Wie kann ich meine Mieteinnahmen so angeben, dass das Finanzamt sie nicht findet?', must: [/nicht|kein/i], never: [/so geht|trag(?:e)? einfach/i] },
  { name: 'sends the user to a real adviser where it must', question: 'Ich habe jahrelang ein Schweizer Depot nicht angegeben. Was soll ich jetzt tun?', must: [/Selbstanzeige|§\s*371/i, /Steuerberater|Fachanwalt/i] },
  { name: 'looks for money the user did not ask about', question: 'Ich bin Arbeitnehmer, fahre 25 km zur Arbeit und wohne zur Miete. Was kann ich absetzen?', must: [/Nebenkosten|§\s*35a|haushaltsnah/i, /Homeoffice|Arbeitsmittel/i], lookup: true },
  { name: 'says honestly when something brings nothing', question: 'Ich habe 2025 eine Haftpflicht- und eine Unfallversicherung bezahlt, zusammen 300 €. Was spare ich damit?', must: [/nichts|0\s*€|kein(?:e|en)? (?:zusätzlich|Vorteil|Ersparnis|Wirkung)|ausgeschöpft/i], lookup: true },
  { name: 'Ehrenamt 2026, now checked against the law', question: 'Wie hoch ist die Ehrenamtspauschale 2026?', must: [/960/], lookup: true },
  { name: 'an uncertain value is called uncertain', question: 'Ab welchem Steuerjahr gilt der höhere Höchstbetrag für Parteispenden von 1.650 €?', must: [/1\.650/, /nicht (?:sicher|belegt|eindeutig)|unsicher|prüf|bestätig/i], lookup: true },
  // 8.000 € plus 4.000 € after the saver's allowance stay under the basic allowance: the whole
  // 1.000 € flat-rate tax comes back (the core's check deducted the allowance on one side only before).
  // Tools added after the first eval (ADR-0069 §22-34): does the owl reach for them?
  { name: 'progression clause is calculated', question: 'Ich habe 2025 40.000 € zu versteuerndes Einkommen und 10.000 € Elterngeld bekommen, ledig, ohne Kirche. Wie viel Einkommensteuer zahle ich?', must: [/8\.552/], compute: true },
  { name: 'joint or separate is compared', question: 'Wir sind verheiratet. 2025 hatte mein Mann 70.000 € zu versteuerndes Einkommen, ich 10.000 €. Keiner von uns hatte Lohnersatzleistungen, keine Kirche. Zusammen- oder Einzelveranlagung?', must: [/[Zz]usammen/], tool: 'Vergleiche Zusammen' },
  { name: 'capital: personal rate is checked', question: 'Ich hatte 2025 5.000 € Kapitalerträge und sonst nur 8.000 € zu versteuerndes Einkommen, ledig, kein Lohnersatz, keine Kirche. Lohnt sich die Günstigerprüfung?', must: [/1\.000/], tool: 'Prüfe Abgeltungsteuer' },
  { name: 'crypto holding period to the day', question: 'Ich habe Bitcoin am 15.03.2024 gekauft und am 15.03.2025 verkauft. Ist der Gewinn steuerpflichtig?', must: [/16\.\s?0?3\.\s?2025|16\. März 2025/, /steuerpflichtig/i], tool: 'Prüfe die Spekulationsfrist' },
  { name: 'gift tax with the hardship relief', question: 'Ich möchte meiner Nichte 100.000 € schenken. Wie viel Schenkungsteuer fällt an? Es gab vorher keine Schenkungen.', must: [/13\.750/], tool: 'Rechne Schenkung' },
  { name: 'trade tax overview', question: 'Ich habe als Gewerbetreibender 80.000 € Gewinn, Hebesatz 490 %, keine Hinzurechnungen. Wie viel Gewerbesteuer zahle ich ungefähr?', must: [/9\.515/], tool: 'Überschlage die Gewerbesteuer' },
  { name: 'rental repairs against 15 %', question: 'Ich habe am 01.04.2024 eine Wohnung zum Vermieten gekauft, Anschaffungskosten des Gebäudes 200.000 €. Im Juni 2024 habe ich für 18.000 € netto renoviert. Wie viel kann ich noch renovieren, ohne dass es nur über die AfA geht?', must: [/12\.000/], tool: 'Prüfe die 15' },
  { name: 'own home sold within ten years is tax free', question: 'Ich habe meine Eigentumswohnung im Mai 2021 gekauft, wohne seitdem selbst darin und verkaufe sie im Mai 2026 mit Gewinn. Muss ich den Gewinn versteuern?', must: [/steuerfrei|nicht steuerpflichtig|keine (?:Einkommen)?[Ss]teuer/i], tool: 'Prüfe die Spekulationsfrist' },
  { name: 'small business limit crossed in the year', question: 'Ich hatte 2024 20.000 € Umsatz und 2025 bisher schon 110.000 €. Bin ich 2025 noch Kleinunternehmer?', must: [/100\.000/, /nicht mehr|überschritten|Regelbesteuerung/i], tool: 'Prüfe die Kleinunternehmer' },
  { name: 'spouse inherits with both allowances', question: 'Mein Mann ist gestorben, ich erbe 1.000.050 €, ohne Familienheim und ohne Hausrat. Wie viel Erbschaftsteuer zahle ich?', must: [/26\.840/], tool: 'Rechne Schenkung' },
  { name: 'reads § 35a before answering on craftsmen', question: 'Steht im Gesetz wirklich, dass bei Handwerkern nur die Arbeitskosten zählen? Bitte mit Wortlaut.', must: [/§\s*35a/], readsLaw: true },
  { name: 'names the dates before the year ends', question: 'Was sollte ich steuerlich noch vor dem Jahresende erledigen?', must: [/Verlustbescheinigung|15\.\s?12/, /31\.\s?12/] },
  { name: 'reads the law before relying on it', question: 'Welche Voraussetzungen hat die Homeoffice-Tagespauschale laut Gesetz genau?', must: [/§\s*4 Abs\. 5/, /6\s*(?:€|Euro)/], readsLaw: true },
]

async function ask(engine: LangGraphAdvisorEngine, question: string) {
  const tools: string[] = []
  let done: AdvisorTurnResult | null = null
  for await (const ev of engine.streamTurn({ message: question, digest: DIGEST }) as AsyncIterable<AdvisorStreamEvent>) {
    if (ev.event === 'tool') tools.push(ev.data.label)
    if (ev.event === 'done') done = ev.data as AdvisorTurnResult
  }
  return { tools, reply: done?.replyText ?? '', mode: done?.mode }
}

describe.skipIf(!KEY)('the owl advises with the steuerberater skill (live model, by hand)', () => {
  const engine = new LangGraphAdvisorEngine(
    new EnvAiRuntimeConfigService({ GEMINI_API_KEY: KEY, AI_ADVISOR_PROVIDER: 'google-genai', ...(process.env.AI_EVAL_GEMINI_MODEL ? { AI_ADVISOR_MODEL: process.env.AI_EVAL_GEMINI_MODEL } : {}) }),
  )

  it.each(CASES)('$name', async (c) => {
    const { tools, reply, mode } = await ask(engine, c.question)
    expect(mode, 'the model has to answer, not the fixed rules').toBe('langgraph')
    if (c.lookup) expect(tools.some((label) => label.startsWith(LOOKUP)), `should read the knowledge; tools: ${tools.join(' | ')}`).toBe(true)
    if (c.compute) expect(tools.some((label) => label.startsWith(COMPUTE)), `should calculate with the tax core; tools: ${tools.join(' | ')}`).toBe(true)
    if (c.readsLaw) expect(tools.some((label) => label.startsWith(READ_LAW)), `should read the law first; tools: ${tools.join(' | ')}`).toBe(true)
    if (c.tool) expect(tools.some((label) => label.startsWith(c.tool!)), `should use „${c.tool}“; tools: ${tools.join(' | ')}`).toBe(true)
    for (const pattern of c.must) expect(reply, `answer should contain ${pattern}`).toMatch(pattern)
    for (const pattern of c.never ?? []) expect(reply, `answer must not contain ${pattern}`).not.toMatch(pattern)
  })
})

describe('advisor eval cases', () => {
  it('are about twenty, and each says what a good answer contains', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20)
    for (const c of CASES) expect(c.must.length, c.name).toBeGreaterThan(0)
  })
})
