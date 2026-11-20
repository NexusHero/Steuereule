import { createHash } from 'node:crypto'
import { chartAccounts, findAccount } from './accounts'
import { isBookingDate, LedgerError, yearOf, type IsoDate, type JournalEntry, type Ledger } from './journal'

/**
 * GoBD integrity for the book (ADR-0101 §13): Festschreibung, an append-only log with a hash chain,
 * gapless numbers, retention periods of § 147 AO, the Z3 data export (GDPdU Beschreibungsstandard)
 * and the Verfahrensdokumentation. Nothing here certifies anything; no text claims a certification.
 */

// ---------------------------------------------------------------------------------------------------
// Festschreibung

/** Locks every day up to `through`. A lock only moves forward: a Festschreibung is never undone. */
export function lockPeriod(ledger: Ledger, through: IsoDate): Ledger {
  if (!isBookingDate(through)) throw new LedgerError('invalid_date', `Ungültiges Datum: ${through}`)
  if (ledger.lockedThrough !== null && through < ledger.lockedThrough) {
    throw new LedgerError('period_locked', `Festgeschrieben ist schon bis ${ledger.lockedThrough}; das lässt sich nicht zurücknehmen.`)
  }
  return Object.freeze({ ...ledger, lockedThrough: through })
}

export function isLocked(ledger: Ledger, date: IsoDate): boolean {
  return ledger.lockedThrough !== null && date <= ledger.lockedThrough
}

// ---------------------------------------------------------------------------------------------------
// Hash-chained log

export type LogRecordKind = 'entry' | 'lock' | 'export'

export interface LogRecord {
  readonly seq: number
  /** ISO timestamp the API stamps when it writes the record. */
  readonly at: string
  readonly kind: LogRecordKind
  readonly payload: unknown
  readonly prevHash: string
  readonly hash: string
}

export const GENESIS_HASH = '0'.repeat(64)

/** JSON with sorted keys and no whitespace: the same content always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Not a finite number')
    return JSON.stringify(value ?? null)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).filter((k) => record[k] !== undefined).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`
}

function hashRecord(prevHash: string, seq: number, at: string, kind: LogRecordKind, payload: unknown): string {
  return createHash('sha256').update(`${prevHash}\n${canonicalJson({ seq, at, kind, payload })}`).digest('hex')
}

export function appendLogRecord(log: readonly LogRecord[], kind: LogRecordKind, payload: unknown, at: string): readonly LogRecord[] {
  const prev = log.at(-1)
  const seq = prev === undefined ? 1 : prev.seq + 1
  const prevHash = prev === undefined ? GENESIS_HASH : prev.hash
  const record: LogRecord = Object.freeze({ seq, at, kind, payload, prevHash, hash: hashRecord(prevHash, seq, at, kind, payload) })
  return Object.freeze([...log, record])
}

export type LogVerification =
  | { readonly ok: true; readonly count: number; readonly headHash: string }
  | { readonly ok: false; readonly firstBadSeq: number; readonly reason: 'sequence' | 'chain' | 'content' }

/** Walks the chain from the start and names the first record whose number, link or content is off. */
export function verifyLog(log: readonly LogRecord[]): LogVerification {
  let prevHash = GENESIS_HASH
  for (let i = 0; i < log.length; i++) {
    const r = log[i]!
    if (r.seq !== i + 1) return { ok: false, firstBadSeq: i + 1, reason: 'sequence' }
    if (r.prevHash !== prevHash) return { ok: false, firstBadSeq: r.seq, reason: 'chain' }
    if (hashRecord(r.prevHash, r.seq, r.at, r.kind, r.payload) !== r.hash) return { ok: false, firstBadSeq: r.seq, reason: 'content' }
    prevHash = r.hash
  }
  return { ok: true, count: log.length, headHash: prevHash }
}

/**
 * The entries table must agree with the log: every entry once, unchanged. Returns the numbers of
 * entries that are missing from the log or differ from what was logged.
 */
export function entriesDifferingFromLog(entries: readonly JournalEntry[], log: readonly LogRecord[]): readonly number[] {
  const logged = new Map<number, string>()
  for (const r of log) {
    if (r.kind !== 'entry') continue
    const payload = r.payload as JournalEntry
    logged.set(payload.number, canonicalJson(payload))
  }
  return entries.filter((e) => logged.get(e.number) !== canonicalJson(e)).map((e) => e.number)
}

export interface NumberingCheck {
  readonly missing: readonly number[]
  readonly duplicates: readonly number[]
}

/** Entry numbers must run 1, 2, 3 … without a gap or a repeat. */
export function checkNumbering(entries: readonly JournalEntry[]): NumberingCheck {
  const seen = new Set<number>()
  const duplicates: number[] = []
  let max = 0
  for (const e of entries) {
    if (seen.has(e.number)) duplicates.push(e.number)
    seen.add(e.number)
    max = Math.max(max, e.number)
  }
  const missing: number[] = []
  for (let n = 1; n <= max; n++) if (!seen.has(n)) missing.push(n)
  return { missing, duplicates }
}

// ---------------------------------------------------------------------------------------------------
// Retention (§ 147 AO)

export type RetentionCategory = 'buecher' | 'buchungsbelege' | 'handelsbriefe' | 'sonstige'

export interface RetentionPeriod {
  readonly years: number
  /** Last day the document must be kept, unless the Festsetzungsfrist is still open. */
  readonly retainThrough: IsoDate
  readonly basis: string
  /** § 147 Abs. 3 S. 5 AO: the period does not end while the assessment period for the tax is open. */
  readonly extendedWhileAssessmentOpen: true
}

/**
 * Retention by § 147 Abs. 3 AO, counted from the end of the calendar year the document was made in
 * (§ 147 Abs. 4 AO). Since BEG IV, Buchungsbelege are kept 8 instead of 10 years; the new period
 * applies to every Beleg whose old period had not run out by 31.12.2024 (Art. 97 § 19a EGAO), so a
 * Beleg of 2015 or 2016 may go from 1.1.2025.
 */
export function retentionPeriod(category: RetentionCategory, documentYear: number): RetentionPeriod {
  const through = (year: number): IsoDate => `${year}-12-31`
  switch (category) {
    case 'buecher':
      return { years: 10, retainThrough: through(documentYear + 10), basis: '§ 147 Abs. 1 Nr. 1, Abs. 3 S. 1 AO', extendedWhileAssessmentOpen: true }
    case 'buchungsbelege': {
      if (documentYear + 10 <= 2024) {
        return { years: 10, retainThrough: through(documentYear + 10), basis: '§ 147 Abs. 3 AO a. F.', extendedWhileAssessmentOpen: true }
      }
      return { years: 8, retainThrough: through(Math.max(documentYear + 8, 2024)), basis: '§ 147 Abs. 1 Nr. 4, Abs. 3 S. 1 AO i. d. F. BEG IV; Art. 97 § 19a EGAO', extendedWhileAssessmentOpen: true }
    }
    case 'handelsbriefe':
    case 'sonstige':
      return { years: 6, retainThrough: through(documentYear + 6), basis: '§ 147 Abs. 1 Nr. 2, 3, 5, Abs. 3 S. 1 AO', extendedWhileAssessmentOpen: true }
  }
}

// ---------------------------------------------------------------------------------------------------
// Z3 data export (GDPdU Beschreibungsstandard, index.xml + CSV)

export interface DataExportMeta {
  readonly supplierName: string
  readonly supplierLocation: string
  readonly from: IsoDate
  readonly to: IsoDate
  readonly comment?: string
}

export interface DataExport {
  /** File name → content. The API adds the DTD `gdpdu-01-09-2004.dtd` the BMF publishes. */
  readonly files: Readonly<Record<string, string>>
}

const CRLF = '\r\n'

function csvField(value: string | number | null): string {
  if (value === null) return ''
  if (typeof value === 'number') return String(value)
  return `"${value.replaceAll('"', '""')}"`
}

const csvRow = (fields: readonly (string | number | null)[]): string => fields.map(csvField).join(';') + CRLF

function germanAmount(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

const germanDate = (iso: IsoDate): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`

function xmlEscape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

type ColumnType = 'alpha' | 'numeric0' | 'numeric2' | 'date'
interface ColumnDef { readonly name: string; readonly description: string; readonly type: ColumnType; readonly key?: boolean }

function columnXml(c: ColumnDef): string {
  const tag = c.key === true ? 'VariablePrimaryKey' : 'VariableColumn'
  const type =
    c.type === 'alpha' ? '<AlphaNumeric/>'
      : c.type === 'date' ? '<Date><Format>DD.MM.YYYY</Format></Date>'
        : c.type === 'numeric2' ? '<Numeric><Accuracy>2</Accuracy></Numeric>'
          : '<Numeric/>'
  return `        <${tag}><Name>${c.name}</Name><Description>${xmlEscape(c.description)}</Description>${type}</${tag}>`
}

function tableXml(url: string, name: string, description: string, meta: DataExportMeta, columns: readonly ColumnDef[]): string {
  return [
    '    <Table>',
    `      <URL>${url}</URL>`,
    `      <Name>${xmlEscape(name)}</Name>`,
    `      <Description>${xmlEscape(description)}</Description>`,
    `      <Validity><Range><From>${germanDate(meta.from)}</From><To>${germanDate(meta.to)}</To></Range></Validity>`,
    '      <UTF8/>',
    '      <DecimalSymbol>,</DecimalSymbol>',
    '      <DigitGroupingSymbol>.</DigitGroupingSymbol>',
    '      <VariableLength>',
    '        <ColumnDelimiter>;</ColumnDelimiter>',
    '        <RecordDelimiter>&#13;&#10;</RecordDelimiter>',
    '        <TextEncapsulator>"</TextEncapsulator>',
    ...columns.map(columnXml),
    '      </VariableLength>',
    '    </Table>',
  ].join('\n')
}

const JOURNAL_COLUMNS: readonly ColumnDef[] = [
  { name: 'Buchungsnummer', description: 'Fortlaufende Nummer der Buchung', type: 'numeric0', key: true },
  { name: 'Zeile', description: 'Zeile innerhalb der Buchung', type: 'numeric0', key: true },
  { name: 'Datum', description: 'Buchungsdatum', type: 'date' },
  { name: 'Belegnummer', description: 'Belegnummer', type: 'alpha' },
  { name: 'Belegverweis', description: 'Verweis auf den gespeicherten Beleg', type: 'alpha' },
  { name: 'Buchungstext', description: 'Buchungstext', type: 'alpha' },
  { name: 'Konto', description: 'Kontonummer', type: 'alpha' },
  { name: 'Soll', description: 'Betrag im Soll in Euro', type: 'numeric2' },
  { name: 'Haben', description: 'Betrag im Haben in Euro', type: 'numeric2' },
  { name: 'Steuerschluessel', description: 'Steuerschlüssel der Zeile', type: 'alpha' },
  { name: 'Steueranteil', description: 'Basis oder Steuer', type: 'alpha' },
  { name: 'StornoVon', description: 'Nummer der stornierten Buchung', type: 'numeric0' },
]

const ACCOUNT_COLUMNS: readonly ColumnDef[] = [
  { name: 'Konto', description: 'Kontonummer', type: 'alpha', key: true },
  { name: 'Bezeichnung', description: 'Kontobezeichnung', type: 'alpha' },
  { name: 'Art', description: 'Kontoart', type: 'alpha' },
  { name: 'EUER', description: 'Position der Einnahmenüberschussrechnung', type: 'alpha' },
  { name: 'HGB', description: 'Position nach § 266 oder § 275 HGB', type: 'alpha' },
]

const LOG_COLUMNS: readonly ColumnDef[] = [
  { name: 'LfdNr', description: 'Laufende Nummer im Protokoll', type: 'numeric0', key: true },
  { name: 'Zeitpunkt', description: 'Zeitpunkt der Aufzeichnung (ISO 8601)', type: 'alpha' },
  { name: 'Art', description: 'Art des Vorgangs', type: 'alpha' },
  { name: 'Hash', description: 'SHA-256 über Vorgänger-Hash und Inhalt', type: 'alpha' },
  { name: 'VorgaengerHash', description: 'Hash des vorigen Protokolleintrags', type: 'alpha' },
]

/** The Z3 export (§ 147 Abs. 6 AO) of the entries dated in [from, to], the chart and the log. */
export function gdpduExport(ledger: Ledger, log: readonly LogRecord[], meta: DataExportMeta): DataExport {
  const entries = ledger.entries.filter((e) => e.date >= meta.from && e.date <= meta.to)
  let journal = ''
  for (const e of entries) {
    e.lines.forEach((l, i) => {
      journal += csvRow([
        e.number, i + 1, germanDate(e.date), e.documentNumber, e.receiptRef, e.text, l.account,
        l.side === 'debit' ? germanAmount(l.amount) : null,
        l.side === 'credit' ? germanAmount(l.amount) : null,
        l.taxKey, l.taxPart, e.reversalOf,
      ])
    })
  }
  const used = new Set(entries.flatMap((e) => e.lines.map((l) => l.account)))
  let accounts = ''
  for (const a of chartAccounts(ledger.chart)) {
    if (used.has(a.number)) accounts += csvRow([a.number, a.label, a.kind, a.euer, a.hgb])
  }
  let protocol = ''
  for (const r of log) protocol += csvRow([r.seq, r.at, r.kind, r.hash, r.prevHash])

  const index = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE DataSet SYSTEM "gdpdu-01-09-2004.dtd">',
    '<DataSet>',
    '  <Version>1.0</Version>',
    `  <DataSupplier><Name>${xmlEscape(meta.supplierName)}</Name><Location>${xmlEscape(meta.supplierLocation)}</Location><Comment>${xmlEscape(meta.comment ?? `Kontenrahmen ${ledger.chart}`)}</Comment></DataSupplier>`,
    '  <Media>',
    '    <Name>Datenträger 1</Name>',
    tableXml('buchungen.csv', 'Buchungen', 'Journal: jede Zeile jeder Buchung', meta, JOURNAL_COLUMNS),
    tableXml('konten.csv', 'Konten', `Bebuchte Konten des ${ledger.chart}`, meta, ACCOUNT_COLUMNS),
    tableXml('protokoll.csv', 'Protokoll', 'Unveränderbares Protokoll mit Hash-Kette', meta, LOG_COLUMNS),
    '  </Media>',
    '</DataSet>',
    '',
  ].join('\n')
  return { files: { 'index.xml': index, 'buchungen.csv': journal, 'konten.csv': accounts, 'protokoll.csv': protocol } }
}

// ---------------------------------------------------------------------------------------------------
// Verfahrensdokumentation

export const VERFAHRENSDOKU_PLACEHOLDERS = [
  'unternehmen',
  'inhaber',
  'anschrift',
  'steuernummer',
  'taetigkeit',
  'kontenrahmen',
  'gewinnermittlung',
  'beginn',
  'appVersion',
  'hosting',
  'speicherort',
  'datensicherung',
  'verschluesselung',
  'belegablage',
  'verantwortlich',
  'stand',
] as const

export type VerfahrensdokuPlaceholder = (typeof VERFAHRENSDOKU_PLACEHOLDERS)[number]

const TEMPLATE = `# Verfahrensdokumentation zur Buchführung

Unternehmen: {{unternehmen}}
Inhaberin oder Inhaber: {{inhaber}}
Anschrift: {{anschrift}}
Steuernummer: {{steuernummer}}
Stand: {{stand}}

## 1. Allgemeine Beschreibung

{{unternehmen}} ({{taetigkeit}}) führt die Bücher seit {{beginn}} mit der App SteuerEule in der Version {{appVersion}}. Der Gewinn wird ermittelt durch: {{gewinnermittlung}}. Kontenrahmen: {{kontenrahmen}}. Verantwortlich für die Buchführung ist {{verantwortlich}}.

Diese Dokumentation beschreibt, wie Belege und Buchungen erfasst, verarbeitet, gesichert und aufbewahrt werden. Sie ist eine eigene Beschreibung des Unternehmens; eine Prüfung oder Bescheinigung durch Dritte liegt ihr nicht zugrunde.

## 2. Erfassung

- Belege kommen als Foto, PDF oder Datei in die App ({{belegablage}}). Jeder Beleg erhält eine Belegnummer und wird unverändert gespeichert; die Buchung verweist auf ihn.
- Kontoauszüge werden als Datei (CSV oder CAMT.053) eingelesen. Die App schlägt Buchungen vor; gebucht wird erst, wenn der Nutzer den Vorschlag übernimmt. Bankzugangsdaten speichert die App nicht.
- Jede Buchung hat Datum, Belegnummer, Buchungstext, mindestens zwei Zeilen und gleiche Summen im Soll und Haben. Beträge werden in ganzen Cent gespeichert. Die Umsatzsteuer wird je Steuerschlüssel aus dem Betrag abgeleitet.
- Bei der Einnahmenüberschussrechnung zählt der Tag der Zahlung (§ 11 EStG), regelmäßig wiederkehrende Zahlungen um den Jahreswechsel dem Jahr, zu dem sie gehören.

## 3. Unveränderbarkeit und Nachvollziehbarkeit

- Buchungen werden fortlaufend und lückenlos nummeriert. Eine gespeicherte Buchung wird nicht geändert oder gelöscht; Korrekturen erfolgen durch eine Stornobuchung und eine neue Buchung.
- Jeder Vorgang (Buchung, Festschreibung, Datenexport) wird in einem Protokoll aufgezeichnet, das nur ergänzt werden kann. Jeder Eintrag enthält einen SHA-256-Hash über seinen Inhalt und den Hash des vorigen Eintrags. Eine Prüfung der Kette zeigt, ob und ab welchem Eintrag etwas verändert wurde.
- Abgeschlossene Zeiträume werden festgeschrieben. In einen festgeschriebenen Zeitraum kann nicht mehr gebucht werden; die Festschreibung lässt sich nicht zurücknehmen.

## 4. Speicherung, Sicherung und Zugriff

- Die Daten liegen bei {{hosting}} in {{speicherort}}. Sie sind nutzergebunden gespeichert; personenbezogene und steuerliche Inhalte sind verschlüsselt ({{verschluesselung}}).
- Datensicherung: {{datensicherung}}.
- Zugriff hat nur der angemeldete Nutzer.

## 5. Aufbewahrung

- Bücher, Jahresabschlüsse, Eröffnungsbilanzen und diese Dokumentation werden zehn Jahre aufbewahrt, Buchungsbelege acht Jahre, Handels- und Geschäftsbriefe sechs Jahre (§ 147 Abs. 3 AO), jeweils ab dem Ende des Kalenderjahres ihrer Entstehung und nicht, solange die Festsetzungsfrist noch läuft.

## 6. Datenzugriff der Finanzverwaltung

- Für eine Außenprüfung stellt die App die Buchungen, Konten und das Protokoll als Datenträgerüberlassung im Beschreibungsstandard der Finanzverwaltung bereit (index.xml mit CSV-Dateien).

## 7. Internes Kontrollsystem

- Die App lehnt Buchungen ab, die nicht ausgeglichen sind, kein gültiges Datum oder keine Belegnummer haben oder in einen festgeschriebenen Zeitraum fallen.
- Die Prüfung der Protokollkette und der Nummernfolge kann jederzeit ausgeführt werden.

## 8. Änderungen dieser Dokumentation

Änderungen an Verfahren oder App werden mit Datum in einer neuen Fassung dieser Dokumentation festgehalten; ältere Fassungen werden aufbewahrt.
`

export interface VerfahrensdokuResult {
  readonly text: string
  /** Placeholders without a value: they stay visible as `[[Platzhalter: …]]` in the text. */
  readonly missing: readonly VerfahrensdokuPlaceholder[]
}

export function verfahrensdokumentation(values: Partial<Record<VerfahrensdokuPlaceholder, string>>): VerfahrensdokuResult {
  const missing = VERFAHRENSDOKU_PLACEHOLDERS.filter((p) => (values[p] ?? '').trim() === '')
  const text = TEMPLATE.replaceAll(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = values[name as VerfahrensdokuPlaceholder]?.trim()
    return value === undefined || value === '' ? `[[Platzhalter: ${name}]]` : value
  })
  return { text, missing }
}

/** The fiscal years that have at least one entry: what a Z3 export can be asked for. */
export function bookedYears(ledger: Ledger): readonly number[] {
  return [...new Set(ledger.entries.map((e) => yearOf(e.date)))].sort((a, b) => a - b)
}

/** Every account referenced by an entry must exist in the ledger's chart (a guard for imported data). */
export function unknownAccounts(ledger: Ledger): readonly string[] {
  return [...new Set(ledger.entries.flatMap((e) => e.lines.map((l) => l.account)))].filter((n) => findAccount(ledger.chart, n) === null)
}
