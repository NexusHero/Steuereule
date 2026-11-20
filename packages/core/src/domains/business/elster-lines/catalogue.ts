import { EUER_KEYS, type EuerKey } from '../euer-keys'
import { EXTRACTED_LINES, SOURCE_SHA256 } from './lines.generated'
import {
  ELSTER_YEARS,
  type ElsterForm,
  type ElsterFormSource,
  type ElsterLine,
  type ElsterLinesResult,
  type ElsterYear,
  type EuerLineResult,
} from './types'

/** The key in the generated data (named after the source PDF) for each form. */
const DATA_KEY: Partial<Record<ElsterForm, string>> = {
  'anlage-euer': 'euer',
  'ust-2-a': 'ust',
  'est-1-a': 'est-1-a',
  'anlage-sonstiges': 'anlage-sonstiges',
  'gewst-1-a': 'gewst',
}

/**
 * Anlage G and Anlage S are filed electronically only. The Formular-Management-System shows a notice
 * instead of a PDF, the Anleitung zur Einkommensteuererklärung (FMS and ELSTER) has no section for
 * them, and no other official public source names their fields (docs/research/selbststaendige-formulare.md).
 * GewSt 1 A has no PDF either, but its ELSTER help names the fields (without Zeile).
 */
const ELECTRONIC_ONLY: ReadonlySet<ElsterForm> = new Set(['anlage-s', 'anlage-g'])

const BMF = 'https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten'
const fms = (formId: string, year: number) => {
  const yy = String(year).slice(-2)
  return `https://www.formulare-bfinv.de/ffw/catalog/makePDF.do?path=${encodeURIComponent(`catalog://Steuerformulare/est/est${yy}/${formId}_${yy}`)}`
}

const SOURCE_URL: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  euer: {
    2022: `${BMF}/Einkommensteuer/2022-09-01-standardisierte-einnahmenueberschussrechnung-nach-paragraf-60-absatz-4-EStDV-anlage-EUER-2022.pdf`,
    2023: `${BMF}/Einkommensteuer/2023-08-31-standardisierte-einnahmenueberschussrechnung-nach-paragraf-60-absatz-4-EStDV-anlage-EUER-2023.pdf`,
    2024: `${BMF}/Einkommensteuer/2024-09-02-anlage-EUER-2024.pdf`,
    2025: `${BMF}/Einkommensteuer/2025-08-29-anlage-EUER-2025.pdf`,
    2026: `${BMF}/Einkommensteuer/2026-09-01-anlage-EUER-2026.pdf`,
  },
  ust: {
    2022: `${BMF}/Umsatzsteuer/2021-12-23-muster-USterklaerung-2022.pdf`,
    2023: `${BMF}/Umsatzsteuer/2022-12-21-muster-der-umsatzsteuererklaerung-2023.pdf`,
    2024: `${BMF}/Umsatzsteuer/2023-11-06-muster-der-umsatzsteuererklaerung-2024.pdf`,
    2025: `${BMF}/Umsatzsteuer/2024-12-09-muster-umsatzsteuererklaerung-2025.pdf`,
    2026: `${BMF}/Umsatzsteuer/2025-12-29-muster-USt-erklaerung-2026.pdf`,
  },
  'est-1-a': Object.fromEntries([2022, 2023, 2024, 2025].map((y) => [y, fms('034037', y)])),
  'anlage-sonstiges': Object.fromEntries([2022, 2023, 2024, 2025].map((y) => [y, fms('035008', y)])),
  gewst: Object.fromEntries(
    [2022, 2023, 2024, 2025].map((y) => [y, `https://www.elster.de/eportal/helpGlobal?themaGlobal=help_gewst_ufa_20_${y}`]),
  ),
}

/**
 * Which line each EÜR key sums into, by stable line id. Where a year's form has no line of its own
 * for a key, the next id is that year's nearest line (euer-keys.ts: never dropped silently):
 * - the Tagespauschale had no line of its own before 2024; the Anleitung 2022/2023 puts it into the
 *   line for the häusliches Arbeitszimmer (Kz 162);
 * - the Gewerbesteuer goes into the column "nicht abziehbar" of the sonstige beschränkt abziehbare
 *   Betriebsausgaben (Anleitung zur Anlage EÜR, every year 2022 to 2026);
 * - of the Hinzurechnung of Investitionsabzugsbeträge (one line per year of origin) the key maps to
 *   the line of the latest year of origin, the usual case.
 */
export const EUER_KEY_LINES: Readonly<Record<EuerKey, readonly string[]>> = {
  einnahmen_kleinunternehmer: ['euer.einnahmen.kz111'],
  einnahmen_umsatzsteuerpflichtig: ['euer.einnahmen.kz112'],
  einnahmen_umsatzsteuerfrei: ['euer.einnahmen.kz103'],
  einnahmen_umsatzsteuer_vereinnahmt: ['euer.einnahmen.kz140'],
  einnahmen_vorsteuer_erstattet: ['euer.einnahmen.kz141'],
  einnahmen_veraeusserung_anlagevermoegen: ['euer.einnahmen.kz102'],
  einnahmen_private_kfz_nutzung: ['euer.einnahmen.kz106'],
  einnahmen_sonstige_entnahmen: ['euer.einnahmen.kz108'],
  einnahmen_umsatzsteuer_entnahmen: ['euer.einnahmen.kz140'],
  einnahmen_aufloesung_ruecklagen: ['euer.einnahmen.aufloesung-ruecklagen'],
  ausgaben_waren_rohstoffe: ['euer.ausgaben.kz100'],
  ausgaben_fremdleistungen: ['euer.ausgaben.kz110'],
  ausgaben_personal: ['euer.ausgaben.kz120'],
  ausgaben_afa_unbeweglich: ['euer.ausgaben.kz136'],
  ausgaben_afa_beweglich: ['euer.ausgaben.kz130'],
  ausgaben_afa_immateriell: ['euer.ausgaben.kz131'],
  ausgaben_sonder_afa_7g: ['euer.ausgaben.kz134'],
  ausgaben_herabsetzung_7g: ['euer.ausgaben.kz138'],
  ausgaben_gwg: ['euer.ausgaben.kz132'],
  ausgaben_sammelposten: ['euer.ausgaben.kz137'],
  ausgaben_restbuchwert_abgang: ['euer.ausgaben.kz135'],
  ausgaben_raumkosten: ['euer.ausgaben.kz150'],
  ausgaben_miete_leasing_beweglich: ['euer.ausgaben.kz222'],
  ausgaben_kfz: ['euer.beschraenkt.kz146'],
  ausgaben_reise: ['euer.ausgaben.kz221'],
  ausgaben_telekommunikation: ['euer.ausgaben.kz280'],
  ausgaben_fortbildung: ['euer.ausgaben.kz281'],
  ausgaben_rechts_beratung: ['euer.ausgaben.kz194'],
  ausgaben_versicherungen_beitraege: ['euer.ausgaben.kz223'],
  ausgaben_werbung: ['euer.ausgaben.kz224'],
  ausgaben_schuldzinsen: ['euer.ausgaben.kz234'],
  ausgaben_sonstige: ['euer.ausgaben.kz183'],
  ausgaben_vorsteuer_gezahlt: ['euer.ausgaben.kz185'],
  ausgaben_umsatzsteuer_an_finanzamt: ['euer.ausgaben.kz186'],
  ausgaben_gewerbesteuer: ['euer.beschraenkt.kz168'],
  nicht_abziehbar_schuldzinsen_4_4a: ['euer.gewinn.kz271'],
  nicht_abziehbar_sonstige: ['euer.beschraenkt.kz139'],
  beschraenkt_geschenke: ['euer.beschraenkt.kz164'],
  beschraenkt_bewirtung: ['euer.beschraenkt.kz165'],
  beschraenkt_verpflegungsmehraufwand: ['euer.beschraenkt.kz171'],
  beschraenkt_arbeitszimmer_tagespauschale: ['euer.beschraenkt.kz163', 'euer.beschraenkt.kz162'],
  beschraenkt_fahrten_wohnung_betrieb: ['euer.beschraenkt.kz176'],
  gewinn_iab_abzug: ['euer.gewinn.kz187'],
  gewinn_iab_hinzurechnung: ['euer.gewinn.kz182'],
  gewinn_ruecklagen_bildung: ['euer.ausgaben.ruecklagen-uebertrag'],
}

function resolveEuerLineId(key: EuerKey, ids: ReadonlySet<string>): string | undefined {
  return EUER_KEY_LINES[key].find((id) => ids.has(id))
}

function latestPublished(dataKey: string | undefined): ElsterYear | null {
  const years = dataKey ? EXTRACTED_LINES[dataKey] : undefined
  const published = ELSTER_YEARS.filter((y) => years?.[y] !== undefined)
  return published.at(-1) ?? null
}

function buildLines(form: ElsterForm, year: ElsterYear, dataKey: string): readonly ElsterLine[] {
  const rows = EXTRACTED_LINES[dataKey]?.[year] ?? []
  const keysByLine = new Map<string, EuerKey[]>()
  if (form === 'anlage-euer') {
    const ids = new Set(rows.map((r) => r.id))
    for (const key of EUER_KEYS) {
      const id = resolveEuerLineId(key, ids)
      if (id) keysByLine.set(id, [...(keysByLine.get(id) ?? []), key])
    }
  }
  return rows.map((r) => ({
    id: r.id,
    form,
    year,
    zeile: r.zeile,
    kennzahlen: r.kz,
    label: r.label,
    euerKeys: keysByLine.get(r.id) ?? [],
  }))
}

const cache = new Map<string, ElsterLinesResult>()

/** The lines of `form` in tax year `year`, or why the app cannot show them. */
export function elsterLinesFor(form: ElsterForm, year: ElsterYear): ElsterLinesResult {
  if (ELECTRONIC_ONLY.has(form)) return { status: 'not_available', reason: 'electronic_only' }
  const dataKey = DATA_KEY[form]
  const cacheKey = `${form}:${year}`
  const cached = cache.get(cacheKey)
  if (cached) return cached
  let result: ElsterLinesResult
  if (!dataKey || EXTRACTED_LINES[dataKey]?.[year] === undefined) {
    result = { status: 'not_published', latestPublishedYear: latestPublished(dataKey) }
  } else {
    const source: ElsterFormSource = { url: SOURCE_URL[dataKey]![year]!, sha256: SOURCE_SHA256[dataKey]![year]! }
    result = { status: 'published', lines: buildLines(form, year, dataKey), source }
  }
  cache.set(cacheKey, result)
  return result
}

/** The Anlage EÜR line an EÜR key sums into in `year`. */
export function euerLineFor(key: EuerKey, year: ElsterYear): EuerLineResult {
  const result = elsterLinesFor('anlage-euer', year)
  if (result.status !== 'published') {
    return { status: 'not_published', latestPublishedYear: result.status === 'not_published' ? result.latestPublishedYear : null }
  }
  const id = resolveEuerLineId(key, new Set(result.lines.map((l) => l.id)))
  const line = result.lines.find((l) => l.id === id)
  // Every key resolves in every published year (catalogue.test.ts); a gap here is a broken spec.
  if (!line) throw new Error(`EÜR key ${key} has no line in ${year}`)
  return { status: 'published', line }
}
