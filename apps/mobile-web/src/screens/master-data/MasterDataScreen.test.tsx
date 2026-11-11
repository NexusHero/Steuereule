import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { LinkResponseDto, MasterDataResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { MasterDataScreen } from './MasterDataScreen'

const LEER: MasterDataResponseDto = {
  geburtsdatum: null,
  strasse: null,
  hausnummer: null,
  hausnummerZusatz: null,
  plz: null,
  wohnort: null,
  beruf: null,
  religion: null,
  familienstand: null,
  familienstandSeit: null,
  iban: null,
  kontoinhaber: null,
  finanzamt: null,
  telefon: null,
  missing: ['geburtsdatum', 'strasse', 'hausnummer', 'plz', 'wohnort', 'religion', 'familienstand', 'iban', 'finanzamt'],
}

function renderScreen(taxYear?: number) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <MasterDataScreen onBack={() => {}} {...(taxYear ? { taxYear } : {})} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function input(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } })
}

afterEach(() => server.resetHandlers())

describe('StammdatenScreen (ADR-0050)', () => {
  it('names how many details the printout still needs', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)))
    renderScreen()
    expect(await screen.findByText('Für den Ausdruck fehlen noch 9 Angaben.')).toBeTruthy()
  })

  it('does not send a religion without the Art. 9 consent tick', async () => {
    let puts = 0
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)),
      http.put('*/v1/stammdaten', () => {
        puts += 1
        return HttpResponse.json(LEER)
      }),
    )
    renderScreen()
    fireEvent.click(await screen.findByText('evangelisch'))
    fireEvent.click(screen.getByTestId('stammdaten-speichern'))

    expect(await screen.findByText('Ohne deine Einwilligung können wir die Religion nicht speichern.')).toBeTruthy()
    expect(puts).toBe(0)
  })

  it('sends German dates as ISO, with consent, and shows the saved state', async () => {
    let body: Record<string, unknown> = {}
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)),
      http.put('*/v1/stammdaten', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...LEER, geburtsdatum: '1990-04-12', religion: 'EV', missing: [] })
      }),
    )
    renderScreen()
    await screen.findByText('Für den Ausdruck fehlen noch 9 Angaben.')
    input('stammdaten-geburtsdatum', '12.4.1990')
    fireEvent.click(screen.getByText('evangelisch'))
    fireEvent.click(screen.getByTestId('stammdaten-einwilligung'))
    fireEvent.click(screen.getByTestId('stammdaten-speichern'))

    await waitFor(() => expect(body).toMatchObject({ geburtsdatum: '1990-04-12', religion: 'EV', religionConsent: true }))
    expect(await screen.findByText('Gespeichert.')).toBeTruthy()
    expect(await screen.findByText('Alles da für den Ausdruck.')).toBeTruthy()
  })

  it('a rejected save (e.g. wrong IBAN) is named, not swallowed', async () => {
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)),
      http.put('*/v1/stammdaten', () => HttpResponse.json({ message: ['iban is not a valid IBAN'] }, { status: 400 })),
    )
    renderScreen()
    await screen.findByText('Für den Ausdruck fehlen noch 9 Angaben.')
    input('stammdaten-iban', 'DE00')
    fireEvent.click(screen.getByTestId('stammdaten-speichern'))
    expect(await screen.findByText('Bitte prüf deine Eingaben — z. B. Datum, Postleitzahl oder IBAN.')).toBeTruthy()
  })

  describe('Kopplung (Zusammenveranlagung)', () => {
    const MARRIED: MasterDataResponseDto = { ...LEER, familienstand: 'verheiratet' }
    const JOINT: LinkResponseDto = {
      filingType: 'zusammen',
      personBUserId: 'spouse_user-a_2025',
      invitationCode: '9F3A0C71B2E4D658',
      personBHasOwnAccount: false,
      personB: { firstName: 'Bea', lastName: 'Muster', steuerId: null, geburtsdatum: null, religion: null, beruf: null },
    }

    it('lets Person A fill in a partner who has no own account yet', async () => {
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
        http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json(JOINT)),
      )
      renderScreen()
      expect(await screen.findByTestId('personb-vorname')).toBeTruthy()
    })

    it('names how long the invite code is valid, and when it has expired', async () => {
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
        http.get('*/v1/steuerjahre/:jahr/kopplung', () =>
          HttpResponse.json({ ...JOINT, invitationCodeValidUntil: '2999-01-14T10:00:00.000Z' }),
        ),
      )
      renderScreen()
      expect(await screen.findByText('Einladungscode für Partner-Account: 9F3A0C71B2E4D658 (gültig bis 14.01.2999)')).toBeTruthy()
    })

    it('says an expired invite code is expired instead of showing it', async () => {
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
        http.get('*/v1/steuerjahre/:jahr/kopplung', () =>
          HttpResponse.json({ ...JOINT, invitationCodeValidUntil: '2000-01-01T00:00:00.000Z' }),
        ),
      )
      renderScreen()
      expect(await screen.findByText(/Einladungscode ist abgelaufen/)).toBeTruthy()
      expect(screen.queryByText(/9F3A0C71B2E4D658/)).toBeNull()
    })

    it("opens the partner's masks while the partner has no own account", async () => {
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
        http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json(JOINT)),
      )
      const opened: string[] = []
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      render(
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={createAppI18n('de')}>
            <ThemeProvider mode="light">
              <MasterDataScreen onBack={() => {}} taxYear={2025} onRecordPartner={(area, name) => opened.push(`${area}:${name}`)} />
            </ThemeProvider>
          </I18nextProvider>
        </QueryClientProvider>,
      )
      fireEvent.click(await screen.findByText('Lohnsteuerbescheinigung von Bea erfassen'))
      fireEvent.click(screen.getByText('Arbeitsweg von Bea erfassen'))
      expect(opened).toEqual(['lstb:Bea', 'arbeitsweg:Bea'])
    })

    it('sets the Veranlagungsart for the tax year the cockpit shows, not the current one', async () => {
      const set: string[] = []
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
        http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json({ filingType: 'keine' })),
        http.put('*/v1/steuerjahre/:jahr/kopplung', ({ params }) => {
          set.push(String(params.jahr))
          return HttpResponse.json(JOINT)
        }),
      )
      renderScreen(2025)
      expect(await screen.findByText(/Veranlagungsart 2025/)).toBeTruthy()
      fireEvent.click(screen.getByTestId('kopplung-zusammen'))
      await waitFor(() => expect(set).toEqual(['2025']))
    })

    it('lets the invited partner redeem the code, and says plainly when it is unknown', async () => {
      const codes: string[] = []
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
        http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json({ filingType: 'keine' })),
        http.post('*/v1/steuerjahre/:jahr/kopplung/beitreten/:code', ({ params }) => {
          codes.push(`${String(params.jahr)}:${String(params.code)}`)
          return HttpResponse.json({ code: 'INVITATION_CODE_INVALID', message: 'The invitation code is invalid.' }, { status: 404 })
        }),
      )
      renderScreen(2025)
      fireEvent.change(await screen.findByTestId('kopplung-code'), { target: { value: ' c39b4e995366e74a ' } })
      fireEvent.click(screen.getByTestId('kopplung-beitreten'))

      await waitFor(() => expect(codes).toEqual(['2025:C39B4E995366E74A']))
      expect(await screen.findByText('Diesen Code kennen wir nicht. Prüf die Schreibweise.')).toBeTruthy()
    })

    it("shows a joined partner's data read-only — it is theirs to change", async () => {
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
        http.get('*/v1/steuerjahre/:jahr/kopplung', () =>
          HttpResponse.json({ ...JOINT, personBUserId: 'user-b', invitationCode: null, personBHasOwnAccount: true }),
        ),
      )
      renderScreen()
      expect(await screen.findByText(/Bea Muster pflegt die Angaben im eigenen Konto/)).toBeTruthy()
      expect(screen.queryByTestId('personb-vorname')).toBeNull()
      expect(screen.queryByTestId('personb-speichern')).toBeNull()
    })
  })

  it('gives every text field a name screen readers can announce', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)))
    renderScreen()

    expect(await screen.findByLabelText('Geburtsdatum (TT.MM.JJJJ)')).toBeTruthy()
    expect(screen.getByLabelText('IBAN für die Erstattung')).toBeTruthy()
    expect(screen.getByLabelText('Zuständiges Finanzamt')).toBeTruthy()
  })

  it('uses numeric keyboard mode for numeric master-data inputs', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)))
    renderScreen()

    const hausnummer = await screen.findByTestId('stammdaten-hausnummer')
    const plz = screen.getByTestId('stammdaten-plz')
    expect(hausnummer.getAttribute('inputmode')).toBe('numeric')
    expect(plz.getAttribute('inputmode')).toBe('numeric')
  })
})

describe('StammdatenScreen PLZ → Ort (#451 slice 3)', () => {
  it('fills the Ort from a one-place postal code, marks it and shows Bundesland and church tax rate', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)))
    renderScreen()
    await screen.findByTestId('stammdaten-plz')
    fireEvent.click(screen.getByText('römisch-katholisch'))
    input('stammdaten-plz', '80331')
    expect((screen.getByTestId('stammdaten-wohnort') as HTMLInputElement).value).toBe('München')
    expect(screen.getByTestId('stammdaten-ort-aus-plz').textContent).toBe('aus deiner PLZ')
    expect(screen.getByTestId('stammdaten-bundesland').textContent).toContain('Bayern')
    expect(screen.getByTestId('stammdaten-kirchensteuersatz').textContent).toBe('Kirchensteuersatz in Bayern: 8 %')
  })

  it('keeps the prefilled Ort changeable and drops the mark once the user edits it', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)))
    renderScreen()
    await screen.findByTestId('stammdaten-plz')
    input('stammdaten-plz', '10115')
    input('stammdaten-wohnort', 'Berlin-Mitte')
    expect(screen.queryByTestId('stammdaten-ort-aus-plz')).toBeNull()
    input('stammdaten-plz', '80331')
    expect((screen.getByTestId('stammdaten-wohnort') as HTMLInputElement).value).toBe('Berlin-Mitte')
  })

  it('offers a choice when the postal code has several places', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)))
    renderScreen()
    await screen.findByTestId('stammdaten-plz')
    input('stammdaten-plz', '21039')
    expect(screen.getByTestId('stammdaten-plz-auswahl')).toBeTruthy()
    expect(screen.queryByTestId('stammdaten-bundesland')).toBeNull()
    fireEvent.click(screen.getByText('Escheburg'))
    expect((screen.getByTestId('stammdaten-wohnort') as HTMLInputElement).value).toBe('Escheburg')
    expect(screen.queryByTestId('stammdaten-plz-auswahl')).toBeNull()
    expect(screen.getByTestId('stammdaten-bundesland').textContent).toContain('Schleswig-Holstein')
  })

  it('says so when the postal code is not in the table', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)))
    renderScreen()
    await screen.findByTestId('stammdaten-plz')
    input('stammdaten-plz', '00000')
    expect(screen.getByTestId('stammdaten-plz-unbekannt')).toBeTruthy()
  })
})

describe('StammdatenScreen address search (ADR-0064)', () => {
  const value = (testId: string) => (screen.getByTestId(testId) as HTMLInputElement).value

  it('fills street, house number, postal code and place from one picked suggestion', async () => {
    let asked: unknown = null
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)),
      http.post('*/v1/adressen/suche', async ({ request }) => {
        asked = await request.json()
        return HttpResponse.json({
          available: true,
          houseNumber: '12a',
          hits: [
            { street: 'Hauptstraße', postalCode: '50667', city: 'Köln', state: 'NW' },
            { street: 'Hauptstraße', postalCode: '51143', city: 'Köln', state: 'NW' },
          ],
        })
      }),
    )
    renderScreen()
    await screen.findByTestId('stammdaten-adresssuche')
    input('stammdaten-adresssuche', 'Hauptstr. 12a, Köln')

    const first = await screen.findByTestId('stammdaten-adresssuche-treffer-0')
    expect(first.textContent).toBe('Hauptstraße 12a, 50667 Köln')
    expect(asked).toEqual({ query: 'Hauptstr. 12a, Köln' })
    fireEvent.click(first)

    expect(value('stammdaten-strasse')).toBe('Hauptstraße')
    expect(value('stammdaten-hausnummer')).toBe('12')
    expect(value('stammdaten-hausnummerZusatz')).toBe('a')
    expect(value('stammdaten-plz')).toBe('50667')
    expect(value('stammdaten-wohnort')).toBe('Köln')
    expect(value('stammdaten-adresssuche')).toBe('')
    expect(screen.queryByTestId('stammdaten-adresssuche-treffer-0')).toBeNull()
  })

  it('sends the postal code the form already holds and keeps a typed house number when the search found none', async () => {
    let asked: unknown = null
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json({ ...LEER, plz: '50667', hausnummer: '7' })),
      http.post('*/v1/adressen/suche', async ({ request }) => {
        asked = await request.json()
        return HttpResponse.json({ available: true, houseNumber: null, hits: [{ street: 'Domkloster', postalCode: '50667', city: 'Köln', state: 'NW' }] })
      }),
    )
    renderScreen()
    await screen.findByTestId('stammdaten-adresssuche')
    input('stammdaten-adresssuche', 'Domkl')
    fireEvent.click(await screen.findByTestId('stammdaten-adresssuche-treffer-0'))
    expect(asked).toEqual({ query: 'Domkl', postalCode: '50667' })
    expect(value('stammdaten-strasse')).toBe('Domkloster')
    expect(value('stammdaten-hausnummer')).toBe('7')
  })

  it('does not ask the server for fewer than three characters', async () => {
    let calls = 0
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)),
      http.post('*/v1/adressen/suche', () => {
        calls += 1
        return HttpResponse.json({ available: true, houseNumber: null, hits: [] })
      }),
    )
    renderScreen()
    await screen.findByTestId('stammdaten-adresssuche')
    input('stammdaten-adresssuche', 'Ha')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(calls).toBe(0)
  })

  it('says so when nothing was found, and when the search is not available', async () => {
    let available = true
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)),
      http.post('*/v1/adressen/suche', () => HttpResponse.json({ available, houseNumber: null, hits: [] })),
    )
    renderScreen()
    await screen.findByTestId('stammdaten-adresssuche')
    input('stammdaten-adresssuche', 'Gibtesnicht')
    expect(await screen.findByText('Keine passende Straße gefunden. Trag die Adresse bitte unten ein.')).toBeTruthy()

    available = false
    input('stammdaten-adresssuche', 'Gibtesnichtx')
    expect(await screen.findByText('Die Adresssuche ist gerade nicht verfügbar. Trag die Adresse bitte unten ein.')).toBeTruthy()
  })

  it('stays usable when the request fails', async () => {
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)),
      http.post('*/v1/adressen/suche', () => HttpResponse.error()),
    )
    renderScreen()
    await screen.findByTestId('stammdaten-adresssuche')
    input('stammdaten-adresssuche', 'Hauptstr')
    expect(await screen.findByText('Die Adresssuche ist gerade nicht verfügbar. Trag die Adresse bitte unten ein.')).toBeTruthy()
  })
})

describe('StammdatenScreen date fields', () => {
  it('sets the dots of the birth date while typing and saves it as ISO', async () => {
    let sent: unknown = null
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)),
      http.put('*/v1/stammdaten', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ...LEER, geburtsdatum: '1990-04-12' })
      }),
    )
    renderScreen()
    const field = (await screen.findByTestId('stammdaten-geburtsdatum')) as HTMLInputElement
    input('stammdaten-geburtsdatum', '12041990')
    expect(field.value).toBe('12.04.1990')
    expect(field.getAttribute('autocomplete')).toBe('bday')
    fireEvent.click(screen.getByTestId('stammdaten-speichern'))
    await screen.findByText('Gespeichert.')
    expect((sent as { geburtsdatum: string }).geburtsdatum).toBe('1990-04-12')
  })

  it('takes a birth date picked in the calendar, which offers no day after today', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)))
    renderScreen()
    await screen.findByTestId('stammdaten-geburtsdatum')
    const calendar = screen.getByTestId('stammdaten-geburtsdatum-kalender')
    expect(calendar.getAttribute('max')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    fireEvent.change(calendar, { target: { value: '1990-04-12' } })
    expect((screen.getByTestId('stammdaten-geburtsdatum') as HTMLInputElement).value).toBe('12.04.1990')
  })
})

describe('StammdatenScreen house number', () => {
  const value = (testId: string) => (screen.getByTestId(testId) as HTMLInputElement).value

  it('moves the letter of "12a" into the Zusatz field', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)))
    renderScreen()
    await screen.findByTestId('stammdaten-hausnummer')
    input('stammdaten-hausnummer', '12a')
    expect(value('stammdaten-hausnummer')).toBe('12')
    expect(value('stammdaten-hausnummerZusatz')).toBe('a')
  })

  it('leaves a Zusatz that is already there alone', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json({ ...LEER, hausnummerZusatz: 'Hinterhaus' })))
    renderScreen()
    await screen.findByTestId('stammdaten-hausnummer')
    input('stammdaten-hausnummer', '12a')
    expect(value('stammdaten-hausnummer')).toBe('12a')
    expect(value('stammdaten-hausnummerZusatz')).toBe('Hinterhaus')
  })
})

describe('StammdatenScreen Finanzamt suggestion', () => {
  const office = () => (screen.getByTestId('stammdaten-finanzamt') as HTMLInputElement).value

  it('suggests the Finanzamt of the postal code and takes it on a click', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)))
    renderScreen()
    await screen.findByTestId('stammdaten-plz')
    expect(screen.queryByTestId('stammdaten-finanzamt-vorschlaege')).toBeNull()
    input('stammdaten-plz', '79539')
    expect(screen.getByTestId('stammdaten-finanzamt-vorschlaege').textContent).toContain('Vorschlag aus deiner Postleitzahl')
    fireEvent.click(screen.getByTestId('stammdaten-finanzamt-vorschlag-0'))
    expect(office()).toBe('Finanzamt Lörrach')
    expect(screen.queryByTestId('stammdaten-finanzamt-vorschlaege')).toBeNull()
  })

  it('offers every Finanzamt of a split postal code and says that the user has to choose', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json({ ...LEER, plz: '50667' })))
    renderScreen()
    const box = await screen.findByTestId('stammdaten-finanzamt-vorschlaege')
    expect(box.textContent).toContain('teilen sich mehrere Finanzämter')
    expect(screen.getByTestId('stammdaten-finanzamt-vorschlag-0').textContent).toBe('Finanzamt Köln-Altstadt')
    expect(screen.getByTestId('stammdaten-finanzamt-vorschlag-1').textContent).toBe('Finanzamt Köln-Mitte')
  })

  it('never replaces a Finanzamt the user typed, it only keeps offering', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json({ ...LEER, plz: '79539', finanzamt: 'Finanzamt Freiburg-Stadt' })))
    renderScreen()
    await screen.findByTestId('stammdaten-finanzamt-vorschlaege')
    expect(office()).toBe('Finanzamt Freiburg-Stadt')
  })
})

describe('StammdatenScreen IBAN mask', () => {
  it('shows a stored IBAN in blocks of four', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json({ ...LEER, iban: 'DE89370400440532013000' })))
    renderScreen()
    const field = (await screen.findByTestId('stammdaten-iban')) as HTMLInputElement
    expect(field.value).toBe('DE89 3704 0044 0532 0130 00')
  })

  it('groups and upper-cases while typing, and says when the check digits fit', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)))
    renderScreen()
    await screen.findByTestId('stammdaten-iban')
    input('stammdaten-iban', 'de8937040044')
    expect((screen.getByTestId('stammdaten-iban') as HTMLInputElement).value).toBe('DE89 3704 0044')
    expect(screen.getByTestId('stammdaten-iban-pruefung').textContent).toBe('Die IBAN ist noch nicht vollständig.')
    input('stammdaten-iban', 'de89370400440532013000')
    expect(screen.getByTestId('stammdaten-iban-pruefung').textContent).toBe('Die IBAN ist gültig.')
  })

  it('names a wrong IBAN before saving', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)))
    renderScreen()
    await screen.findByTestId('stammdaten-iban')
    input('stammdaten-iban', 'DE89370400440532013001')
    expect(screen.getByTestId('stammdaten-iban-pruefung').textContent).toBe('Diese IBAN stimmt nicht. Bitte prüf die Ziffern.')
  })

  it('saves the IBAN without the display spaces', async () => {
    let sent: unknown = null
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)),
      http.put('*/v1/stammdaten', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ...LEER, iban: 'DE89370400440532013000' })
      }),
    )
    renderScreen()
    await screen.findByTestId('stammdaten-iban')
    input('stammdaten-iban', 'de89 3704 0044 0532 0130 00')
    fireEvent.click(screen.getByTestId('stammdaten-speichern'))
    await screen.findByText('Gespeichert.')
    expect((sent as { iban: string }).iban).toBe('DE89370400440532013000')
  })
})

describe('StammdatenScreen small helpers (#452 slice 5)', () => {
  it('names the bank of a German IBAN offline (AC 8)', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)))
    renderScreen()
    await screen.findByTestId('stammdaten-iban')
    input('stammdaten-iban', 'DE89 3704 0044 0532 0130 00')
    expect(screen.getByTestId('stammdaten-iban-bank').textContent).toMatch(/Commerzbank.*aus der IBAN/)
  })

  it('checks the partner’s Steuer-ID while typing, without blocking (AC 9)', async () => {
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json({ ...LEER, familienstand: 'verheiratet' })),
      http.get('*/v1/steuerjahre/:jahr/kopplung', () =>
        HttpResponse.json({ filingType: 'zusammen', personBUserId: 'spouse_x', invitationCode: null, invitationCodeValidUntil: null, personBHasOwnAccount: false, personB: null }),
      ),
    )
    renderScreen(2025)
    const field = await screen.findByTestId('personb-steuerid')
    fireEvent.change(field, { target: { value: '86095742718' } })
    expect(screen.getByTestId('personb-steuerid-hinweis')).toBeTruthy()
    fireEvent.change(field, { target: { value: '86095742719' } })
    expect(screen.queryByTestId('personb-steuerid-hinweis')).toBeNull()
  })

  it('shows a lasting spouse link and offers to end it from this year (AC 2)', async () => {
    let ended = 0
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json({ ...LEER, familienstand: 'verheiratet' })),
      http.get('*/v1/steuerjahre/:jahr/kopplung', () =>
        HttpResponse.json({ filingType: 'zusammen', personBUserId: 'user-b', invitationCode: null, invitationCodeValidUntil: null, personBHasOwnAccount: true, personB: null }),
      ),
      http.get('*/v1/steuerjahre/:jahr/haushalt', () =>
        HttpResponse.json({ householdUserId: 'u', persons: [], candidates: [], partnerLink: { validFromYear: 2025, endedFromYear: null, ownAccount: true } }),
      ),
      http.post('*/v1/steuerjahre/2026/haushalt/partner/nicht-mehr-dabei', () => {
        ended += 1
        return HttpResponse.json({ householdUserId: 'u', persons: [], candidates: [], partnerLink: { validFromYear: 2025, endedFromYear: 2026, ownAccount: true } })
      }),
    )
    renderScreen(2026)
    expect((await screen.findByTestId('kopplung-verknuepft')).textContent).toContain('seit 2025')
    fireEvent.click(screen.getByTestId('kopplung-beenden'))
    await waitFor(() => expect(ended).toBe(1))
  })
})
