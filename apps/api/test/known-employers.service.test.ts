// Echtdatentest 18.11.2026: a fresh account showed Novartis and Roche as "saved employers" — a fixed list
// in the frontend. The suggestions now come from what the household really recorded: the employer of
// every Swiss salary certificate, of the user and of a Person B recorded in this account, in all years.
import { describe, expect, it } from 'vitest'
import { EMPTY_N_GRE, type CrossBorderSalaryStatementRecord } from '../src/ch-salary-certificate/ch-salary-certificate.repository.js'
import { KnownEmployersService } from '../src/ch-salary-certificate/known-employers.service.js'
import { LinkService } from '../src/link/link.service.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'

function certificate(userId: string, taxYear: number, name: string | null, strasse = '', plzOrt = ''): CrossBorderSalaryStatementRecord {
  return {
    userId,
    taxYear,
    fields: {} as CrossBorderSalaryStatementRecord['fields'],
    bemerkungen: null,
    saeule3aChf: null,
    krankenkasseChf: null,
    exchangeRateMonth: null,
    exchangeRateValue: null,
    exchangeRateMode: null,
    exchangeRateReceiptId: null,
    nGre: { ...EMPTY_N_GRE, arbeitgeberName: name, arbeitgeberStrasse: strasse, arbeitgeberPlzOrt: plzOrt },
  }
}

function setup() {
  const ch = new FakeChSalaryCertificateRepository()
  const link = new LinkService(new FakeLinkRepository(), new FakeProfileRepository(), new FakeMasterDataRepository(), { append: () => Promise.resolve() } as never)
  return { ch, link, service: new KnownEmployersService(ch, link) }
}

describe('KnownEmployersService', () => {
  it('a fresh account knows no employer', async () => {
    expect(await setup().service.list('user-a')).toEqual([])
  })

  it('lists the employers of both persons over all years, once each, the latest address first', async () => {
    const { ch, link, service } = setup()
    await link.set('user-a', 2024, { filingType: 'zusammen' })
    await link.set('user-a', 2025, { filingType: 'zusammen' })
    const b2024 = await link.dataUser('user-a', 2024, 'B')
    const b2025 = await link.dataUser('user-a', 2025, 'B')
    ch.seed(certificate('user-a', 2024, 'Rheinmetall Air Defence AG', 'Birchstrasse 1', '8050 Zürich'))
    ch.seed(certificate('user-a', 2025, 'Rheinmetall Air Defence AG', 'Birchstrasse 155', '8050 Zürich'))
    ch.seed(certificate(b2024, 2024, 'Cilag AG', 'Hochstrasse 201', '8205 Schaffhausen'))
    ch.seed(certificate(b2025, 2025, ' cilag ag ', 'Hochstrasse 201', '8205 Schaffhausen'))
    ch.seed(certificate('user-a', 2023, null))
    ch.seed(certificate('someone-else', 2025, 'Fremde AG', 'Weg 1', '4000 Basel'))

    expect(await service.list('user-a')).toEqual([
      { name: 'Rheinmetall Air Defence AG', strasse: 'Birchstrasse 155', plzOrt: '8050 Zürich' },
      { name: 'cilag ag', strasse: 'Hochstrasse 201', plzOrt: '8205 Schaffhausen' },
    ])
  })
})
