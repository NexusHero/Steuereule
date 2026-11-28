// An E-Rechnung (ADR-0101 §22, § 14 Abs. 1 UStG from 2025): XRechnung in UBL or CII syntax, or the CII
// XML a ZUGFeRD PDF carries. Read from its structure, never guessed from text; the strict XML reader
// refuses DTDs and entities. Sources: docs/research/self-employed-extension.html §8.
import { at, childrenNamed, parseXml, textAt, XmlError, type XmlElement } from '../domains/ledger/xml'
import type { BusinessReceiptRead } from './business-receipt'

export interface EInvoiceRead {
  readonly ok: true
  readonly syntax: 'ubl' | 'cii'
  /**
   * Whether the file is an E-Rechnung in the sense of § 14 Abs. 1 Satz 6 UStG: EN 16931 conformant. A
   * ZUGFeRD MINIMUM or BASIC-WL profile is not (Abschn. 14.1 Abs. 12 UStAE); it counts as sonstige Rechnung.
   */
  readonly validEInvoice: boolean
  readonly read: BusinessReceiptRead
  readonly seller: string | null
  readonly sellerVatId: string | null
  readonly netCents: number | null
  readonly vatCents: number | null
}

const ROOT = /<(?:[A-Za-z][\w.-]*:)?(Invoice|CreditNote|CrossIndustryInvoice)[\s>]/

/** Cheap check before parsing: an XML document whose root is an invoice. */
export function looksLikeEInvoice(text: string): boolean {
  const head = text.trimStart().slice(0, 4096)
  return head.startsWith('<') && ROOT.test(head)
}

const cents = (raw: string | null): number | null => {
  if (raw === null) return null
  const n = Number(raw.trim())
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

const rateOf = (raw: string | null): 19 | 7 | 0 | null => {
  if (raw === null) return null
  const n = Number(raw.trim())
  return n === 19 || n === 7 || n === 0 ? n : null
}

/** One rate when every tax subtotal has the same; a mixed invoice gives null and the user splits it. */
const singleRate = (rates: readonly (19 | 7 | 0 | null)[]): 19 | 7 | 0 | null => {
  const distinct = [...new Set(rates)]
  return distinct.length === 1 ? (distinct[0] ?? null) : null
}

function ubl(root: XmlElement): EInvoiceRead {
  const subtotals = childrenNamed(at(root, 'TaxTotal') ?? root, 'TaxSubtotal')
  const firstLine = root.children.find((c) => c.name === 'InvoiceLine' || c.name === 'CreditNoteLine') ?? null
  const customization = textAt(root, 'CustomizationID') ?? ''
  return {
    ok: true,
    syntax: 'ubl',
    validEInvoice: /en16931/i.test(customization),
    read: {
      grossCents: cents(textAt(root, 'LegalMonetaryTotal/PayableAmount') ?? textAt(root, 'LegalMonetaryTotal/TaxInclusiveAmount')),
      vatRate: singleRate(subtotals.map((s) => rateOf(textAt(s, 'TaxCategory/Percent')))),
      date: textAt(root, 'IssueDate'),
      invoiceNumber: textAt(root, 'ID'),
      description: textAt(firstLine, 'Item/Name') ?? textAt(root, 'AccountingSupplierParty/Party/PartyName/Name') ?? 'E-Rechnung',
    },
    seller: textAt(root, 'AccountingSupplierParty/Party/PartyName/Name') ?? textAt(root, 'AccountingSupplierParty/Party/PartyLegalEntity/RegistrationName'),
    sellerVatId: textAt(root, 'AccountingSupplierParty/Party/PartyTaxScheme/CompanyID'),
    netCents: cents(textAt(root, 'LegalMonetaryTotal/TaxExclusiveAmount')),
    vatCents: cents(textAt(root, 'TaxTotal/TaxAmount')),
  }
}

function cii(root: XmlElement): EInvoiceRead {
  const trade = at(root, 'SupplyChainTradeTransaction')
  const settlement = at(trade, 'ApplicableHeaderTradeSettlement')
  const sum = at(settlement, 'SpecifiedTradeSettlementHeaderMonetarySummation')
  const seller = at(trade, 'ApplicableHeaderTradeAgreement/SellerTradeParty')
  const guideline = textAt(root, 'ExchangedDocumentContext/GuidelineSpecifiedDocumentContextParameter/ID') ?? ''
  const raw = textAt(root, 'ExchangedDocument/IssueDateTime/DateTimeString')
  const date = raw !== null && /^\d{8}$/.test(raw.trim()) ? `${raw.trim().slice(0, 4)}-${raw.trim().slice(4, 6)}-${raw.trim().slice(6, 8)}` : null
  const vatId = seller === null ? null : (childrenNamed(seller, 'SpecifiedTaxRegistration').map((r) => at(r, 'ID')).find((id) => id !== null && id.attrs.schemeID === 'VA')?.text ?? null)
  const items = trade === null ? [] : childrenNamed(trade, 'IncludedSupplyChainTradeLineItem')
  return {
    ok: true,
    syntax: 'cii',
    // MINIMUM and BASIC-WL carry no line items and are no E-Rechnung (Abschn. 14.1 Abs. 12 UStAE).
    validEInvoice: !/minimum|basicwl/i.test(guideline),
    read: {
      grossCents: cents(textAt(sum, 'DuePayableAmount') ?? textAt(sum, 'GrandTotalAmount')),
      vatRate: singleRate((settlement === null ? [] : childrenNamed(settlement, 'ApplicableTradeTax')).map((t) => rateOf(textAt(t, 'RateApplicablePercent')))),
      date,
      invoiceNumber: textAt(root, 'ExchangedDocument/ID'),
      description: textAt(items[0] ?? null, 'SpecifiedTradeProduct/Name') ?? textAt(seller, 'Name') ?? 'E-Rechnung',
    },
    seller: textAt(seller, 'Name'),
    sellerVatId: vatId,
    netCents: cents(textAt(sum, 'TaxBasisTotalAmount')),
    vatCents: cents(textAt(sum, 'TaxTotalAmount')),
  }
}

/** Reads an E-Rechnung; `ok: false` with the reason for anything that is no readable invoice. */
export function readEInvoice(xml: string): EInvoiceRead | { readonly ok: false; readonly reason: string } {
  if (!looksLikeEInvoice(xml)) return { ok: false, reason: 'Das ist keine E-Rechnung (XRechnung oder ZUGFeRD).' }
  let root: XmlElement
  try {
    root = parseXml(xml)
  } catch (error) {
    return { ok: false, reason: error instanceof XmlError ? `Die E-Rechnung ließ sich nicht lesen: ${error.message}` : 'Die E-Rechnung ließ sich nicht lesen.' }
  }
  if (root.name === 'Invoice' || root.name === 'CreditNote') return ubl(root)
  if (root.name === 'CrossIndustryInvoice') return cii(root)
  return { ok: false, reason: 'Das ist keine E-Rechnung (XRechnung oder ZUGFeRD).' }
}
