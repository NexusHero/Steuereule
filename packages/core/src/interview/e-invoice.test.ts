import { describe, expect, it } from 'vitest'
import { readEInvoice, looksLikeEInvoice } from './e-invoice'
import { readBusinessReceipt } from './business-receipt'

// Synthetic, shortened to the fields the reader takes (EN 16931 business terms in the comments).
const UBL = `<?xml version="1.0" encoding="UTF-8"?>
<ubl:Invoice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ID>RE-2025-0815</cbc:ID>
  <cbc:IssueDate>2025-03-14</cbc:IssueDate>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>Büro Bedarf GmbH</cbc:Name></cac:PartyName>
    <cac:PartyTaxScheme><cbc:CompanyID>DE123456789</cbc:CompanyID></cac:PartyTaxScheme></cac:Party></cac:AccountingSupplierParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38.00</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">200.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">38.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount currencyID="EUR">200.00</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">238.00</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">238.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cac:Item><cbc:Name>Druckerpapier A4</cbc:Name></cac:Item></cac:InvoiceLine>
</ubl:Invoice>`

const CII = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument><ram:ID>4711</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">20250402</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:IncludedSupplyChainTradeLineItem><ram:SpecifiedTradeProduct><ram:Name>Fachbuch Steuerrecht</ram:Name></ram:SpecifiedTradeProduct></ram:IncludedSupplyChainTradeLineItem>
    <ram:ApplicableHeaderTradeAgreement><ram:SellerTradeParty><ram:Name>Verlag Beispiel</ram:Name><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">DE987654321</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTradeParty></ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:ApplicableTradeTax><ram:CalculatedAmount>3.50</ram:CalculatedAmount><ram:BasisAmount>50.00</ram:BasisAmount><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>7</ram:RateApplicablePercent></ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:TaxBasisTotalAmount>50.00</ram:TaxBasisTotalAmount><ram:GrandTotalAmount>53.50</ram:GrandTotalAmount><ram:DuePayableAmount>53.50</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`

describe('E-Rechnung (§ 14 Abs. 1 UStG, EN 16931): read structured, not from OCR', () => {
  it('reads an XRechnung in UBL: total, rate, date, number, seller and its VAT id', () => {
    expect(readEInvoice(UBL)).toEqual({
      ok: true,
      syntax: 'ubl',
      validEInvoice: true,
      read: { grossCents: 23_800, vatRate: 19, date: '2025-03-14', invoiceNumber: 'RE-2025-0815', description: 'Druckerpapier A4' },
      seller: 'Büro Bedarf GmbH',
      sellerVatId: 'DE123456789',
      netCents: 20_000,
      vatCents: 3_800,
    })
  })

  it('reads a CII invoice (XRechnung CII, ZUGFeRD EN 16931)', () => {
    expect(readEInvoice(CII)).toMatchObject({ ok: true, syntax: 'cii', validEInvoice: true, read: { grossCents: 5_350, vatRate: 7, date: '2025-04-02', invoiceNumber: '4711', description: 'Fachbuch Steuerrecht' }, sellerVatId: 'DE987654321' })
  })

  it('says a ZUGFeRD MINIMUM or BASIC-WL is no E-Rechnung in the sense of § 14 (Abschn. 14.1 Abs. 12 UStAE)', () => {
    const minimum = CII.replace('urn:cen.eu:en16931:2017', 'urn:factur-x.eu:1p0:minimum')
    expect(readEInvoice(minimum)).toMatchObject({ ok: true, validEInvoice: false })
  })

  it('refuses a DTD (no entity expansion) and what is no invoice', () => {
    expect(readEInvoice('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><Invoice/>')).toMatchObject({ ok: false })
    expect(readEInvoice('<html><body>hi</body></html>')).toMatchObject({ ok: false })
    expect(looksLikeEInvoice('Rechnung Nr. 5')).toBe(false)
    expect(looksLikeEInvoice(UBL)).toBe(true)
  })

  it('the business receipt reader takes the structured path for XML', () => {
    expect(readBusinessReceipt(UBL)).toEqual({ grossCents: 23_800, vatRate: 19, date: '2025-03-14', invoiceNumber: 'RE-2025-0815', description: 'Druckerpapier A4' })
  })
})
