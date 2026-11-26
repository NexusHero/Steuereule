// The routes of the app shell (ADR-0044): what each stack hands its screen, where every callback of the
// screen leads, who is turned away without an account, and what the tab bar does. The screens themselves are
// stand-ins: this tests the wiring between them, not their content.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, screen, fireEvent, waitFor } from '@testing-library/react'
import { defaultTaxYear } from '../config/taxYear'
import { rememberedReturnTo } from '../screens/funnel/sessionMemory'
import { TILES } from '../screens/cockpit/tiles'
import { currentRoute, renderShell, signedIn } from './navigationTestKit'
import { stubArgs } from './stubScreen'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/test-msw-server'

vi.mock('../screens/cockpit/CockpitScreen', async () => ({ CockpitScreen: (await import('./stubScreen')).stubScreen('cockpit') }))
vi.mock('../screens/interview/InterviewScreen', async () => ({ InterviewScreen: (await import('./stubScreen')).stubScreen('interview') }))
vi.mock('../screens/strom/StromScreen', async () => ({ StromScreen: (await import('./stubScreen')).stubScreen('strom') }))
vi.mock('../screens/funnel/KontoWandScreen', async (importOriginal) => ({ ...(await importOriginal<object>()), AccountWallScreen: (await import('./stubScreen')).stubScreen('wall') }))
vi.mock('../screens/submission/SubmissionScreen', async () => ({ SubmissionScreen: (await import('./stubScreen')).stubScreen('submission') }))
vi.mock('../screens/plausibility/PlausibilityScreen', async () => ({ PlausibilityScreen: (await import('./stubScreen')).stubScreen('plausibility') }))
vi.mock('../screens/filing-type-comparison/FilingTypeComparisonScreen', async () => ({ FilingTypeComparisonScreen: (await import('./stubScreen')).stubScreen('comparison') }))
vi.mock('../screens/assessment/AssessmentScreen', async () => ({ AssessmentScreen: (await import('./stubScreen')).stubScreen('assessment') }))
vi.mock('../screens/capital/CapitalScreen', async () => ({ CapitalScreen: (await import('./stubScreen')).stubScreen('capital') }))
vi.mock('../screens/rental/RentalScreen', async () => ({ RentalScreen: (await import('./stubScreen')).stubScreen('rental') }))
vi.mock('../screens/children/ChildrenScreen', async () => ({ ChildrenScreen: (await import('./stubScreen')).stubScreen('children') }))
vi.mock('../screens/master-data/MasterDataScreen', async () => ({ MasterDataScreen: (await import('./stubScreen')).stubScreen('masterdata') }))
vi.mock('../screens/lstb/LstbScreen', async () => ({ LstbScreen: (await import('./stubScreen')).stubScreen('lstb') }))
vi.mock('../screens/workdays/WorkdaysScreen', async () => ({ WorkdaysScreen: (await import('./stubScreen')).stubScreen('workdays') }))
vi.mock('../screens/cross-border/CrossBorderScreen', async () => ({ CrossBorderScreen: (await import('./stubScreen')).stubScreen('crossborder') }))
vi.mock('../screens/pension/PensionerScreen', async () => ({ PensionerScreen: (await import('./stubScreen')).stubScreen('pension') }))
vi.mock('../screens/catalog/CatalogScreen', async () => ({ CatalogScreen: (await import('./stubScreen')).stubScreen('catalog') }))
vi.mock('../screens/business/BusinessScreen', async (importActual) => ({ ...(await importActual<typeof import('../screens/business/BusinessScreen')>()), BusinessScreen: (await import('./stubScreen')).stubScreen('business') }))
vi.mock('../screens/printout/OfficialFormScreen', async () => ({ OfficialFormScreen: (await import('./stubScreen')).stubScreen('form') }))
vi.mock('../screens/history/HistoryScreen', async () => ({ HistoryScreen: (await import('./stubScreen')).stubScreen('history') }))
vi.mock('../screens/history/HistoryYearScreen', async () => ({ HistoryYearScreen: (await import('./stubScreen')).stubScreen('historyyear') }))
vi.mock('../screens/history/HistoryDevelopmentScreen', async () => ({ HistoryDevelopmentScreen: (await import('./stubScreen')).stubScreen('historydev') }))
vi.mock('../screens/history/HistoryDocumentsScreen', async () => ({ HistoryDocumentsScreen: (await import('./stubScreen')).stubScreen('historydocs') }))
vi.mock('../screens/ProfileScreen', async () => ({ ProfileScreen: (await import('./stubScreen')).stubScreen('profile') }))
vi.mock('../screens/PrivacyScreen', async () => ({ PrivacyScreen: (await import('./stubScreen')).stubScreen('privacy') }))
vi.mock('../screens/security/SecurityScreen', async () => ({ SecurityScreen: (await import('./stubScreen')).stubScreen('security') }))
vi.mock('../screens/advisor/OwlModeScreen', async () => ({ OwlModeScreen: (await import('./stubScreen')).stubScreen('owl') }))
vi.mock('../screens/receipts/ReceiptsScreen', async () => ({ ReceiptsScreen: (await import('./stubScreen')).stubScreen('receipts') }))

const YEAR = 2025
const press = (name: string, prop: string, ...args: unknown[]) => {
  if (args.length > 0) stubArgs.set(`${name}.${prop}`, args)
  fireEvent.click(screen.getByTestId(`stub-${name}-${prop}`))
}
const propsOf = (name: string) => JSON.parse(screen.getByTestId(`stub-${name}-props`).textContent ?? '{}') as Record<string, unknown>
const at = async (name: string, params?: Record<string, unknown>) => {
  await waitFor(() => expect(currentRoute().name).toBe(name))
  if (params) expect(currentRoute().params).toMatchObject(params)
}
const open = async (path: string, shell: Parameters<typeof renderShell>[1] = {}) => {
  renderShell(path, shell)
  await screen.findAllByTestId(/^stub-/)
}

beforeEach(() => {
  signedIn()
  stubArgs.clear()
  sessionStorage.clear()
})
afterEach(() => sessionStorage.clear())

describe('the cockpit home', () => {
  const home = () => open('/app')

  it.each([
    ['onOpenInterview', [], 'Strom', { year: defaultTaxYear(), step: 'basis' }],
    ['onOpenStrom', [{ kind: 'auswahl' }], 'Strom', { step: 'auswahl' }],
    ['onOpenAssessment', [], 'Assessment', { year: defaultTaxYear() }],
    ['onOpenCapital', [], 'Capital', { year: defaultTaxYear() }],
    ['onOpenRental', [], 'Rental', { year: defaultTaxYear() }],
    ['onOpenKinder', [], 'Children', { year: defaultTaxYear() }],
    ['onOpenOfficialForm', [2024], 'OfficialForm', { year: 2024 }],
    ['onOpenMasterData', [], 'CockpitMasterData', { year: defaultTaxYear() }],
    ['onOpenSubmission', [2024], 'Submission', { year: 2024 }],
    ['onOpenElsterHelp', [2024], 'Business', { year: 2024, page: 'elster' }],
    ['onOpenPartner', ['lstb', 'Sabine'], 'Partner', { year: defaultTaxYear(), area: 'lstb' }],
  ] as const)('%s opens its route', async (callback, args, route, params) => {
    await home()
    press('cockpit', callback, ...args)
    await at(route, params)
  })

  it('switches to the Belege tab', async () => {
    await home()
    press('cockpit', 'onOpenReceipts')
    expect(await screen.findByTestId('stub-receipts')).toBeTruthy()
  })

  it('takes the year and the path the user continues with, and hands the confirmation to the screen when the shell has one', async () => {
    await open('/app', { onOpenConfirmation: () => {} })
    expect(propsOf('cockpit')).toMatchObject({ taxYear: defaultTaxYear(), isSignedIn: true })
    press('cockpit', 'onYearChange', 2024)
    await waitFor(() => expect(propsOf('cockpit').taxYear).toBe(2024))
    press('cockpit', 'onContinuePath', 'ch')
    expect(screen.getByTestId('stub-cockpit-onOpenConfirmation')).toBeTruthy()
  })

  it('goes straight into the Strom when the shell starts in the interview', async () => {
    await open('/app', { startInInterview: true })
    await at('Strom', { step: 'basis' })
  })

  const tileOf = (screenName: string) => TILES.find((tile) => tile.route.screen === screenName)!
  it.each([
    ['Lstb', 'Lstb'],
    ['CrossBorder', 'CrossBorder'],
    ['Pension', 'Pension'],
    ['Workdays', 'Workdays'],
    ['Capital', 'Capital'],
    ['Rental', 'Rental'],
    ['Children', 'Children'],
    ['Business', 'Business'],
  ])('a tile of %s leads to its route', async (screenName, route) => {
    await home()
    press('cockpit', 'onOpenTile', tileOf(screenName), false)
    await at(route, { year: defaultTaxYear() })
  })

  it('opens a catalogue tile, and marks it as a revisit when it is one', async () => {
    await home()
    const tile = tileOf('Catalog')
    press('cockpit', 'onOpenTile', tile, false)
    await at('Catalog')
    expect(currentRoute().params).not.toHaveProperty('revisit')
    fireEvent.click(await screen.findByLabelText('Schließen'))
    await at('CockpitHome')
    press('cockpit', 'onOpenTile', tile, true)
    await at('Catalog', { revisit: true })
  })
})

describe('the interview and the Strom', () => {
  it('moves the route year with the interview, and leaves it when it is done', async () => {
    await open('/app/steuerjahr/2025/interview')
    expect(propsOf('interview')).toMatchObject({ taxYear: YEAR })
    press('interview', 'onChangeYear', 2024)
    await at('Interview', { year: 2024 })
    press('interview', 'onDone', { job: 'Rente' })
    await at('CockpitHome')
  })

  it('walks the Strom: on to the next step, and out of it', async () => {
    await open('/app/steuerjahr/2025/strom/basis')
    expect(propsOf('strom')).toMatchObject({ taxYear: YEAR, slug: 'basis', isSignedIn: true })
    press('strom', 'onGo', { kind: 'auswahl' })
    await at('Strom', { step: 'auswahl' })
    press('strom', 'onExit')
    await at('CockpitHome')
  })

  it('opens the Abgabe from the Strom, and Back from there leads to the cockpit home', async () => {
    await open('/app/steuerjahr/2025/strom/basis')
    press('strom', 'onOpenSubmission')
    await at('Submission', { year: YEAR })
    press('submission', 'onBack')
    await at('CockpitHome')
  })

  it('lets a guest finish the basis page and sends them on to the account wall path', async () => {
    signedIn(false)
    await open('/app/steuerjahr/2025/strom/basis')
    press('strom', 'onGuestBasisDone', 'rente')
    await at('CockpitHome')
  })

  it('turns a guest away from every other step of the Strom, to the account wall, remembering where they wanted to go', async () => {
    signedIn(false)
    renderShell('/app/steuerjahr/2025/strom/auswahl')
    await at('AccountWall')
    expect(rememberedReturnTo()).toBe('/app/steuerjahr/2025/strom/auswahl')
    await screen.findByTestId('stub-wall')
    press('wall', 'onLater')
    await at('CockpitHome')
  })

  it('has the account wall hand the registration and login to the shell', async () => {
    const onRegister = vi.fn()
    const onLogin = vi.fn()
    await open({ routes: [{ name: 'Cockpit', state: { routes: [{ name: 'CockpitHome' }, { name: 'AccountWall' }] } }] } as never, { onRegister, onLogin })
    press('wall', 'onRegister')
    press('wall', 'onLogin')
    expect(onRegister).toHaveBeenCalledTimes(1)
    expect(onLogin).toHaveBeenCalledTimes(1)
  })
})

describe('a year that is no tax year', () => {
  it('returns to the cockpit home, replacing a route that was the only one', async () => {
    renderShell({ routes: [{ name: 'Cockpit', state: { routes: [{ name: 'Interview', params: { year: 1999 } }] } }] } as never)
    await at('CockpitHome')
    await screen.findByTestId('stub-cockpit')
  })

  it('pops to the cockpit home when it lies beneath', async () => {
    renderShell('/app/steuerjahr/1999/kapital')
    await at('CockpitHome')
  })

  it('returns to the home from a Catalog entry that does not exist', async () => {
    renderShell({ routes: [{ name: 'Cockpit', state: { routes: [{ name: 'CockpitHome' }, { name: 'Catalog', params: { year: YEAR, entry: 'gibtsnicht' } }] } }] } as never)
    await at('CockpitHome')
  })
})

describe('the sheets of the cockpit', () => {
  it.each([
    ['/app/steuerjahr/2025/lstb', 'lstb'],
    ['/app/steuerjahr/2025/rente', 'pension'],
    ['/app/steuerjahr/2025/schweiz', 'crossborder'],
    ['/app/steuerjahr/2025/arbeitstage', 'workdays'],
    ['/app/steuerjahr/2025/kapital', 'capital'],
    ['/app/steuerjahr/2025/vermietung', 'rental'],
    ['/app/steuerjahr/2025/kinder', 'children'],
    ['/app/steuerjahr/2025/katalog/lebenslagen', 'catalog'],
  ])('%s hands its screen the year, and both its Done and its Back lead home', async (path, name) => {
    await open(path)
    expect(propsOf(name)).toMatchObject({ taxYear: YEAR })
    press(name, 'onDone')
    await at('CockpitHome')
    await open(path)
    press(name, 'onBack')
    await at('CockpitHome')
  })

  it('closes with the sheet\'s own button, to the home that lies beneath', async () => {
    await open('/app/steuerjahr/2025/kinder')
    fireEvent.click(screen.getByLabelText('Schließen'))
    await at('CockpitHome')
  })

  it('closes into a fresh home when the sheet was the first route', async () => {
    renderShell({ routes: [{ name: 'Cockpit', state: { routes: [{ name: 'Capital', params: { year: YEAR } }] } }] } as never)
    fireEvent.click(await screen.findByLabelText('Schließen'))
    await at('CockpitHome')
  })

  it('switches the year of the wage tax certificate with the route', async () => {
    await open('/app/steuerjahr/2025/lstb')
    press('lstb', 'onSwitchTaxYear', 2024)
    await at('Lstb', { year: 2024 })
  })

  it('passes the catalogue entry and the revisit flag', async () => {
    await open('/app/steuerjahr/2025/katalog/einkuenfte?revisit=1')
    expect(propsOf('catalog')).toMatchObject({ entry: 'einkuenfte', revisit: true })
  })
})

describe('the full-screen routes', () => {
  it('assessment: Done and Back lead home', async () => {
    await open('/app/steuerjahr/2025/bescheid')
    press('assessment', 'onDone')
    await at('CockpitHome')
    await open('/app/steuerjahr/2025/bescheid')
    press('assessment', 'onBack')
    await at('CockpitHome')
  })

  it('walks the pre-filing check: on to the comparison, back to the check, then home', async () => {
    await open('/app/steuerjahr/2025/plausibilitaet')
    press('plausibility', 'onDone')
    await at('FilingTypeComparison', { year: YEAR })
    press('comparison', 'onBack')
    await at('Plausibility')
    press('plausibility', 'onBack')
    await at('CockpitHome')
    await open('/app/steuerjahr/2025/veranlagungsvergleich')
    press('comparison', 'onDone')
    await at('CockpitHome')
  })

  describe('the Abgabe', () => {
    it('opens the route of a tile, the fill-in help, and the printout the shell offers', async () => {
      const onOpenPrintout = vi.fn()
      await open('/app/steuerjahr/2025/abgabe', { onOpenPrintout })
      press('submission', 'onOpenPrintout', 2024)
      expect(onOpenPrintout).toHaveBeenCalledWith(2024)
      press('submission', 'onOpenTile', 'kinder', true)
      await at('Children', { year: YEAR })
    })

    it('opens the fill-in help of another year', async () => {
      await open('/app/steuerjahr/2025/abgabe')
      press('submission', 'onOpenElsterHelp', 2024)
      await at('Business', { year: 2024, page: 'elster' })
    })

    it('leaves to the home beneath, or makes one when it was the first route', async () => {
      await open('/app/steuerjahr/2025/abgabe')
      press('submission', 'onBack')
      await at('CockpitHome')
      cleanup()
      renderShell({ routes: [{ name: 'Cockpit', state: { routes: [{ name: 'Submission', params: { year: YEAR } }] } }] } as never)
      await screen.findByTestId('stub-submission')
      press('submission', 'onBack')
      await at('CockpitHome')
    })

    it('does nothing at the printout when the shell has none', async () => {
      await open('/app/steuerjahr/2025/abgabe')
      press('submission', 'onOpenPrintout', 2024)
      expect(currentRoute().name).toBe('Submission')
    })
  })

  describe('the official forms', () => {
    it('hands over the form to open first, and goes back to the home when nothing is behind it', async () => {
      renderShell({ routes: [{ name: 'Cockpit', state: { routes: [{ name: 'OfficialForm', params: { year: YEAR, form: 'anlage-n' } }] } }] } as never)
      await screen.findByTestId('stub-form')
      expect(propsOf('form')).toMatchObject({ taxYear: YEAR, initialForm: 'anlage-n' })
      press('form', 'onBack')
      await at('CockpitHome')
    })

    it('goes one step back when there is one', async () => {
      await open('/app/steuerjahr/2025/formular')
      press('form', 'onBack')
      await at('CockpitHome')
    })

    it.each([
      ['lstb', 'A', 'Lstb'],
      ['commute', 'A', 'Workdays'],
      ['chLohnausweis', 'A', 'CrossBorder'],
      ['rente', 'A', 'Pension'],
      ['kapital', 'A', 'Capital'],
      ['vermietung', 'A', 'Rental'],
      ['kind', 'A', 'Children'],
      ['stammdaten', 'A', 'CockpitMasterData'],
      ['profil', 'A', 'CockpitMasterData'],
      ['kopplung', 'A', 'CockpitMasterData'],
      ['interview', 'A', 'Interview'],
      ['assessment', 'A', 'Assessment'],
      // Person B's masks are the partner's: with no partner recorded in the shell the route asks for them first.
      ['lstb', 'B', 'CockpitMasterData'],
      ['commute', 'B', 'CockpitMasterData'],
      ['chLohnausweis', 'B', 'CockpitMasterData'],
      ['rente', 'B', 'CockpitMasterData'],
      ['kapital', 'B', 'Capital'],
    ])('opens the mask of %s for person %s: %s', async (maskScreen, person, route) => {
      await open('/app/steuerjahr/2025/formular/anlage-n')
      press('form', 'onInspectField', maskScreen, 'feld', person)
      await at(route)
    })

    it('opens a mask for person A when the form names no person', async () => {
      await open('/app/steuerjahr/2025/formular/anlage-n')
      press('form', 'onInspectField', 'lstb', 'feld')
      await at('Lstb')
    })
  })
})

describe('the master data and the partner', () => {
  it('records a partner from the master data, and returns there from their screen', async () => {
    await open('/app/steuerjahr/2025/stammdaten')
    press('masterdata', 'onRecordPartner', 'rente', 'Sabine')
    await at('Partner', { area: 'rente' })
    expect(propsOf('pension')).toMatchObject({ partnerName: 'Sabine' })
    press('pension', 'onDone')
    await at('CockpitMasterData')
  })

  it('goes back from the master data to the home', async () => {
    await open('/app/steuerjahr/2025/stammdaten')
    press('masterdata', 'onBack')
    await at('CockpitHome')
  })

  it.each([
    ['lstb', 'lstb'],
    ['arbeitsweg', 'workdays'],
    ['schweiz', 'crossborder'],
    ['rente', 'pension'],
  ] as const)('shows the %s screen of the partner by name, and Back from the home leads home', async (area, name) => {
    await open('/app')
    press('cockpit', 'onOpenPartner', area, 'Sabine')
    await at('Partner')
    expect(propsOf(name)).toMatchObject({ partnerName: 'Sabine' })
    press(name, 'onBack')
    await at('CockpitHome')
  })

  it('switches the year of the partner\'s wage tax certificate with the route', async () => {
    await open('/app')
    press('cockpit', 'onOpenPartner', 'lstb', 'Sabine')
    await at('Partner')
    press('lstb', 'onSwitchTaxYear', 2024)
    await at('Partner', { year: 2024 })
  })

  it('sends a partner link without a recorded partner to the master data', async () => {
    renderShell('/app/steuerjahr/2025/partner/lstb')
    await at('CockpitMasterData', { year: YEAR })
  })

  it('opens a reloaded partner link with the name of the year’s partner (NM-12)', async () => {
    server.use(
      http.get('*/v1/steuerjahre/:jahr/kopplung', () =>
        HttpResponse.json({ filingType: 'zusammen', personBUserId: 'b', personBHasOwnAccount: false, personB: { firstName: 'Bea' } }),
      ),
    )
    renderShell('/app/steuerjahr/2025/partner/lstb')
    await at('Partner', { area: 'lstb' })
    await waitFor(() => expect(propsOf('lstb')).toMatchObject({ partnerName: 'Bea' }))
  })
})

describe('Verlauf', () => {
  it('walks the timeline into a year, the development and the documents, and back', async () => {
    await open('/app/verlauf')
    expect(propsOf('history')).toMatchObject({ isGuest: false })
    press('history', 'onOpenYearDetail', 2024)
    await at('HistoryYear', { year: 2024 })
    press('historyyear', 'onBack')
    await at('HistoryHome')
    press('history', 'onOpenDevelopment')
    await at('HistoryDevelopment')
    press('historydev', 'onOpenYearDetail', 2023)
    await at('HistoryYear', { year: 2023 })
    press('historyyear', 'onBack')
    press('history', 'onOpenDocuments')
    await at('HistoryDocuments')
    press('historydocs', 'onBack')
    await at('HistoryHome')
    press('history', 'onOpenDevelopment')
    press('historydev', 'onBack')
    await at('HistoryHome')
  })

  it('starts a year in the cockpit, and opens the drafts in the owl', async () => {
    await open('/app/verlauf')
    press('history', 'onStartYear', 2024)
    await at('CockpitHome')
    expect(propsOf('cockpit').taxYear).toBe(2024)
    fireEvent.click(screen.getByRole('tab', { name: 'Verlauf' }))
    press('history', 'onOpenDrafts')
    expect(await screen.findByTestId('stub-owl')).toBeTruthy()
  })

  it('opens a year in the cockpit, prepares an appeal there, and goes to the receipts of that year', async () => {
    await open('/app/verlauf/2024')
    press('historyyear', 'onOpenYear', 2024)
    await at('CockpitHome')
    fireEvent.click(screen.getByRole('tab', { name: 'Verlauf' }))
    press('historyyear', 'onPrepareAppeal', 2024)
    await at('Assessment', { year: 2024 })
    fireEvent.click(screen.getByRole('tab', { name: 'Verlauf' }))
    press('historyyear', 'onOpenReceipts')
    expect(await screen.findByTestId('stub-receipts')).toBeTruthy()
  })

  it('opens the drafts from the development page', async () => {
    await open('/app/verlauf/entwicklung')
    press('historydev', 'onOpenDrafts')
    expect(await screen.findByTestId('stub-owl')).toBeTruthy()
  })

  it('tells the pages a guest is one', async () => {
    signedIn(false)
    await open('/app/verlauf/unterlagen')
    expect(propsOf('historydocs')).toMatchObject({ isGuest: true })
  })
})

describe('Profil', () => {
  it('walks to privacy, security and the master data, and back each time', async () => {
    await open('/app/profil')
    press('profile', 'onOpenPrivacy')
    await at('Privacy')
    press('privacy', 'onBack')
    await at('ProfileHome')
    press('profile', 'onOpenSecurity')
    await at('Security')
    press('security', 'onBack')
    await at('ProfileHome')
    press('profile', 'onOpenMasterData')
    await at('ProfileMasterData')
    press('masterdata', 'onBack')
    await at('ProfileHome')
  })

  it('WEB-43: the master data opened from the profile carry the year selected in the app, not a default', async () => {
    await open('/app', { onOpenConfirmation: () => {} })
    press('cockpit', 'onYearChange', 2023)
    await waitFor(() => expect(propsOf('cockpit').taxYear).toBe(2023))
    await open('/app/profil')
    press('profile', 'onOpenMasterData')
    await at('ProfileMasterData')
    expect(propsOf('masterdata')).toMatchObject({ taxYear: 2023 })
  })

  it('tells the shell when the user signed out or deleted the account', async () => {
    const onSignedOut = vi.fn()
    await open('/app/profil', { onSignedOut })
    press('profile', 'onSignedOut')
    expect(onSignedOut).toHaveBeenCalledTimes(1)
    press('profile', 'onOpenPrivacy')
    await at('Privacy')
    press('privacy', 'onAccountDeleted')
    expect(onSignedOut).toHaveBeenCalledTimes(2)
  })

  it('turns a guest away from the security page and the master data', async () => {
    signedIn(false)
    renderShell('/app/profil/sicherheit')
    await at('AccountWall')
  })
})

describe('Business', () => {
  it('hands the year, the person and the page to the area, and the payment return of the checkout', async () => {
    await open('/app/steuerjahr/2025/selbststaendig/elster?zahlung=erfolg')
    expect(propsOf('business')).toMatchObject({ taxYear: YEAR, person: 'A', page: 'elster' })
  })

  it('opens a page of the area and goes back to the overview, then home', async () => {
    await open('/app/steuerjahr/2025/selbststaendig')
    press('business', 'onOpenPage', 'bank')
    await at('Business', { page: 'bank' })
    press('business', 'onBack')
    await at('Business')
    expect(currentRoute().params).not.toHaveProperty('page')
    press('business', 'onBack')
    await at('CockpitHome')
  })

  it('opens the overview again from a page, with no page given', async () => {
    await open('/app/steuerjahr/2025/selbststaendig/buch')
    press('business', 'onOpenPage', undefined)
    await at('Business', { year: YEAR })
  })

  it('keeps the partner through the pages, and switches the person from the overview', async () => {
    await open('/app/steuerjahr/2025/selbststaendig')
    press('business', 'onChangePerson', 'B')
    await at('Business', { person: 'B' })
    expect(propsOf('business')).toMatchObject({ person: 'B' })
    press('business', 'onOpenPage', 'buch')
    await at('Business', { person: 'B', page: 'buch' })
    press('business', 'onBack')
    await at('Business', { person: 'B' })
    press('business', 'onChangePerson', 'A')
    await at('Business')
    expect(currentRoute().params).not.toHaveProperty('person')
  })
})

describe('the owl tab and the tab bar', () => {
  it('leaves the owl for the cockpit when it is done, and tells it whether the user is a guest', async () => {
    await open('/app/eule')
    expect(propsOf('owl')).toMatchObject({ isGuest: false, taxYear: defaultTaxYear() })
    press('owl', 'onDone')
    await at('CockpitHome')
  })

  it('calls the user a guest in the owl while they are not signed in', async () => {
    signedIn(false)
    await open('/app/eule')
    expect(propsOf('owl')).toMatchObject({ isGuest: true })
  })

  it('switches tabs by the bar', async () => {
    await open('/app')
    fireEvent.click(screen.getByRole('tab', { name: 'Belege' }))
    expect(await screen.findByTestId('stub-receipts')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Eule' }))
    await at('Owl')
    fireEvent.click(screen.getByRole('tab', { name: 'Verlauf' }))
    await at('HistoryHome')
    fireEvent.click(screen.getByRole('tab', { name: 'Profil' }))
    await at('ProfileHome')
  })

  it('pressing the active Cockpit tab from a deeper route returns to the home, and pops a longer history', async () => {
    await open('/app/steuerjahr/2025/selbststaendig/buch')
    fireEvent.click(screen.getByRole('tab', { name: 'Cockpit' }))
    await at('CockpitHome')
    fireEvent.click(screen.getByRole('tab', { name: 'Cockpit' }))
    await at('CockpitHome')
  })

  it('hides the bar inside the privacy page', async () => {
    await open('/app/profil/datenschutz')
    expect(screen.queryByRole('tab', { name: 'Profil' })).toBeNull()
    expect(currentRoute().name).toBe('Privacy')
  })

  it('hides the bar while a sheet is open, and shows it on the pages', async () => {
    await open('/app/steuerjahr/2025/kapital')
    expect(screen.queryByRole('tab', { name: 'Cockpit' })).toBeNull()
    press('capital', 'onDone')
    expect(await screen.findByRole('tab', { name: 'Cockpit' })).toBeTruthy()
  })
})
