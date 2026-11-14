import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, DateInput, Feld, Input, Option, useBreakpoint, useTheme, type InputAutoComplete } from '@steuereule/ui'
import {
  bankNameForIban, checkIban, suggestTaxOffices, formatGermanDate, formatIban, MARITAL_STATUSES, RELIGION_KEYS } from '@steuereule/core'
import {
  getLinkControllerGetQueryKey,
  useLinkControllerGet,
  useLinkControllerSet,
  useLinkControllerJoinWithCode,
  useLinkControllerUpdatePersonB,
  useMasterDataControllerRead,
  useMasterDataControllerSave,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { makePrivacyStyles } from '../privacy/styles'
import { ErrorState, LoadingState } from '../shared/ScreenState'
import { triggerSaveErrorHaptic, warnOnHttpError } from '../shared/saveFeedback'
import { germanToIso, isoToGerman, toDraft, zuPutDto, type MasterDataDraft } from './masterDataMapping'
import { PostalCodeHint } from '../shared/PostalCodeHint'
import { TaxIdHint } from '../shared/TaxIdHint'
import { PartnerLinkStatus } from './PartnerLinkStatus'
import { prefillCity } from '../shared/postalCodePrefill'
import { AddressSearch } from '../shared/AddressSearch'
import { todayIso } from '../shared/today'

export interface MasterDataScreenProps {
  readonly onBack: () => void
  /** The Veranlagungsart and the partner belong to one tax year — the one the cockpit shows. */
  readonly taxYear?: number
  /** Opens a regular mask for the partner's figures — only while the partner has no own account. */
  readonly onRecordPartner?: (area: 'lstb' | 'arbeitsweg', name: string) => void
}

type TextField = Exclude<keyof MasterDataDraft, 'religion' | 'religionConsent' | 'familienstand'>

/** The user's own address and birth date come from the browser's autofill (#451 slice 2). */
const MASTER_DATA_AUTOFILL: Partial<Record<TextField, InputAutoComplete>> = {
  geburtsdatum: 'bday',
  strasse: 'address-line1',
  plz: 'postal-code',
  wohnort: 'address-level2',
}

/** Shows the grouping the mask produces; zeros so nobody mistakes it for a real account. */
const IBAN_PLACEHOLDER = 'DE00 0000 0000 0000 0000 00'

export function MasterDataScreen({ onBack, taxYear = CURRENT_TAX_YEAR, onRecordPartner }: MasterDataScreenProps) {
  const bp = useBreakpoint()
  const theme = useTheme()
  const styles = makePrivacyStyles(theme)
  const { t } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useMasterDataControllerRead()
  const save = useMasterDataControllerSave()
  const [draft, setDraft] = useState<MasterDataDraft | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'fehler'; text: string } | null>(null)
  const [cityPrefill, setCityPrefill] = useState<string | null>(null)

  if (query.isPending) return <LoadingState bp={bp} label={t('stammdaten.loading')} />
  if (query.isError || query.data?.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={t('stammdaten.loadError.heading')}
        message={t('stammdaten.loadError.message')}
        retryLabel={t('stammdaten.loadError.retry')}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const status = query.data.data
  const form = draft ?? toDraft(status)
  const set = (patch: Partial<MasterDataDraft>) => {
    setMessage(null)
    const next = { ...form, ...patch }
    // "12a" typed or pasted into the number belongs in two fields; a Zusatz already there is kept.
    const numberWithSuffix = patch.hausnummer !== undefined ? /^(\d+)\s*([a-zA-Z])$/.exec(patch.hausnummer.trim()) : null
    if (numberWithSuffix && next.hausnummerZusatz.trim() === '') {
      next.hausnummer = numberWithSuffix[1]!
      next.hausnummerZusatz = numberWithSuffix[2]!
    }
    if (patch.plz !== undefined) {
      // #451 slice 3: a postal code with one place fills the Ort; a typed Ort is never overwritten.
      const { city, prefill } = prefillCity({ plz: next.plz, city: next.wohnort, lastPrefill: cityPrefill })
      next.wohnort = city
      setCityPrefill(prefill)
    }
    setDraft(next)
  }
  const ibanCheck = checkIban(form.iban)
  // Offered until the field holds one of them; a Finanzamt the user typed themselves is never replaced.
  const taxOfficesOfPostalCode = suggestTaxOffices(form.plz)
  const taxOfficeSuggestions = taxOfficesOfPostalCode.includes(form.finanzamt.trim()) ? [] : taxOfficesOfPostalCode
  const textField = (field: TextField, type: 'text' | 'numeric' = 'text') => (
    <Feld label={t(`stammdaten.${field}`)}>
      <Input
        type={type}
        value={form[field]}
        onChange={(value) => set({ [field]: value })}
        accessibilityLabel={t(`stammdaten.${field}`)}
        {...(MASTER_DATA_AUTOFILL[field] ? { autoComplete: MASTER_DATA_AUTOFILL[field] } : {})}
        testID={`stammdaten-${field}`}
      />
    </Feld>
  )

  const dateField = (field: 'geburtsdatum' | 'familienstandSeit') => (
    <Feld label={t(`stammdaten.${field}`)}>
      <DateInput
        value={form[field]}
        onChange={(value) => set({ [field]: value })}
        calendarLabel={t('datum.kalender')}
        accessibilityLabel={t(`stammdaten.${field}`)}
        max={todayIso()}
        {...(field === 'geburtsdatum' ? { autoComplete: 'bday' as const } : {})}
        testID={`stammdaten-${field}`}
      />
    </Feld>
  )

  function submit() {
    if (form.religion !== null && !form.religionConsent) {
      triggerSaveErrorHaptic()
      setMessage({ kind: 'fehler', text: t('stammdaten.saveError.einwilligung') })
      return
    }
    save.mutate(
      { data: zuPutDto(form) },
      {
        onSuccess: (response) => {
          if (response.status === 200) {
            queryClient.setQueryData(query.queryKey, response)
            setDraft(null)
            setMessage({ kind: 'ok', text: t('stammdaten.gespeichert') })
          } else {
            triggerSaveErrorHaptic()
            setMessage({ kind: 'fehler', text: t('stammdaten.saveError.validation') })
          }
        },
        onError: () => {
          triggerSaveErrorHaptic()
          setMessage({ kind: 'fehler', text: t('stammdaten.saveError.network') })
        },
      },
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.appbar}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('stammdaten.back')} onPress={onBack} style={styles.backButton} testID="stammdaten-zurueck">
          <Text style={styles.backGlyph}>←</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t('stammdaten.title')}</Text>
      </View>
      <Text style={styles.sectionBody}>{t('stammdaten.intro')}</Text>
      <Text style={styles.hint} accessibilityLiveRegion="polite">
        {status.missing.length === 0 ? t('stammdaten.vollstaendig') : t('stammdaten.fehlendHinweis', { anzahl: status.missing.length })}
      </Text>

      {dateField('geburtsdatum')}
      {textField('beruf')}
      <AddressSearch
        postalCode={form.plz}
        testIDPrefix="stammdaten"
        onPick={(address) => {
          // The picked place is the user's choice, so the PLZ prefill must not treat the Ort as its own.
          setCityPrefill(null)
          set({
            strasse: address.street,
            plz: address.postalCode,
            wohnort: address.city,
            // A house number typed into the search wins; without one, what the form holds stays.
            ...(address.houseNumber !== null ? { hausnummer: address.houseNumber, hausnummerZusatz: address.houseNumberSuffix ?? '' } : {}),
          })
        }}
      />
      {textField('strasse')}
      <View style={{ flexDirection: 'row', gap: theme.space.s3 }}>
        <View style={{ flex: 1 }}>{textField('hausnummer', 'numeric')}</View>
        <View style={{ flex: 1 }}>{textField('hausnummerZusatz')}</View>
      </View>
      {textField('plz', 'numeric')}
      {textField('wohnort')}
      <PostalCodeHint
        plz={form.plz}
        city={form.wohnort}
        prefill={cityPrefill}
        onChooseCity={(city) => {
          set({ wohnort: city })
          setCityPrefill(city)
        }}
        testIDPrefix="stammdaten"
        showState
        churchMember={form.religion !== null && form.religion !== 'VD'}
      />

      <Feld label={t('stammdaten.familienstand')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.s2 }}>
          {MARITAL_STATUSES.map((status_) => (
            <Chip key={status_} active={form.familienstand === status_} onPress={() => set({ familienstand: status_ })} testID={`stammdaten-familienstand-${status_}`}>
              {t(`stammdaten.familienstaende.${status_}`)}
            </Chip>
          ))}
        </View>
      </Feld>
      {form.familienstand !== null && form.familienstand !== 'ledig' ? dateField('familienstandSeit') : null}
      {form.familienstand === 'verheiratet' ? <TaxYearLinkSection taxYear={taxYear} {...(onRecordPartner ? { onRecordPartner } : {})} /> : null}

      <Feld label={t('stammdaten.religion')}>
        <Text style={styles.hint}>{t('stammdaten.religionHinweis')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.s2, marginTop: theme.space.s2 }}>
          {RELIGION_KEYS.map((key) => (
            <Chip key={key} active={form.religion === key} onPress={() => set({ religion: key })} testID={`stammdaten-religion-${key}`}>
              {t(`stammdaten.religionen.${key}`)}
            </Chip>
          ))}
        </View>
      </Feld>
      {form.religion !== null ? (
        <Option
          selected={form.religionConsent}
          onPress={() => set({ religionConsent: !form.religionConsent })}
          testID="stammdaten-einwilligung"
        >
          {t('stammdaten.einwilligung')}
        </Option>
      ) : null}

      <Feld label={t('stammdaten.iban')}>
        <Input
          mono
          autoCapitalize="characters"
          value={form.iban}
          onChange={(value) => set({ iban: formatIban(value) })}
          placeholder={IBAN_PLACEHOLDER}
          accessibilityLabel={t('stammdaten.iban')}
          testID="stammdaten-iban"
        />
      </Feld>
      {ibanCheck !== 'empty' ? (
        <Text style={ibanCheck === 'invalid' ? styles.errorNote : styles.hint} accessibilityLiveRegion="polite" testID="stammdaten-iban-pruefung">
          {t(`stammdaten.ibanPruefung.${ibanCheck}`)}
        </Text>
      ) : null}
      {bankNameForIban(form.iban) ? (
        <Text style={styles.hint} testID="stammdaten-iban-bank">
          {t('stammdaten.bankAusIban', { bank: bankNameForIban(form.iban) })}
        </Text>
      ) : null}
      {textField('kontoinhaber')}
      {textField('finanzamt')}
      {taxOfficeSuggestions.length > 0 ? (
        <View style={{ gap: theme.space.s2, marginTop: -theme.space.s2, marginBottom: theme.space.s3 }} testID="stammdaten-finanzamt-vorschlaege">
          <Text style={styles.hint}>{t(taxOfficeSuggestions.length === 1 ? 'stammdaten.finanzamtVorschlag.einer' : 'stammdaten.finanzamtVorschlag.mehrere')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.s2 }}>
            {taxOfficeSuggestions.map((office, index) => (
              <Chip key={office} active={false} onPress={() => set({ finanzamt: office })} testID={`stammdaten-finanzamt-vorschlag-${index}`}>
                {office}
              </Chip>
            ))}
          </View>
        </View>
      ) : null}
      {textField('telefon')}

      {message ? (
        <Text style={message.kind === 'ok' ? styles.successNote : styles.errorNote} accessibilityLiveRegion="polite">
          {message.text}
        </Text>
      ) : null}
      <View style={styles.buttonSpacer}>
        <Button onPress={submit} disabled={save.isPending} testID="stammdaten-speichern">
          {t('stammdaten.speichern')}
        </Button>
      </View>
    </ScrollView>
  )
}

function invitationNotice(code: string, validUntil: string | null): string {
  if (validUntil !== null && new Date(validUntil) <= new Date()) {
    return 'Der Einladungscode ist abgelaufen — wähle erneut Zusammenveranlagung für einen neuen.'
  }
  const to = validUntil ? ` (gültig bis ${formatGermanDate(validUntil.slice(0, 10))})` : ''
  return `Einladungscode für Partner-Account: ${code}${to}`
}

function TaxYearLinkSection({
  taxYear,
  onRecordPartner,
}: {
  readonly taxYear: number
  readonly onRecordPartner?: (area: 'lstb' | 'arbeitsweg', name: string) => void
}) {
  const theme = useTheme()
  const { t } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const linkQuery = useLinkControllerGet(taxYear)
  const setLink = useLinkControllerSet()
  const updatePersonB = useLinkControllerUpdatePersonB()
  const join = useLinkControllerJoinWithCode()
  const [code, setCode] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)

  const current = linkQuery.data?.status === 200 ? linkQuery.data.data : null
  const filingType = current?.filingType ?? 'keine'
  const personB = current?.personB
  const partnerDisplayName = personB?.firstName || 'deinem Partner'

  const [firstNameB, setFirstNameB] = useState(personB?.firstName ?? '')
  const [lastNameB, setLastNameB] = useState(personB?.lastName ?? '')
  const [taxIdB, setTaxIdB] = useState(personB?.steuerId ?? '')
  const [birthDateB, setBirthDateB] = useState(personB?.geburtsdatum ?? '')
  const [occupationB, setOccupationB] = useState(personB?.beruf ?? '')

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getLinkControllerGetQueryKey(taxYear) })
  }

  const selectKind = (kind: 'zusammen' | 'einzel') => {
    setLink.mutate(
      { jahr: taxYear, data: { filingType: kind } },
      {
        onSuccess: (res) => {
          warnOnHttpError(res.status)
          invalidate()
        },
        onError: triggerSaveErrorHaptic,
      },
    )
  }

  const redeemCode = () => {
    const cleaned = code.trim().toUpperCase()
    if (cleaned === '') return
    setJoinError(null)
    join.mutate(
      { jahr: taxYear, code: cleaned },
      {
        onSuccess: (answer) => {
          if (answer.status === 200) {
            setCode('')
            invalidate()
          } else {
            triggerSaveErrorHaptic()
            setJoinError(joinErrorText(answer.data))
          }
        },
        onError: () => {
          triggerSaveErrorHaptic()
          setJoinError('Das hat nicht geklappt. Prüf die Verbindung und versuch es noch mal.')
        },
      },
    )
  }

  const savePersonB = () => {
    updatePersonB.mutate(
      {
        jahr: taxYear,
        data: {
          firstName: firstNameB || null,
          lastName: lastNameB || null,
          steuerId: taxIdB || null,
          geburtsdatum: birthDateB ? germanToIso(birthDateB) : null,
          beruf: occupationB || null,
        },
      },
      {
        onSuccess: (res) => {
          warnOnHttpError(res.status)
          invalidate()
        },
        onError: triggerSaveErrorHaptic,
      },
    )
  }

  const joinBlock = (
    <View>
      <Text style={{ ...theme.type.small, color: theme.color.tinte2, marginBottom: theme.space.s2 }}>
        {`Dein Partner hat die Zusammenveranlagung ${taxYear} schon angelegt? Dann gib hier den Einladungscode ein – ihr gebt dann eine gemeinsame Erklärung ab.`}
      </Text>
      <Feld label="Einladungscode deines Partners">
        <Input value={code} onChange={setCode} testID="kopplung-code" accessibilityLabel="Einladungscode deines Partners" />
      </Feld>
      {joinError ? <Text style={{ ...theme.type.small, color: theme.color.tinte }}>{joinError}</Text> : null}
      <Button variant="ghost" onPress={redeemCode} testID="kopplung-beitreten">
        Einladung annehmen
      </Button>
    </View>
  )

  return (
    <Card style={{ marginVertical: theme.space.s3, padding: theme.space.s4 }}>
      <Feld label={`Veranlagungsart ${taxYear} & Partner (Person B, Zeile 19–24 ESt 1 A)`}>
        <View style={{ flexDirection: 'row', gap: theme.space.s2, marginBottom: theme.space.s3 }}>
          <Chip active={filingType === 'zusammen'} onPress={() => selectKind('zusammen')} testID="kopplung-zusammen">
            Zusammenveranlagung
          </Chip>
          <Chip active={filingType === 'einzel'} onPress={() => selectKind('einzel')} testID="kopplung-einzel">
            Einzelveranlagung
          </Chip>
        </View>
      </Feld>
      <PartnerLinkStatus taxYear={taxYear} onChanged={invalidate} />
      {filingType === 'zusammen' && current?.personBHasOwnAccount ? (
        <Text style={{ ...theme.type.small, color: theme.color.tinte2 }}>
          {`${[personB?.firstName, personB?.lastName].filter(Boolean).join(' ') || 'Person B'} pflegt die Angaben im eigenen Konto.`}
        </Text>
      ) : filingType === 'zusammen' ? (
        <View>
          {current?.invitationCode ? (
            <Text style={{ ...theme.type.meta, color: theme.color.tinte2, marginBottom: theme.space.s2 }} testID="kopplung-code-anzeige">
              {invitationNotice(current.invitationCode, current.invitationCodeValidUntil ?? null)}
            </Text>
          ) : null}
          <Feld label="Vorname Partner (Person B)">
            <Input value={firstNameB || (personB?.firstName ?? '')} onChange={setFirstNameB} autoComplete="off" testID="personb-vorname" />
          </Feld>
          <Feld label="Nachname Partner (Person B)">
            <Input value={lastNameB || (personB?.lastName ?? '')} onChange={setLastNameB} autoComplete="off" testID="personb-nachname" />
          </Feld>
          <Feld label="Steuer-ID Partner (11 Ziffern)">
            <Input type="numeric" value={taxIdB || (personB?.steuerId ?? '')} onChange={setTaxIdB} testID="personb-steuerid" />
            <TaxIdHint value={taxIdB} testID="personb-steuerid-hinweis" />
          </Feld>
          <Feld label="Geburtsdatum Partner (TT.MM.JJJJ)">
            <DateInput
              value={birthDateB || isoToGerman(personB?.geburtsdatum ?? null)}
              onChange={setBirthDateB}
              calendarLabel={t('datum.kalender')}
              max={todayIso()}
              testID="personb-geburtsdatum"
            />
          </Feld>
          <Feld label="Beruf Partner">
            <Input value={occupationB || (personB?.beruf ?? '')} onChange={setOccupationB} testID="personb-beruf" />
          </Feld>
          <Button variant="ghost" onPress={savePersonB} testID="personb-speichern">
            Partner-Angaben übernehmen
          </Button>
          {onRecordPartner ? (
            <>
              <Text style={{ ...theme.type.small, color: theme.color.tinte2, marginTop: theme.space.s3 }}>
                Hat dein Partner kein eigenes Konto? Dann trag sein Einkommen hier mit ein – es kommt in eure gemeinsame Erklärung.
              </Text>
              <Button variant="ghost" onPress={() => onRecordPartner('lstb', partnerDisplayName)} testID="partner-lstb">
                {`Lohnsteuerbescheinigung von ${partnerDisplayName} erfassen`}
              </Button>
              <Button variant="ghost" onPress={() => onRecordPartner('arbeitsweg', partnerDisplayName)} testID="partner-arbeitsweg">
                {`Arbeitsweg von ${partnerDisplayName} erfassen`}
              </Button>
            </>
          ) : null}
          {/* The interview set this joint return up (UX review H3); a partner who already created theirs can still be joined. */}
          {joinBlock}
        </View>
      ) : (
        joinBlock
      )}
    </Card>
  )
}

/** The server names why a code did not work (KopplungService.joinWithCode); say it in plain words. */
function joinErrorText(answer: unknown): string {
  const code = typeof answer === 'object' && answer !== null && 'code' in answer ? String((answer as { code: unknown }).code) : ''
  if (code === 'INVITATION_CODE_EXPIRED') return 'Der Code ist abgelaufen. Bitte deinen Partner um einen neuen.'
  if (code === 'INVITATION_IS_OWN') return 'Das ist dein eigener Code – den gibst du an deinen Partner weiter.'
  return 'Diesen Code kennen wir nicht. Prüf die Schreibweise.'
}
