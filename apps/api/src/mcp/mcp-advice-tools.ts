import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ADVISOR_LEGAL_SOURCES, checkPrivateSale, checkRentalRepairs, checkSmallBusiness, computeGiftTax, estimateTradeTax, isChurchTaxFactor, privateSalesExemptionLimit, privateSalesWithinLimit } from '@steuereule/core'
import type { z } from 'zod'
import { checkCapitalTaxation, compareFilingTypes, computeIncomeTax } from '../ki/advisor-income-tax.js'
import { TOOL_ARG_SCHEMAS } from '../ki/advisor-tools.js'
import { readLawForOwl, type LawId } from '../ki/law-text.js'
import { ADVISOR_KNOWLEDGE } from '../ki/skills.generated.js'
import type { AssistantSessionInfo } from './mcp.service.js'

/** What the advice tools need from the host: the scope check and the audit line. */
export interface AdviceToolHost {
  readonly requireRead: (assistant: AssistantSessionInfo) => void
  readonly audit: (resource: string) => Promise<void>
}

type AdviceArgs<Name extends keyof typeof TOOL_ARG_SCHEMAS> = z.infer<(typeof TOOL_ARG_SCHEMAS)[Name]>

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] })
const failure = (error: string) => text({ ok: false, error })

const CHURCH_TAX_ERROR = 'Der Kirchensteuersatz ist 0, 0.08 (Bayern, Baden-Württemberg) oder 0.09.'

function withErrors<T>(compute: () => T): ReturnType<typeof text> {
  try {
    return text({ ok: true, ...(compute() as object) })
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Ungültige Angaben.')
  }
}

/**
 * The tax advice of the app's own core, for the user's assistant (ADR-0052 amendment 2): the same
 * deterministic tools the in-app advisor uses, with the same inputs and results, so the assistant
 * quotes the app's figures instead of working them out. None of them reads or writes the user's
 * data, so they need only the read scope; every call is still audited.
 */
export function registerAdviceTools(server: McpServer, assistant: AssistantSessionInfo, host: AdviceToolHost): void {
  const gate = async (resource: string): Promise<void> => {
    host.requireRead(assistant)
    await host.audit(resource)
  }

  server.tool(
    'einkommensteuer_berechnen',
    'Rechnet mit dem Rechenkern der App die tarifliche Einkommensteuer (§ 32a EStG), Soli und Kirchensteuer für ein zu versteuerndes Einkommen, auf Wunsch mit Splitting. `extraDeduction` zeigt, was ein zusätzlicher Abzug spart; `wageReplacementEur` bildet den Progressionsvorbehalt (§ 32b EStG) ab. Nie selbst rechnen, diese Zahlen zitieren.',
    TOOL_ARG_SCHEMAS.compute_income_tax.shape,
    async (args: AdviceArgs<'compute_income_tax'>) => {
      await gate('einkommensteuer_berechnen')
      if (!isChurchTaxFactor(args.churchTaxRate)) return failure(CHURCH_TAX_ERROR)
      const result = computeIncomeTax({ ...args, churchTaxRate: args.churchTaxRate })
      return result === null ? failure(`Für das Jahr ${args.year} kennt der Rechenkern keinen Tarif.`) : text({ ok: true, ...result })
    },
  )

  server.tool(
    'veranlagungsarten_vergleichen',
    'Vergleicht für Ehegatten Zusammen- und Einzelveranlagung (§§ 26, 26a EStG): zu versteuerndes Einkommen je Ehegatte, Kirchensteuersatz, Lohnersatzleistungen beider zusammen. Lass `wageReplacementEur` weg, solange unbekannt ist, ob es welche gab; dann ist das Ergebnis `open`. `outcome`: joint, separate, too_close oder open.',
    TOOL_ARG_SCHEMAS.compare_filing_types.shape,
    async (args: AdviceArgs<'compare_filing_types'>) => {
      await gate('veranlagungsarten_vergleichen')
      if (!isChurchTaxFactor(args.churchTaxRate)) return failure(CHURCH_TAX_ERROR)
      const result = compareFilingTypes({ ...args, churchTaxRate: args.churchTaxRate })
      return result === null ? failure(`Für das Jahr ${args.year} kennt der Rechenkern keinen Tarif.`) : text({ ok: true, ...result })
    },
  )

  server.tool(
    'kapitalertraege_guenstigerpruefung',
    'Günstigerprüfung (§ 32d Abs. 6 EStG): Abgeltungsteuer gegen persönlichen Steuersatz für Kapitalerträge (vor Sparer-Pauschbetrag). `outcome`: personal (Antrag in Anlage KAP lohnt), flat_rate, too_close oder open.',
    TOOL_ARG_SCHEMAS.check_capital_taxation.shape,
    async (args: AdviceArgs<'check_capital_taxation'>) => {
      await gate('kapitalertraege_guenstigerpruefung')
      if (!isChurchTaxFactor(args.churchTaxRate)) return failure(CHURCH_TAX_ERROR)
      const result = checkCapitalTaxation({ ...args, churchTaxRate: args.churchTaxRate })
      return result === null ? failure(`Für das Jahr ${args.year} kennt der Rechenkern keinen Tarif.`) : text({ ok: true, ...result })
    },
  )

  server.tool(
    'spekulationsfrist_pruefen',
    'Prüft, ob der Verkauf eines privaten Wirtschaftsguts (Krypto, Gold, Immobilie) innerhalb der Spekulationsfrist liegt (§ 23 EStG), mit der Freigrenze des Jahres.',
    TOOL_ARG_SCHEMAS.check_holding_period.shape,
    async (args: AdviceArgs<'check_holding_period'>) => {
      await gate('spekulationsfrist_pruefen')
      return withErrors(() => {
        const year = Number(args.soldOn.slice(0, 4))
        const limit =
          args.totalGainsOfYearEur === undefined
            ? {}
            : { exemptionLimitEur: privateSalesExemptionLimit(year), withinExemptionLimit: privateSalesWithinLimit(args.totalGainsOfYearEur, year) }
        return { ...checkPrivateSale(args), ...limit }
      })
    },
  )

  server.tool(
    'renovierung_15_prozent_pruefen',
    'Prüft Renovierungen nach dem Kauf einer vermieteten Immobilie gegen die 15-%-Grenze der anschaffungsnahen Herstellungskosten (§ 6 Abs. 1 Nr. 1a EStG).',
    TOOL_ARG_SCHEMAS.check_rental_repairs.shape,
    async (args: AdviceArgs<'check_rental_repairs'>) => {
      await gate('renovierung_15_prozent_pruefen')
      return withErrors(() => checkRentalRepairs(args))
    },
  )

  server.tool(
    'schenkungsteuer_berechnen',
    'Rechnet Schenkung- oder Erbschaftsteuer nach Verwandtschaftsverhältnis, Wert, Vorschenkungen der letzten zehn Jahre und Alter des Kindes.',
    TOOL_ARG_SCHEMAS.compute_gift_tax.shape,
    async (args: AdviceArgs<'compute_gift_tax'>) => {
      await gate('schenkungsteuer_berechnen')
      return withErrors(() => computeGiftTax(args))
    },
  )

  server.tool(
    'kleinunternehmer_pruefen',
    'Prüft die Kleinunternehmerregelung (§ 19 UStG) mit den Umsätzen des Vorjahres und des laufenden Jahres.',
    TOOL_ARG_SCHEMAS.check_small_business.shape,
    async (args: AdviceArgs<'check_small_business'>) => {
      await gate('kleinunternehmer_pruefen')
      return withErrors(() => checkSmallBusiness(args))
    },
  )

  server.tool(
    'gewerbesteuer_schaetzen',
    'Überschlägt die Gewerbesteuer aus Gewinn, Hinzurechnungen, Kürzungen und Hebesatz.',
    TOOL_ARG_SCHEMAS.estimate_trade_tax.shape,
    async (args: AdviceArgs<'estimate_trade_tax'>) => {
      await gate('gewerbesteuer_schaetzen')
      return withErrors(() => estimateTradeTax(args))
    },
  )

  server.tool(
    'steuerwissen_lesen',
    'Liest einen Abschnitt des geprüften Steuerwissens der App: kennzahlen (Beträge je Jahr), gestaltung (Sparhebel je Lebenslage), arbeitnehmer, familie-sonderausgaben, kapital-vermietung-rente, selbststaendige-ust, grenzgaenger-ausland, erbschaft-schenkung, verfahren. Vor jeder fachlichen Aussage zu einem dieser Themen aufrufen; Beträge nie aus dem Gedächtnis nennen.',
    TOOL_ARG_SCHEMAS.lookup_tax_knowledge.shape,
    async (args: AdviceArgs<'lookup_tax_knowledge'>) => {
      await gate('steuerwissen_lesen')
      const entry = ADVISOR_KNOWLEDGE[args.topic]
      return text({ ok: true, topic: args.topic, title: entry.title, text: entry.text })
    },
  )

  server.tool(
    'gesetzestext_lesen',
    'Liest den heutigen Wortlaut einer Norm von gesetze-im-internet.de, gezielt Absatz oder Nummer. Trägt eine Norm deine Antwort, lies sie vorher.',
    TOOL_ARG_SCHEMAS.read_law_text.shape,
    async (args: AdviceArgs<'read_law_text'>) => {
      await gate('gesetzestext_lesen')
      try {
        return text({ ok: true, ...(await readLawForOwl(args.law as LawId, args.paragraph, args)) })
      } catch {
        return failure('gesetze-im-internet.de ist gerade nicht erreichbar. Sage deinem Nutzer, dass der Wortlaut nicht frisch gelesen wurde.')
      }
    },
  )

  server.tool(
    'rechtsquelle_nachschlagen',
    'Schlägt eine Fundstelle aus dem Quellenkatalog der App nach (z. B. estg-9-1).',
    TOOL_ARG_SCHEMAS.lookup_legal_source.shape,
    async (args: AdviceArgs<'lookup_legal_source'>) => {
      await gate('rechtsquelle_nachschlagen')
      const source = (ADVISOR_LEGAL_SOURCES as Readonly<Record<string, unknown>>)[args.sourceId]
      return source === undefined ? failure(`Unbekannte Quelle "${args.sourceId}". Bekannt: ${Object.keys(ADVISOR_LEGAL_SOURCES).join(', ')}.`) : text({ ok: true, source })
    },
  )
}
