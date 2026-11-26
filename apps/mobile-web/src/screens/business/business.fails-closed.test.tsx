// The WEB-28 lock for the self-employed area: every page with a save path, rendered while every request
// answers 500, shows a failure and sends no write however much the user presses and types. Read-only pages
// (Gewerbesteuer, ELSTER) and the pages without a first read (Firmenwagen, Freischalten: they only send what
// the user enters there, nothing built from stored data) are covered by their own tests.
import { describe, it } from 'vitest'
import { expectFailsClosed, failEveryRequest } from '../../../test/test-every-query-fails'
import { renderBusiness } from './businessTestKit'

const PAGES_WITH_A_SAVE = [
  undefined,
  'profil',
  'buch',
  'erfassung',
  'bank',
  'anlagen',
  'abschluss',
  'umsatzsteuer',
  'verluste',
  'export',
  'beruf',
  'gewerbedaten',
  'beteiligungen',
  'voranmeldungen',
  'sondertarife',
  'lohn',
] as const

describe('the self-employed area fails closed (WEB-28, WEB-30, WEB-31)', () => {
  for (const page of PAGES_WITH_A_SAVE) {
    it(`${page ?? 'overview'}: a failed load shows a failure and sends no write`, async () => {
      const failing = failEveryRequest()
      renderBusiness(page, { onChangeBusiness: () => {}, onChangePerson: () => {} })
      await expectFailsClosed(failing)
    })
  }
})
