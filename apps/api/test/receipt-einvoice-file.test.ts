// ADR-0101 §22: an E-Rechnung is stored as the XML it was received in; nothing else that starts with `<`.
import { describe, expect, it } from 'vitest'
import { detectAllowedReceiptMimeType, isEInvoiceXml } from '../src/receipt/storage/magic-bytes.js'

const UBL = '<?xml version="1.0" encoding="UTF-8"?>\n<ubl:Invoice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>1</cbc:ID></ubl:Invoice>'
const CII = '﻿<!-- ZUGFeRD -->\n<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"/>'

describe('E-Rechnung files (§ 14 Abs. 1 UStG, GoBD)', () => {
  it('stores an XRechnung (UBL) and a CII invoice as application/xml', () => {
    expect(detectAllowedReceiptMimeType(Buffer.from(UBL))).toBe('application/xml')
    expect(detectAllowedReceiptMimeType(Buffer.from(CII))).toBe('application/xml')
  })

  it('refuses HTML, SVG, XHTML, a stylesheet instruction and any DTD', () => {
    for (const evil of [
      '<html><script>alert(1)</script></html>',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
      '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><script>x</script></html>',
      '<?xml version="1.0"?><?xml-stylesheet href="x.xsl"?><Invoice/>',
      '<?xml version="1.0"?><!DOCTYPE Invoice [<!ENTITY x SYSTEM "file:///etc/passwd">]><Invoice>&x;</Invoice>',
      '<Invoice/><!ENTITY late "x">',
      '<?xml-stylesheet href="x.xsl"?><Invoice/>',
    ]) {
      expect(isEInvoiceXml(Buffer.from(evil)), evil).toBe(false)
      expect(() => detectAllowedReceiptMimeType(Buffer.from(evil))).toThrow(/Unzulässiges Dateiformat/)
    }
  })
})
