import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BANK_CSV_PRESETS,
  BankImportError,
  dedupeTransactions,
  draftFromTransaction,
  matchOpenItems,
  parseAmountToCents,
  parseBankCsv,
  parseBankDate,
  parseCamt053,
  parseCsvRows,
  suggestBooking,
  withFingerprints,
  type BankTransaction,
  type BookingRule,
} from './bank-import'
import { createLedger, postEntry } from './journal'

// ADR-0101 §14 — statements as files. Every fixture is synthetic: invented names, example IBANs.

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixture = (name: string): string => fs.readFileSync(path.join(dir, name), 'utf8')

describe('parseCamt053', () => {
  const txs = parseCamt053(fixture('camt053-synthetic.xml'))

  it('reads booked entries, skips pending ones and splits batches', () => {
    expect(txs.map((t) => [t.bookingDate, t.amount, t.counterpartyName])).toEqual([
      ['2025-03-03', 119_000, 'Beispiel Kunde GmbH'],
      ['2025-03-05', -5_950, 'Funknetz & Co. AG'],
      ['2025-03-10', -10_000, 'Lieferant Eins'],
      ['2025-03-10', -20_000, 'Lieferant Zwei'],
      ['2025-03-31', -500, null],
    ])
  })

  it('takes IBANs, references and the counterparty of the right side', () => {
    expect(txs[0]).toEqual({
      accountIban: 'DE89370400440532013000', bookingDate: '2025-03-03', valueDate: '2025-03-03', amount: 119_000, currency: 'EUR',
      counterpartyName: 'Beispiel Kunde GmbH', counterpartyIban: 'DE02100100109307118603', reference: 'Rechnung RE-2025-017',
      endToEndId: 'RE-2025-017', bankReference: 'BANKREF-1',
    })
    expect(txs[1]).toMatchObject({ counterpartyIban: 'DE75512108001245126199', reference: 'Kundennr 4711 Rechnung Maerz', endToEndId: null })
    expect(txs[4]).toMatchObject({ reference: 'Kontoführung', valueDate: null })
  })

  it('refuses DTDs, entities and files that are not CAMT.053', () => {
    const xxe = '<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><Document>&x;</Document>'
    expect(() => parseCamt053(xxe)).toThrow(BankImportError)
    expect(() => parseCamt053('<Document><Other/></Document>')).toThrow(/BkToCstmrStmt/)
    expect(() => parseCamt053('<Document><BkToCstmrStmt>')).toThrow(BankImportError)
    expect(() => parseCamt053('<Document><BkToCstmrStmt><Stmt><Ntry><Amt>1.00</Amt></Ntry></Stmt></BkToCstmrStmt></Document>')).toThrow(/Buchungsdatum/)
  })
})

describe('parseBankCsv presets', () => {
  it('Sparkasse (CSV-CAMT V2)', () => {
    const txs = parseBankCsv(fixture('sparkasse-csv-camt-v2.csv'), BANK_CSV_PRESETS.sparkasse)
    expect(txs).toHaveLength(4)
    expect(txs[0]).toEqual({
      accountIban: 'DE89370400440532013000', bookingDate: '2025-03-03', valueDate: '2025-03-03', amount: 119_000, currency: 'EUR',
      counterpartyName: 'Beispiel Kunde GmbH', counterpartyIban: 'DE02100100109307118603', reference: 'Rechnung RE-2025-017',
      endToEndId: 'RE-2025-017', bankReference: null,
    })
    expect(txs[1]).toMatchObject({ amount: -5_950, reference: 'Kundennr 4711; Rechnung Maerz', endToEndId: null })
  })

  it('ING (preamble, repeated „Währung“ header)', () => {
    const txs = parseBankCsv(fixture('ing.csv'), BANK_CSV_PRESETS.ing)
    expect(txs.map((t) => [t.bookingDate, t.amount, t.counterpartyName, t.reference, t.currency])).toEqual([
      ['2025-03-31', 238_000, 'Beispiel Kunde GmbH', 'Rechnung RE-2025-021', 'EUR'],
      ['2025-03-12', -123_456, 'Bürobedarf Muster KG', 'Bestellung 99; Kunde 12', 'EUR'],
    ])
  })

  it('DKB (payer and payee in separate columns)', () => {
    const txs = parseBankCsv(fixture('dkb.csv'), BANK_CSV_PRESETS.dkb)
    expect(txs.map((t) => [t.bookingDate, t.amount, t.counterpartyName, t.counterpartyIban])).toEqual([
      ['2025-03-20', 59_500, 'Beispiel Kunde GmbH', 'DE02100100109307118603'],
      ['2025-03-21', -23_800, 'Coworking Space GmbH', 'DE75512108001245126199'],
    ])
  })

  it('Commerzbank (no counterparty column)', () => {
    const txs = parseBankCsv(fixture('commerzbank.csv'), BANK_CSV_PRESETS.commerzbank)
    expect(txs.map((t) => [t.bookingDate, t.amount, t.counterpartyName, t.accountIban])).toEqual([
      ['2025-03-28', 71_400, null, 'DE89370400440532013000'],
      ['2025-03-29', -42_000, null, 'DE89370400440532013000'],
    ])
  })

  it('a custom mapping with separate debit and credit columns', () => {
    const csv = 'Datum,Soll,Haben,Name,Text1,Text2\n2025-04-01,12.50,,Shop,Order,7\n2025-04-02,,1000.00,Client,Inv,8\n'
    const txs = parseBankCsv(csv, {
      delimiter: ',', decimal: '.', dateFormat: 'YYYY-MM-DD', bookingDate: 'Datum',
      amount: { debit: 'Soll', credit: 'Haben' }, counterpartyName: 'Name', reference: ['Text1', 'Text2'],
    })
    expect(txs.map((t) => [t.amount, t.reference, t.currency])).toEqual([[-1_250, 'Order 7', 'EUR'], [100_000, 'Inv 8', 'EUR']])
  })

  it('names what is missing', () => {
    expect(() => parseBankCsv('a;b\n1;2', BANK_CSV_PRESETS.ing)).toThrow(/Kopfzeile/)
    expect(() => parseBankCsv('Buchung;Valuta\n01.01.2025;01.01.2025', BANK_CSV_PRESETS.ing)).toThrow(/Spalte „Betrag“/)
  })
})

describe('parsing primitives', () => {
  it('reads amounts exactly in cents', () => {
    expect(parseAmountToCents('1.234,56', ',')).toBe(123_456)
    expect(parseAmountToCents('-0,1', ',')).toBe(-10)
    expect(parseAmountToCents('12,30-', ',')).toBe(-1_230)
    expect(parseAmountToCents('+1,234.5 EUR', '.')).toBe(123_450)
    expect(parseAmountToCents('595 €', ',')).toBe(59_500)
    expect(() => parseAmountToCents('1,234', ',')).toThrow(BankImportError)
    expect(() => parseAmountToCents('abc', ',')).toThrow(BankImportError)
  })

  it('reads dates and rejects impossible ones', () => {
    expect(parseBankDate('05.03.25', 'DD.MM.YY')).toBe('2025-03-05')
    expect(parseBankDate('2025-03-05T10:00', 'YYYY-MM-DD')).toBe('2025-03-05')
    expect(() => parseBankDate('31.02.2025', 'DD.MM.YYYY')).toThrow(BankImportError)
    expect(() => parseBankDate('2025/03/05', 'YYYY-MM-DD')).toThrow(BankImportError)
  })

  it('splits CSV with quotes, doubled quotes and line breaks in fields', () => {
    expect(parseCsvRows('﻿a;"b;c";"say ""hi"""\r\n"multi\nline";2\n\n', ';')).toEqual([['a', 'b;c', 'say "hi"'], ['multi\nline', '2']])
  })
})

describe('fingerprints and dedupe', () => {
  it('is stable across imports and keeps two identical bookings of one day apart', () => {
    const first = withFingerprints(parseBankCsv(fixture('sparkasse-csv-camt-v2.csv'), BANK_CSV_PRESETS.sparkasse))
    const again = withFingerprints(parseBankCsv(fixture('sparkasse-csv-camt-v2.csv'), BANK_CSV_PRESETS.sparkasse))
    expect(again.map((t) => t.fingerprint)).toEqual(first.map((t) => t.fingerprint))
    expect(new Set(first.map((t) => t.fingerprint)).size).toBe(4) // the two equal coffees stay two
    const known = new Set(first.slice(0, 2).map((t) => t.fingerprint))
    const { fresh, duplicates } = dedupeTransactions(known, again)
    expect(duplicates).toHaveLength(2)
    expect(fresh.map((t) => t.amount)).toEqual([-320, -320])
  })
})

describe('booking suggestions', () => {
  const base: BankTransaction = {
    accountIban: null, bookingDate: '2025-03-05', valueDate: null, amount: -5_950, currency: 'EUR',
    counterpartyName: 'Funknetz AG', counterpartyIban: 'DE75512108001245126199', reference: 'Rechnung Maerz', endToEndId: null, bankReference: null,
  }
  const rules: readonly BookingRule[] = [
    { id: 'any-invoice', referenceContains: 'rechnung', account: '4900', taxKey: 'vst19' },
    { id: 'phone-name', counterpartyNameContains: 'funknetz', account: '4920', taxKey: 'vst19', text: 'Telefon' },
    { id: 'phone-iban', counterpartyIban: 'DE75 5121 0800 1245 1261 99', direction: 'out', account: '4925', taxKey: 'vst19' },
    { id: 'broken', account: '4900', taxKey: 'none' },
  ]

  it('takes the most specific rule: IBAN over name over reference', () => {
    expect(suggestBooking(base, rules)?.ruleId).toBe('phone-iban')
    expect(suggestBooking({ ...base, counterpartyIban: null }, rules)).toEqual({ ruleId: 'phone-name', account: '4920', taxKey: 'vst19', text: 'Telefon' })
    expect(suggestBooking({ ...base, counterpartyIban: null, counterpartyName: 'X' }, rules)?.ruleId).toBe('any-invoice')
    expect(suggestBooking({ ...base, amount: 5_950, counterpartyName: null, counterpartyIban: null, reference: '' }, rules)).toBeNull()
    expect(suggestBooking({ ...base, amount: 5_950 }, rules)?.ruleId).toBe('phone-name') // direction rules out the IBAN rule
  })

  it('becomes a balanced draft only when taken over', () => {
    const suggestion = suggestBooking(base, rules)!
    const draft = draftFromTransaction(base, '1200', suggestion, 'BK-1')
    const { entry } = postEntry(createLedger('SKR03', 'euer'), draft)
    expect(entry.lines.map((l) => [l.account, l.side, l.amount])).toEqual([['4925', 'debit', 5_000], ['1576', 'debit', 950], ['1200', 'credit', 5_950]])
    const incoming = draftFromTransaction({ ...base, amount: 11_900 }, '1200', { ruleId: 'x', account: '8400', taxKey: 'ust19', text: 'Honorar' }, 'BK-2', 'beleg-1')
    expect(incoming.lines[0]).toEqual({ account: '1200', side: 'debit', amount: 11_900 })
    expect(incoming.receiptRef).toBe('beleg-1')
  })
})

describe('matchOpenItems', () => {
  const tx: BankTransaction = {
    accountIban: null, bookingDate: '2025-03-20', valueDate: null, amount: 59_500, currency: 'EUR',
    counterpartyName: 'Beispiel Kunde GmbH', counterpartyIban: null, reference: 'RE 2025-019', endToEndId: null, bankReference: null,
  }

  it('needs the exact amount within the date window and prefers the quoted invoice', () => {
    const matches = matchOpenItems(tx, [
      { id: 'a', amount: 59_500, date: '2025-03-01', dueDate: '2025-03-15' },
      { id: 'b', amount: 59_500, date: '2025-03-05', reference: 'RE-2025-019', counterpartyName: 'Beispiel Kunde' },
      { id: 'c', amount: 59_400, date: '2025-03-05' },
      { id: 'd', amount: 59_500, date: '2024-12-01' },
      { id: 'e', amount: 59_500, date: '2025-04-01' },
    ])
    expect(matches.map((m) => m.item.id)).toEqual(['b', 'a'])
    expect(matches[0]!.reasons).toEqual(['amount', 'date', 'reference', 'counterparty'])
    expect(matchOpenItems(tx, [{ id: 'a', amount: 59_500, date: '2025-01-01' }], 90)).toHaveLength(1)
  })
})
