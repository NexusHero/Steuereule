#!/usr/bin/env node
// Reference values for the income tax (#450 6A): asks the BMF "Berechnung der Einkommensteuer" form
// (https://www.bmf-steuerrechner.de/ekst/eingabeformekst.xhtml) for the tarifliche Einkommensteuer
// and the Solidaritätszuschlag at chosen zvE values and writes them as a fixture with source and
// retrieval date. Run once a year or after a tariff change; CI never calls the BMF (the fixture is
// committed and the tests compare the core formula against it).
//
//   node scripts/tax-reference/fetch-bmf-ekst.mjs 2022 2023 2024 2025 2026
//
// Polite by design: one request at a time, a pause between them.
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const FORM = 'https://www.bmf-steuerrechner.de/ekst/eingabeformekst.xhtml'
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packages/core/src/math/__fixtures__')

// Zone boundaries (from § 32a EStG of the year) and ±1 € around them, plus typical incomes,
// the Soli exemption/relief zone and zone 5 (#450 6A).
const BOUNDARIES = {
  2022: [10347, 14926, 58596, 277825],
  2023: [10908, 15999, 62809, 277825],
  2024: [11784, 17005, 66760, 277825],
  2025: [12096, 17443, 68480, 277825],
  2026: [12348, 17799, 69878, 277825],
}
const TYPICAL = [20000, 30000, 40000, 50000, 60000, 80000, 100000, 300000]
const SOLI_ZONE = [70000, 75000, 90000, 110000]

function cookieJar() {
  const jar = new Map()
  return {
    header: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    store: (res) => {
      for (const line of res.headers.getSetCookie?.() ?? []) {
        const [pair] = line.split(';')
        const [k, ...v] = pair.split('=')
        jar.set(k.trim(), v.join('='))
      }
    },
  }
}

const euro = (s) => Number(s.replace(/\./g, '').replace(',', '.'))

async function query(year, zvE, splitting) {
  const jar = cookieJar()
  const page = await fetch(FORM, { headers: { 'user-agent': 'steuereule-reference-check/1.0' } })
  jar.store(page)
  const html = await page.text()
  const viewState = /name="javax\.faces\.ViewState"[^>]*value="([^"]*)"/.exec(html)?.[1]
  if (!viewState) throw new Error('no ViewState on the BMF form')
  const body = new URLSearchParams({
    bmf_form_ekst: 'bmf_form_ekst',
    'bmf_form_ekst:ekst_bj': String(year),
    'bmf_form_ekst:ekst_zve': String(zvE),
    'bmf_form_ekst:ekst_pv': splitting ? 'true' : 'false',
    'javax.faces.ViewState': viewState,
    'javax.faces.source': 'bmf_form_ekst:income_ekst',
    'javax.faces.partial.event': 'click',
    'javax.faces.partial.execute': 'bmf_form_ekst',
    'javax.faces.partial.render': 'bmf_form_ekst bmf_infobox',
    'javax.faces.behavior.event': 'action',
    'javax.faces.partial.ajax': 'true',
  })
  const post = await fetch(FORM, {
    method: 'POST',
    headers: { cookie: jar.header(), 'faces-request': 'partial/ajax', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'steuereule-reference-check/1.0' },
    body,
  })
  jar.store(post)
  const redirect = /redirect url="([^"]+)"/.exec(await post.text())?.[1]
  if (!redirect) throw new Error(`no result for ${year}/${zvE}`)
  const result = await fetch(new URL(redirect, FORM), { headers: { cookie: jar.header(), 'user-agent': 'steuereule-reference-check/1.0' } })
  const text = (await result.text()).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|​/g, ' ').replace(/\s+/g, ' ')
  const shownZve = /zu versteuerndes Einkommen \( zvE \): ([\d.]+,\d\d) Euro/.exec(text)?.[1]
  const shownYear = /Ergebnis der Berechnung der Einkommensteuer (\d{4})/.exec(text)?.[1]
  const tax = /Einkommen\s?steuer ([\d.]+,\d\d) Euro/.exec(text)?.[1]
  const soli = /Solidarit\S* ?zuschlag ([\d.]+,\d\d) Euro/.exec(text)?.[1]
  if (!tax || !soli || Number(shownYear) !== year || euro(shownZve ?? '0') !== zvE) {
    throw new Error(`could not read the BMF result for ${year}/${zvE} (year ${shownYear}, zvE ${shownZve})`)
  }
  return { zvE, splitting, incomeTax: euro(tax), soli: euro(soli) }
}

const years = process.argv.slice(2).map(Number)
if (years.length === 0) {
  console.error('usage: node scripts/tax-reference/fetch-bmf-ekst.mjs <year> [...]')
  process.exit(1)
}
for (const year of years) {
  const zves = [...new Set([...BOUNDARIES[year].flatMap((b) => [b - 1, b, b + 1]), ...TYPICAL, ...SOLI_ZONE])].sort((a, b) => a - b)
  const cases = []
  for (const zvE of zves) {
    cases.push(await query(year, zvE, false))
    await sleep(1200)
  }
  for (const zvE of [40000, 80000, 140000]) {
    cases.push(await query(year, zvE, true))
    await sleep(1200)
  }
  const fixture = {
    source: 'BMF, Berechnung der Einkommensteuer (tarifliche ESt nach § 32a EStG)',
    url: FORM,
    retrieved: new Date().toISOString().slice(0, 10),
    year,
    cases,
  }
  writeFileSync(path.join(OUT_DIR, `bmf-reference.${year}.json`), `${JSON.stringify(fixture, null, 2)}\n`)
  console.log(`[tax-reference] ${year}: ${cases.length} values`)
}
