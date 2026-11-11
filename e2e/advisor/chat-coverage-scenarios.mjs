// Manual exploration, not a CI gate (#476): which parts of the return can a customer fill through
// the chat, against the REAL model? Several short personas over the API (no browser): every
// proposal is applied, then the stored state is read back. Costs money; reports instead of asserting.
//
//   API_ORIGIN=… WEB_ORIGIN=… DATABASE_URL=… node advisor/chat-coverage-scenarios.mjs
// The API behind API_ORIGIN must run with a provider key (see customer-chat-scenario.mjs).
import { writeFile, mkdir } from 'node:fs/promises'
import { request as playwrightRequest } from 'playwright-core'
import { startStack } from '../harness/stack.mjs'
import { signUpOutOfBand } from '../harness/flows.mjs'

const PASSWORD = 'Sicheres-Passwort-1!'
const YEAR = 2026
const OUT = process.env.SCENARIO_OUT ?? '/tmp/chat-coverage'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const BASE = `/v1/steuerjahre/${YEAR}`

const PERSONAS = [
  {
    id: 'haushalt-sonderausgaben',
    read: ['interview', 'steuerschaetzung'],
    turns: [
      'Ich bin angestellt, ledig, keine Kinder. Bruttolohn 58.000 €, Lohnsteuer 10.400 €, Sozialversicherung 11.600 €.',
      'Ich hatte Handwerkerkosten von 5.000 €, davon 3.200 € Arbeitslohn.',
      'In meinen Riester-Vertrag habe ich 1.200 € eingezahlt.',
      'Ich bin beruflich umgezogen, das hat 1.800 € gekostet.',
      'Ich habe eine doppelte Haushaltsführung, die Zweitwohnung kostet 650 € Miete im Monat.',
    ],
  },
  {
    id: 'mehrere-werte-in-einer-nachricht',
    read: ['interview', 'arbeitsweg'],
    turns: ['Trag bitte ein: 30 Tage Homeoffice, 5.000 € Handwerkerkosten und 200 € Spenden.'],
  },
  {
    id: 'vermietung-mit-objekt',
    setup: async (api) => {
      await api.post(`${BASE}/vermietung/objekte`)
    },
    read: ['vermietung'],
    turns: ['Ich vermiete eine Wohnung: 9.600 € Mieteinnahmen im Jahr, Baujahr 1995, Anschaffungskosten 180.000 €, Werbungskosten 2.400 €.'],
  },
  {
    id: 'vermietung-ohne-objekt',
    read: ['vermietung'],
    turns: ['Ich vermiete eine Wohnung und habe 9.600 € Miete im Jahr eingenommen. Trag das bitte ein.'],
  },
  {
    id: 'rente-und-kapital',
    read: ['rente', 'kapital'],
    turns: [
      'Ich bin Rentner und bekomme eine gesetzliche Altersrente von 18.000 € im Jahr, Rentenbeginn war 2019.',
      'Außerdem hatte ich 2.400 € Kapitalerträge, davon wurden 600 € Kapitalertragsteuer und 33 € Soli einbehalten.',
    ],
  },
  {
    id: 'kind-vorhanden',
    setup: async (api) => {
      await api.post(`${BASE}/kinder`, { data: { firstName: 'Mila', lastName: 'Muster', geburtsdatum: '2019-05-12' } })
    },
    read: ['kinder'],
    turns: ['Für meine Tochter bekomme ich das ganze Jahr Kindergeld, sie ist das ganze Jahr bei mir gemeldet und wohnt im Inland.'],
  },
  {
    id: 'kind-neu',
    read: ['kinder'],
    turns: ['Ich habe eine Tochter, geboren am 12.05.2019. Trag sie bitte als Kind ein.'],
  },
  {
    id: 'grenzgaenger-ch',
    read: ['ch-lohnausweis'],
    turns: ['Ich bin Grenzgänger in die Schweiz. Lohnausweis: Bruttolohn 96.000 CHF, Quellensteuer 4.320 CHF, AHV-Beiträge 5.100 CHF, Säule 3a 7.056 CHF.'],
  },
  {
    id: 'bescheid',
    read: ['bescheid'],
    turns: ['Mein Steuerbescheid ist da: festgesetzte Steuer 9.800 €, Erstattung 2.100 €, Bescheid vom 14.08.2027.'],
  },
]

function parseSse(text) {
  return text
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1]
      const data = /^data: (.*)$/m.exec(block)?.[1]
      if (!event || !data) return null
      try {
        return { event, data: JSON.parse(data) }
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

const describeAction = (a) => `${a.screen}${a.instance ? `[${String(a.instance).slice(0, 8)}]` : ''}.${a.field}=${a.newValue}${a.companionFields ? ` +${JSON.stringify(a.companionFields)}` : ''}`

async function main() {
  await mkdir(OUT, { recursive: true })
  const { apiOrigin, webOrigin, sql } = await startStack()
  const report = []
  for (const persona of PERSONAS) {
    const email = `cov-${persona.id}-${Date.now()}@beispiel.de`
    await sleep(4000)
    await signUpOutOfBand(apiOrigin, webOrigin, email, PASSWORD)
    sql(`UPDATE "User" SET "emailVerified" = true WHERE email = '${email}'`)
    const api = await playwrightRequest.newContext({ baseURL: apiOrigin, extraHTTPHeaders: { origin: webOrigin } })
    await sleep(4000)
    await api.post('/api/auth/sign-in/email', { data: { email, password: PASSWORD } })
    if (persona.setup) await persona.setup(api)

    const turns = []
    for (const message of persona.turns) {
      const started = Date.now()
      const res = await api.post(`${BASE}/advisor/stream`, { data: { message }, headers: { accept: 'text/event-stream' }, timeout: 90_000 })
      const events = parseSse(await res.text())
      const done = events.find((e) => e.event === 'done')?.data
      const error = events.find((e) => e.event === 'error')?.data
      const meta = done?.assistantMessage?.meta ?? {}
      const proposals = [...(meta.action ? [meta.action] : []), ...(meta.actions ?? []), ...(meta.twoPaths ? [meta.twoPaths.safePath] : [])]
      const applied = []
      for (const proposal of proposals) {
        const apply = await api.post(`${BASE}/advisor/actions/${proposal.actionId}/apply`)
        const body = await apply.json().catch(() => ({}))
        applied.push({ draft: describeAction(proposal), delta: proposal.deltaEur, ok: apply.ok(), error: apply.ok() ? null : `${body.code}: ${body.message}` })
      }
      turns.push({
        message,
        ms: Date.now() - started,
        mode: done?.mode ?? null,
        error: error ? `${error.code}: ${error.message}` : null,
        tools: events.filter((e) => e.event === 'tool').map((e) => e.data.name),
        applied,
        reply: (done?.assistantMessage?.content ?? '').replace(/\s+/g, ' ').slice(0, 500),
      })
      console.log(`[coverage] ${persona.id}: ${applied.length} draft(s) ${applied.map((a) => (a.ok ? '✓' : '✗') + ' ' + a.draft).join(' | ') || '—'}${error ? ` ERROR ${error.code}` : ''}`)
      await sleep(Math.max(0, 7000 - (Date.now() - started)))
    }
    const state = {}
    for (const path of persona.read) {
      const res = await api.get(`${BASE}/${path}`)
      state[path] = res.ok() ? await res.json() : { httpStatus: res.status() }
    }
    report.push({ persona: persona.id, turns, state })
    await api.dispose()
  }
  await writeFile(`${OUT}/coverage.json`, JSON.stringify(report, null, 2))
  console.log(`[coverage] written to ${OUT}/coverage.json`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
