// ADR-0101 §16 — the ELSTER fill-in help over the whole return. Golden: for one household (employee and
// self-employed, a child, a property) the help names exactly the values the paper printout fills
// (ADR-0050) for the same field ids, per copy; the Zeilen come from each year's measured Vordrucke.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BookingDraft } from '@steuereule/core'
import { AuditService } from '../src/audit/audit.service.js'
import { BusinessService } from '../src/business/business.service.js'
import { ElsterHelpService } from '../src/business/elster-help.service.js'
import { HebesatzDirectory } from '../src/business/hebesatz.js'
import type { CommuteRepository } from '../src/commute/commute.repository.js'
import { PrintoutService } from '../src/printout/printout.service.js'
import type { UnlockService } from '../src/unlock/unlock.service.js'
import spec2022 from '../src/printout/felder-2022.spec.json' with { type: 'json' }
import spec2023 from '../src/printout/felder-2023.spec.json' with { type: 'json' }
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeBusinessRepository } from './fakes/fake-business.repository.js'
import { FakeCapitalRepository } from './fakes/fake-capital.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakePensionRepository } from './fakes/fake-pension.repository.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'

const A1 = { person: 'A', business: 1 } as const
const B1 = { person: 'B', business: 1 } as const

const TEMPLATES_BASE = new URL('../assets/vordrucke/', import.meta.url)
const USER = 'u-koch'

const fee = (year: number): BookingDraft => ({
  date: `${year}-03-01`,
  documentNumber: `RE-${year}-001`,
  text: 'Honorar',
  lines: [
    { account: '1200', side: 'debit', amount: 119_000 },
    { account: '8400', side: 'credit', amount: 119_000, taxKey: 'ust19' },
  ],
})

async function household(years: readonly number[], { unlocked = true } = {}) {
  const profile = new FakeProfileRepository()
  const masterData = new FakeMasterDataRepository()
  const lstb = new FakeLstbRepository()
  const rental = new FakeRentalRepository()
  const children = new FakeChildRepository()
  const interview = new FakeInterviewAnswerRepository()
  await profile.upsert(USER, { firstName: 'Maximiliane', lastName: 'Koch', steuerId: '02476291358', steuernummer: '2010304050' })
  await masterData.save(USER, {
    geburtsdatum: '1986-05-04', strasse: 'Lindenweg', hausnummer: '3', plz: '01067', wohnort: 'Dresden',
    religion: 'VD', familienstand: 'ledig', iban: 'DE89370400440532013000', finanzamt: 'Dresden-Nord',
  } as never)
  for (const year of years) {
    interview.seed(USER, year, { job: 'Beides', kinder: 'Ja' })
    lstb.seed({ userId: USER, taxYear: year, bruttoarbeitslohn: '38000', lohnsteuer: '5200', sozialversicherung: '7600' })
    await children.create(USER, year, {
      firstName: 'Lotta', lastName: 'Koch', geburtsdatum: '2016-02-01', taxId: '12345678903', childBenefitClaimEur: '3000',
      kinship: 'leiblich', familyBenefitsOffice: 'Familienkasse Sachsen', domesticResidenceAllYear: true, otherParent: 'Unbekannt',
      healthBasicEur: '420', careEur: '90', childcareEur: '1800', childcareProvider: 'Kita Sonnenschein, Dresden', childcareFrom: '01.01.', childcareTo: '31.12.',
    })
    rental.seed({
      id: `obj-${year}`, userId: USER, taxYear: year, mieteinnahmen: '9600', anschaffungskosten: '250000', baujahr: '1995', werbungskosten: '2100',
      strasse: 'Kastanienallee', hausnummer: '9', plz: '01069', city: 'Dresden', livingArea: '68', depreciationAsLastYear: true, umlagen: '1800', schuldzinsen: '3100',
    })
  }
  const commute: CommuteRepository = { findForUserAndYear: async () => null, save: async (_u, _y, e) => e }
  const audit = new AuditService(new FakeAuditRepository())
  const unlock = { status: async () => (unlocked ? 'freigeschaltet' : 'offen') } as unknown as UnlockService
  const printout = new PrintoutService(
    profile, masterData, lstb, new FakePensionRepository(), new FakeCapitalRepository(), rental, new FakeChSalaryCertificateRepository(),
    children, new FakeLinkRepository(), interview, new FakeMarkingRepository(), commute, unlock, audit, TEMPLATES_BASE,
  )
  const business = new BusinessService(new FakeBusinessRepository(), interview, audit, new HebesatzDirectory(), unlock, () => '2026-11-20T10:00:00.000Z')
  for (const year of years) await business.post(USER, year, A1, fee(year))
  return { help: new ElsterHelpService(business, printout, audit), printout, business }
}

/** The printout's value of a field as the help shows it: a ticked box reads „Ja“. */
const asShown = (value: string | true) => (value === true ? 'Ja' : value)

describe('ELSTER fill-in help over the whole return (ADR-0101 §16)', () => {
  const previous = process.env.SELBSTSTAENDIGE_ENABLED
  beforeEach(() => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'true'
  })
  afterEach(() => {
    if (previous === undefined) delete process.env.SELBSTSTAENDIGE_ENABLED
    else process.env.SELBSTSTAENDIGE_ENABLED = previous
  })

  it.each([2024, 2025])('%i: Anlage N, Kind and V carry the values the paper printout fills, field by field', async (year) => {
    const { help, printout } = await household([year])
    const printed = (await printout.liveValues(USER, year)).forms
    for (const form of ['anlage-n', 'anlage-kind', 'anlage-v']) {
      const copies = printed.find((f) => f.formular === form)?.instances ?? []
      expect(copies.length, form).toBeGreaterThan(0)
      for (const [index, copy] of copies.entries()) {
        const instance = copy.entityId ?? copy.person ?? String(index + 1)
        const lines = (await help.help(USER, year, A1, form, instance)).lines
        const shown = Object.fromEntries(lines.filter((l) => l.value !== null).map((l) => [l.id, l.value]))
        // Every value the help shows is the printout's, and every printed line (but the head Mein ELSTER fills) is shown.
        for (const [id, value] of Object.entries(shown)) expect(asShown(copy.values[id]!), `${form} ${id}`).toBe(value)
        const printedLines = Object.entries(copy.values).filter(([id]) => !/\.(name|vorname|steuernummer|lfdNr|vornameEltern|personA|personB)$/.test(id) || id === 'anlKind.vorname')
        for (const [id, value] of printedLines) expect(shown[id], `${form} ${id}`).toBe(asShown(value))
      }
    }
  })

  it('2025: the lines carry the Zeile, Kennzahl and label of that year’s form', async () => {
    const { help } = await household([2025])
    const n = await help.help(USER, 2025, A1, 'anlage-n', undefined)
    expect(n).toMatchObject({ status: 'published', lineNumbersAvailable: true, instance: { kind: 'person', person: 'A' } })
    expect(n.lines.find((l) => l.id === 'anlN.kz110')).toMatchObject({ zeile: '5', kennzahlen: ['110'], label: 'Bruttoarbeitslohn einschließlich Sachbezüge', value: '38000' })
    const kindId = (await help.forms(USER, 2025, A1)).forms.find((f) => f.form === 'anlage-kind')!.instance!.id
    const kind = await help.help(USER, 2025, A1, 'anlage-kind', kindId)
    expect(kind.instance).toMatchObject({ kind: 'child', name: 'Lotta', number: 1 })
    expect(kind.lines.find((l) => l.id === 'anlKind.kz66')).toMatchObject({ zeile: '27', kennzahlen: ['66'], value: '420' })
  })

  it.each([
    [2022, spec2022],
    [2023, spec2023],
  ])('%i: lines carry the Zeilen of that year’s measured forms, not the printout year’s', async (year, spec) => {
    const { help } = await household([year])
    const zeileOf = (id: string) => String(spec.felder.find((f) => f.id === id)?.zeile)
    const n = await help.help(USER, year, A1, 'anlage-n', undefined)
    expect(n.status).toBe('published')
    expect(n.lines.find((l) => l.id === 'anlN.kz110')).toMatchObject({ zeile: zeileOf('anlN.kz110'), kennzahlen: ['110'], value: '38000' })
    const kindId = (await help.forms(USER, year, A1)).forms.find((f) => f.form === 'anlage-kind')!.instance!.id
    const kind = await help.help(USER, year, A1, 'anlage-kind', kindId)
    expect(kind.lines.find((l) => l.id === 'anlKind.kz66')).toMatchObject({ zeile: zeileOf('anlKind.kz66'), kennzahlen: ['66'] })
    const v = await help.help(USER, year, A1, 'anlage-v', `obj-${year}`)
    expect(v.instance).toMatchObject({ kind: 'property', name: 'Kastanienallee 9' })
    expect(v.lines.find((l) => l.id === 'anlV.kz33')).toMatchObject({ zeile: zeileOf('anlV.kz33'), kennzahlen: ['33'] })
  })

  it('2022: Anlage V names the 2022 lines (Kz 01 in Zeile 9, Schuldzinsen Kz 33 in Zeile 37); a value the 2022 form has no box for keeps no Zeile', async () => {
    const { help } = await household([2022])
    const v = await help.help(USER, 2022, A1, 'anlage-v', 'obj-2022')
    expect(v.lines.find((l) => l.id === 'anlV.kz01')).toMatchObject({ zeile: '9', kennzahlen: ['01'] })
    expect(v.lines.find((l) => l.id === 'anlV.kz33')).toMatchObject({ zeile: '37', kennzahlen: ['33'], value: '3100' })
    // The Anlage V 2022 asks for rents per storey: the unit line of later years has no Zeile there.
    expect(v.lines.find((l) => l.id === 'anlV.z13Wohnflaeche')).toMatchObject({ zeile: null, kennzahlen: [], value: '68' })
  })

  it('2023: the KAP tax lines stay on page 2 (Kz 280/480), not the Kz 286 block of page 3', async () => {
    const { lineOf } = await import('../src/printout/fill-in-lines.js')
    expect(lineOf(2023, 'anlKap.kz280')).toMatchObject({ seite: 2, zeile: '37', kennzahlen: ['280/480'] })
    expect(lineOf(2022, 'anlKap.kz280')).toMatchObject({ seite: 2, zeile: '37', kennzahlen: ['280/480'] })
  })

  it('lists the forms with values: business forms first, then the return in printout order, each copy labelled', async () => {
    const { help } = await household([2025])
    const { forms } = await help.forms(USER, 2025, A1)
    const names = forms.map((f) => f.form)
    expect(names.slice(0, 3)).toEqual(['anlage-euer', 'anlage-s', 'ust-2-a'])
    expect(names).not.toContain('gewst-1-a')
    expect(names.indexOf('est-1-a')).toBeLessThan(names.indexOf('anlage-n'))
    expect(names.indexOf('anlage-n')).toBeLessThan(names.indexOf('anlage-v'))
    expect(names.indexOf('anlage-v')).toBeLessThan(names.indexOf('anlage-kind'))
    expect(forms.find((f) => f.form === 'anlage-kind')).toMatchObject({ group: 'income-tax', instance: { kind: 'child', name: 'Lotta' } })
    expect(forms.find((f) => f.form === 'anlage-v')).toMatchObject({ instance: { kind: 'property', id: 'obj-2025', name: 'Kastanienallee 9' } })
    expect(forms.find((f) => f.form === 'anlage-euer')).toMatchObject({ group: 'business', instance: null })
  })

  it('several businesses: one Anlage EÜR per business, labelled by its name, one VAT return for the person (ADR-0101 §22)', async () => {
    const { help, business } = await household([2025])
    await business.addBusiness(USER, 2025, 'A', 'Onlineshop')
    await business.post(USER, 2025, { person: 'A', business: 2 }, { ...fee(2025), documentNumber: 'SHOP-1', lines: [{ account: '1200', side: 'debit', amount: 238_000 }, { account: '8400', side: 'credit', amount: 238_000, taxKey: 'ust19' }] })
    const { forms } = await help.forms(USER, 2025, A1)
    const euer = forms.filter((f) => f.form === 'anlage-euer')
    expect(euer.map((f) => f.instance)).toEqual([
      { id: 'betrieb-1', kind: 'business', person: 'A', name: null, number: 1 },
      { id: 'betrieb-2', kind: 'business', person: 'A', name: 'Onlineshop', number: 2 },
    ])
    expect(forms.filter((f) => f.form === 'ust-2-a')).toHaveLength(1)
    const shop = await help.help(USER, 2025, A1, 'anlage-euer', 'betrieb-2')
    expect(shop.instance).toMatchObject({ kind: 'business', number: 2 })
    expect(shop.lines.find((l) => l.kennzahlen.includes('112'))?.value).toBe(2000)
    const vat = await help.help(USER, 2025, A1, 'ust-2-a', undefined)
    expect(vat.lines.find((l) => l.id === 'ust.umsatz-19')?.value).toBe(3000)
  })

  it('2026: the forms are not published, so the help names the values without Zeilen and says so', async () => {
    const { help } = await household([2026])
    const n = await help.help(USER, 2026, A1, 'anlage-n', undefined)
    expect(n).toMatchObject({ status: 'not_published', lineNumbersAvailable: false })
    expect(n.note).toMatch(/noch nicht veröffentlicht \(zuletzt 2025\)/)
    expect(n.lines.find((l) => l.id === 'anlN.kz110')).toMatchObject({ zeile: null, kennzahlen: [], value: '38000' })
  })

  it('stays behind the self-employment tier and refuses an unknown copy', async () => {
    const locked = await household([2025], { unlocked: false })
    await expect(locked.help.forms(USER, 2025, A1)).rejects.toMatchObject({ status: 402 })
    await expect(locked.help.help(USER, 2025, A1, 'anlage-n', undefined)).rejects.toMatchObject({ status: 402 })
    const { help } = await household([2025])
    await expect(help.help(USER, 2025, A1, 'anlage-kind', 'kein-kind')).rejects.toMatchObject({ code: 'ELSTER_INSTANCE_UNKNOWN' })
  })
})
