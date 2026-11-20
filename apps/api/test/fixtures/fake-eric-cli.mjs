#!/usr/bin/env node
// A stand-in for the operator's ERiC sidecar (ADR-0101 §22): it checks the contract, not the tax content.
let input = ''
process.stdin.on('data', (c) => (input += c))
process.stdin.on('end', () => {
  const [mode, , verfahren, , hersteller] = process.argv.slice(2)
  const ok = input.includes('<xbrli:xbrl') && verfahren === 'ElsterBilanz' && hersteller === '74931' && process.env.ERIC_CERT_PIN === '123456' && !process.argv.join(' ').includes('123456')
  if (!ok) return process.stdout.write(JSON.stringify({ ok: false, meldungen: ['Vertrag verletzt'] }))
  process.stdout.write(JSON.stringify(mode === 'senden' ? { ok: true, ticket: 'TK-1', protokoll: 'übermittelt' } : { ok: true, protokoll: 'plausibel' }))
})
