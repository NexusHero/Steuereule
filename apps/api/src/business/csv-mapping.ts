import { parseCsvRows, type CsvColumn, type CsvMapping } from '@steuereule/core'
import { InvalidInputError } from '../common/domain-error.js'
import type { CsvColumnDto, CsvMappingDto } from './dto/business-results.dto.js'

/**
 * The app's column mapping as the core takes it. A column given by position is read off the header row
 * (the first row of the file) and becomes a header name, with `nth` for a header that repeats, because the
 * core reads columns by their header (it finds the header row itself, also below a bank's preamble).
 */
export function toCoreMapping(dto: CsvMappingDto, content: string): CsvMapping {
  let header: string[] | null = null
  const column = (c: CsvColumnDto, field: string): CsvColumn => {
    if (c.name !== undefined && c.name.trim() !== '') return c.nth !== undefined && c.nth > 1 ? { name: c.name, nth: c.nth } : c.name
    if (c.index === undefined) throw new InvalidInputError('BANK_MAPPING_COLUMN', `Für „${field}“ fehlt der Spaltenname oder die Spaltennummer.`)
    header ??= parseCsvRows(content, dto.delimiter)[0] ?? []
    const name = header[c.index]?.trim()
    if (!name) throw new InvalidInputError('BANK_MAPPING_COLUMN', `Die Datei hat keine Spalte ${c.index + 1} (für „${field}“).`)
    const nth = header.slice(0, c.index + 1).filter((h) => h.trim() === name).length
    return nth > 1 ? { name, nth } : name
  }
  const optional = (c: CsvColumnDto | undefined, field: string) => (c === undefined ? undefined : column(c, field))
  let amount: CsvMapping['amount']
  if (dto.amount !== undefined) amount = column(dto.amount, 'Betrag')
  else if (dto.debit !== undefined && dto.credit !== undefined) amount = { debit: column(dto.debit, 'Soll'), credit: column(dto.credit, 'Haben') }
  else throw new InvalidInputError('BANK_MAPPING_AMOUNT', 'Für den Betrag eine Spalte wählen, oder je eine für Soll und Haben.')
  if (dto.reference.length === 0) throw new InvalidInputError('BANK_MAPPING_REFERENCE', 'Für den Verwendungszweck mindestens eine Spalte wählen.')
  const entries = {
    delimiter: dto.delimiter,
    decimal: dto.decimal,
    dateFormat: dto.dateFormat,
    bookingDate: column(dto.bookingDate, 'Buchungstag'),
    valueDate: optional(dto.valueDate, 'Valuta'),
    amount,
    counterpartyName: optional(dto.counterpartyName, 'Name'),
    counterpartyIban: optional(dto.counterpartyIban, 'IBAN'),
    reference: dto.reference.length === 1 ? column(dto.reference[0]!, 'Verwendungszweck') : dto.reference.map((r) => column(r, 'Verwendungszweck')),
    currency: optional(dto.currency, 'Währung'),
    endToEndId: optional(dto.endToEndId, 'Kundenreferenz'),
    accountIban: optional(dto.accountIban, 'Auftragskonto'),
    defaultCurrency: dto.defaultCurrency,
  }
  return Object.fromEntries(Object.entries(entries).filter(([, v]) => v !== undefined)) as unknown as CsvMapping
}
