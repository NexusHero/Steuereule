import { describe, expect, it } from 'vitest'
import {
  appendLogRecord,
  bookedYears,
  canonicalJson,
  checkNumbering,
  entriesDifferingFromLog,
  GENESIS_HASH,
  gdpduExport,
  isLocked,
  lockPeriod,
  retentionPeriod,
  unknownAccounts,
  VERFAHRENSDOKU_PLACEHOLDERS,
  verfahrensdokumentation,
  verifyLog,
  type LogRecord,
} from './gobd'
import { createLedger, LedgerError, postEntry, reverseEntry, type JournalEntry, type Ledger } from './journal'
import { childrenNamed, parseXml, textAt } from './xml'

// ADR-0101 §13 — GoBD: Festschreibung, a hash-chained append-only log, gapless numbers, retention,
// the Z3 export and the Verfahrensdokumentation.

function sampleLedger(): { ledger: Ledger; log: readonly LogRecord[] } {
  let ledger = createLedger('SKR03', 'euer')
  let log: readonly LogRecord[] = []
  const post = (date: string, doc: string, amount: number): void => {
    const r = postEntry(ledger, {
      date, documentNumber: doc, receiptRef: `beleg/${doc}.pdf`, text: `Honorar "${doc}"`,
      lines: [{ account: '1200', side: 'debit', amount }, { account: '8400', side: 'credit', amount, taxKey: 'ust19' }],
    })
    ledger = r.ledger
    log = appendLogRecord(log, 'entry', r.entry, `${date}T10:00:00Z`)
  }
  post('2025-01-10', 'AR-1', 11_900)
  post('2025-02-10', 'AR-2', 23_800)
  post('2025-03-10', 'AR-3', 5_950)
  const storno = reverseEntry(ledger, 2, { date: '2025-03-11', documentNumber: 'ST-1' })
  ledger = storno.ledger
  log = appendLogRecord(log, 'entry', storno.entry, '2025-03-11T10:00:00Z')
  ledger = lockPeriod(ledger, '2025-03-31')
  log = appendLogRecord(log, 'lock', { through: '2025-03-31' }, '2025-04-01T08:00:00Z')
  return { ledger, log }
}

describe('Festschreibung', () => {
  it('rejects writes into a closed period and only moves forward', () => {
    const { ledger } = sampleLedger()
    expect(isLocked(ledger, '2025-03-31')).toBe(true)
    expect(isLocked(ledger, '2025-04-01')).toBe(false)
    expect(() => postEntry(ledger, { date: '2025-03-15', documentNumber: 'X', text: '', lines: [{ account: '1200', side: 'debit', amount: 1 }, { account: '8400', side: 'credit', amount: 1 }] })).toThrow(LedgerError)
    expect(() => lockPeriod(ledger, '2025-02-28')).toThrow(LedgerError)
    expect(() => lockPeriod(ledger, '31.03.2025')).toThrow(LedgerError)
    expect(lockPeriod(ledger, '2025-06-30').lockedThrough).toBe('2025-06-30')
  })
})

describe('hash-chained log', () => {
  it('verifies an untouched chain', () => {
    const { log } = sampleLedger()
    const result = verifyLog(log)
    expect(result).toEqual({ ok: true, count: 5, headHash: log[4]!.hash })
    expect(log[0]!.prevHash).toBe(GENESIS_HASH)
    expect(log[1]!.prevHash).toBe(log[0]!.hash)
    expect(log[0]!.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('finds the first record whose content was changed', () => {
    const { log } = sampleLedger()
    const tampered = log.map((r) => (r.seq === 3 ? { ...r, payload: { ...(r.payload as JournalEntry), text: 'geändert' } } : r))
    expect(verifyLog(tampered)).toEqual({ ok: false, firstBadSeq: 3, reason: 'content' })
  })

  it('finds a record whose hash was recomputed but no longer links', () => {
    const { log } = sampleLedger()
    // An attacker rewrites record 2 and its hash: record 3 still points at the old hash.
    const rewritten = appendLogRecord(log.slice(0, 1), 'entry', { forged: true }, '2025-02-10T10:00:00Z')
    const tampered = [...rewritten, ...log.slice(2)]
    expect(verifyLog(tampered)).toEqual({ ok: false, firstBadSeq: 3, reason: 'chain' })
  })

  it('finds a deleted record', () => {
    const { log } = sampleLedger()
    expect(verifyLog([log[0]!, log[2]!, log[3]!])).toEqual({ ok: false, firstBadSeq: 2, reason: 'sequence' })
  })

  it('finds entries in the table that differ from the log', () => {
    const { ledger, log } = sampleLedger()
    expect(entriesDifferingFromLog(ledger.entries, log)).toEqual([])
    const edited = ledger.entries.map((e) => (e.number === 1 ? { ...e, date: '2025-01-11' } : e))
    expect(entriesDifferingFromLog(edited, log)).toEqual([1])
    expect(entriesDifferingFromLog(ledger.entries, log.slice(0, 2))).toEqual([3, 4])
  })

  it('canonicalises key order and refuses non-finite numbers', () => {
    expect(canonicalJson({ b: 1, a: [true, null, 'x'], c: undefined })).toBe('{"a":[true,null,"x"],"b":1}')
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(TypeError)
  })
})

describe('checkNumbering', () => {
  it('finds gaps and repeats', () => {
    const { ledger } = sampleLedger()
    expect(checkNumbering(ledger.entries)).toEqual({ missing: [], duplicates: [] })
    const broken = [ledger.entries[0]!, ledger.entries[2]!, ledger.entries[2]!]
    expect(checkNumbering(broken)).toEqual({ missing: [2], duplicates: [3] })
  })
})

describe('retentionPeriod (§ 147 AO)', () => {
  it('keeps books ten years from the end of the year', () => {
    expect(retentionPeriod('buecher', 2025)).toMatchObject({ years: 10, retainThrough: '2035-12-31' })
  })

  it('keeps Buchungsbelege eight years since BEG IV, also older ones still running on 1.1.2025', () => {
    expect(retentionPeriod('buchungsbelege', 2025)).toMatchObject({ years: 8, retainThrough: '2033-12-31' })
    expect(retentionPeriod('buchungsbelege', 2017)).toMatchObject({ years: 8, retainThrough: '2025-12-31' })
    // A Beleg of 2015 ran until 2025 under the old law; under the new one it may go from 1.1.2025.
    expect(retentionPeriod('buchungsbelege', 2015)).toMatchObject({ years: 8, retainThrough: '2024-12-31' })
    expect(retentionPeriod('buchungsbelege', 2013)).toMatchObject({ years: 10, retainThrough: '2023-12-31' })
  })

  it('keeps letters six years, and never ends while the assessment is open', () => {
    expect(retentionPeriod('handelsbriefe', 2025)).toMatchObject({ years: 6, retainThrough: '2031-12-31', extendedWhileAssessmentOpen: true })
    expect(retentionPeriod('sonstige', 2024).retainThrough).toBe('2030-12-31')
  })
})

describe('gdpduExport (Z3)', () => {
  it('writes an index.xml in the Beschreibungsstandard and CSV tables it describes', () => {
    const { ledger, log } = sampleLedger()
    const { files } = gdpduExport(ledger, log, { supplierName: 'Muster Design', supplierLocation: 'Köln', from: '2025-01-01', to: '2025-12-31' })
    expect(Object.keys(files).sort()).toEqual(['buchungen.csv', 'index.xml', 'konten.csv', 'protokoll.csv'])
    expect(files['index.xml']).toContain('<!DOCTYPE DataSet SYSTEM "gdpdu-01-09-2004.dtd">')
    const index = parseXml(files['index.xml']!.replace(/<!DOCTYPE[^>]*>/, ''))
    expect(index.name).toBe('DataSet')
    expect(textAt(index, 'DataSupplier/Name')).toBe('Muster Design')
    const tables = childrenNamed(childrenNamed(index, 'Media')[0]!, 'Table')
    expect(tables.map((t) => textAt(t, 'URL'))).toEqual(['buchungen.csv', 'konten.csv', 'protokoll.csv'])
    for (const table of tables) {
      const layout = childrenNamed(table, 'VariableLength')[0]!
      const columns = layout.children.filter((c) => c.name === 'VariablePrimaryKey' || c.name === 'VariableColumn')
      const csv = files[textAt(table, 'URL')!]!
      const firstRow = csv.split('\r\n')[0]!
      expect(firstRow.split(';')).toHaveLength(columns.length)
      expect(textAt(table, 'Validity/Range/From')).toBe('01.01.2025')
      expect(textAt(layout, 'ColumnDelimiter')).toBe(';')
    }
    // 4 entries × 3 lines; quotes inside text are doubled.
    const rows = files['buchungen.csv']!.split('\r\n').filter((r) => r !== '')
    expect(rows).toHaveLength(12)
    expect(rows[0]).toBe('1;1;"10.01.2025";"AR-1";"beleg/AR-1.pdf";"Honorar ""AR-1""";"1200";"119,00";;"none";;')
    expect(rows[9]!.endsWith(';2')).toBe(true) // the Storno names the entry it reverses
    expect(files['konten.csv']).toContain('"8400";"Umsätze 19 %";"revenue";"einnahmen_umsatzsteuerpflichtig";"GuV.1"')
    expect(files['protokoll.csv']!.split('\r\n').filter((r) => r !== '')).toHaveLength(5)
  })

  it('exports only the requested period', () => {
    const { ledger, log } = sampleLedger()
    const { files } = gdpduExport(ledger, log, { supplierName: 'A & B', supplierLocation: 'X', from: '2025-02-01', to: '2025-02-28', comment: 'Teil' })
    expect(files['buchungen.csv']!.split('\r\n').filter((r) => r !== '')).toHaveLength(3)
    expect(files['index.xml']).toContain('<Name>A &amp; B</Name>')
  })
})

describe('verfahrensdokumentation', () => {
  it('fills placeholders and lists the ones still missing', () => {
    const result = verfahrensdokumentation({ unternehmen: 'Muster Design', kontenrahmen: 'SKR03', stand: '19.11.2026' })
    expect(result.text).toContain('Unternehmen: Muster Design')
    expect(result.text).toContain('Kontenrahmen: SKR03')
    expect(result.text).toContain('[[Platzhalter: steuernummer]]')
    expect(result.missing).toEqual(VERFAHRENSDOKU_PLACEHOLDERS.filter((p) => !['unternehmen', 'kontenrahmen', 'stand'].includes(p)))
  })

  it('never claims a certification', () => {
    const all = Object.fromEntries(VERFAHRENSDOKU_PLACEHOLDERS.map((p) => [p, 'x']))
    const { text, missing } = verfahrensdokumentation(all)
    expect(missing).toEqual([])
    expect(text).not.toMatch(/zertifiziert|testiert|GoBD-konform/i)
    expect(text).toContain('eine Prüfung oder Bescheinigung durch Dritte liegt ihr nicht zugrunde')
  })
})

describe('helpers', () => {
  it('lists booked years and unknown accounts', () => {
    const { ledger } = sampleLedger()
    expect(bookedYears(ledger)).toEqual([2025])
    expect(unknownAccounts(ledger)).toEqual([])
    const imported: Ledger = { ...ledger, entries: [{ ...ledger.entries[0]!, lines: [{ ...ledger.entries[0]!.lines[0]!, account: '7777' }] }] }
    expect(unknownAccounts(imported)).toEqual(['7777'])
  })
})
