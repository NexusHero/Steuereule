import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { MCP_SCOPE, type McpScope } from '../common/assistant-scopes.js'
import type { ToolBudget } from './mcp-rate-limit.js'

/** Per tool: the scope it needs, what kind of change it makes, its budget (beta P4, ADR-0052 amendments 6 and 9). */

/** `read` changes nothing that stays; `write` adds or changes; `destructive` takes something away. */
export type ToolKind = 'read' | 'write' | 'destructive'

export interface ToolPolicy {
  readonly title: string
  readonly scope: McpScope
  readonly kind: ToolKind
  /**
   * A budget of its own besides the call limit, taken by the gate before the tool runs: `printout` for a tool
   * that renders the printout to find what does not fit (H2-26), `checkoutLink` for one that opens a checkout
   * session at the payment provider (ADR-0052 amendment 9), `receiptUpload` for one that stores a file.
   */
  readonly budget?: ToolBudget
  /** Reaches a third-party host (the law texts, the payment provider). */
  readonly openWorld?: true
}

const read = (title: string, extra: Partial<ToolPolicy> = {}): ToolPolicy => ({ title, scope: MCP_SCOPE.read, kind: 'read', ...extra })
const write = (title: string, extra: Partial<ToolPolicy> = {}): ToolPolicy => ({ title, scope: MCP_SCOPE.write, kind: 'write', ...extra })
const remove = (title: string, extra: Partial<ToolPolicy> = {}): ToolPolicy => ({ title, scope: MCP_SCOPE.write, kind: 'destructive', ...extra })

/** Every tool the server offers. A tool without a row here cannot be registered. */
export const TOOL_POLICIES: Readonly<Record<string, ToolPolicy>> = {
  steuerjahre_auflisten: read('Steuerjahre des Nutzers'),
  ausdruck_vorpruefung: read('Vorprüfung des Ausdrucks', { budget: 'printout' }),
  eulen_hinweise: read('Eulen-Hinweise'),
  zahllink_anfordern: { title: 'Zahllink anfordern', scope: MCP_SCOPE.payment, kind: 'write', openWorld: true, budget: 'checkoutLink' },
  steuerbericht: read('Stand der Erklärung', { budget: 'printout' }),
  schaetzung_aufschluesseln: read('Rechenweg der Schätzung'),
  bescheid_abgleichen: read('Bescheid abgleichen'),
  pruefen: read('Erklärung prüfen', { budget: 'printout' }),
  offene_fragen: read('Offene Interview-Fragen'),
  // Written on trial and always rolled back: nothing stays, but only an assistant that may write gets it.
  auswirkung_simulieren: { title: 'Wirkung eines Eintrags', scope: MCP_SCOPE.write, kind: 'read' },
  szenario_simulieren: { title: 'Wirkung mehrerer Einträge', scope: MCP_SCOPE.write, kind: 'read' },
  maske_lesen: read('Maske lesen'),
  haushalt_ueberblick: read('Haushalt im Überblick'),
  belege_auflisten: read('Belege auflisten'),
  maske_eintragen: write('Wert eintragen'),
  maske_eintragen_stapel: write('Mehrere Werte eintragen'),
  maske_felder: read('Felder einer Maske'),
  eintrag_zuruecknehmen: remove('Eigenen Eintrag zurücknehmen'),
  beleg_hochladen: { title: 'Beleg hochladen', scope: MCP_SCOPE.receipts, kind: 'write', budget: 'receiptUpload' },
  beleg_zuruecknehmen: { title: 'Eigenen Beleg zurücknehmen', scope: MCP_SCOPE.receipts, kind: 'destructive' },
  einkommensteuer_berechnen: read('Einkommensteuer berechnen'),
  veranlagungsarten_vergleichen: read('Veranlagungsarten mit frei gewählten Zahlen vergleichen'),
  kapitalertraege_guenstigerpruefung: read('Günstigerprüfung Kapitalerträge'),
  spekulationsfrist_pruefen: read('Spekulationsfrist prüfen'),
  renovierung_15_prozent_pruefen: read('15-%-Grenze prüfen'),
  schenkungsteuer_berechnen: read('Schenkung- und Erbschaftsteuer'),
  kleinunternehmer_pruefen: read('Kleinunternehmerregelung prüfen'),
  gewerbesteuer_schaetzen: read('Gewerbesteuer schätzen'),
  steuerwissen_lesen: read('Steuerwissen lesen'),
  gesetzestext_lesen: read('Gesetzestext lesen', { openWorld: true }),
  rechtsquelle_nachschlagen: read('Rechtsquelle nachschlagen'),
  kinder_auflisten: read('Kinder auflisten'),
  kind_anlegen: write('Kind anlegen'),
  kind_entfernen: remove('Eigenes Kind entfernen'),
  wechselkurs: read('Jahresdurchschnittskurs CHF'),
  feld_finden: read('Feld finden'),
  vordruck_zeilen: read('Zeilen der Vordrucke'),
  fristen: read('Abgabefrist'),
  vermietungen_auflisten: read('Vermietungen auflisten'),
  vermietung_anlegen: write('Vermietung anlegen'),
  vermietung_entfernen: remove('Eigene Vermietung entfernen'),
  aufgabe_fuer_nutzer: write('Aufgabe für den Nutzer'),
  aufgaben_auflisten: read('Eigene Aufgaben auflisten'),
  aufgabe_zuruecknehmen: remove('Eigene Aufgabe zurücknehmen'),
  buchung_entwerfen: write('Buchung entwerfen'),
  buchungsentwuerfe_auflisten: read('Eigene Buchungsentwürfe'),
  veranlagung_vergleichen: read('Veranlagungsarten aus den erfassten Zahlen vergleichen'),
  vorjahr_vergleichen: read('Mit dem Vorjahr vergleichen'),
}

/** The tool annotations a client shows (MCP-10): whether a call changes or removes something. */
export function annotationsOf(policy: ToolPolicy): ToolAnnotations {
  return {
    title: policy.title,
    readOnlyHint: policy.kind === 'read',
    destructiveHint: policy.kind === 'destructive',
    openWorldHint: policy.openWorld === true,
  }
}
