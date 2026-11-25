import { useState, type ReactNode } from 'react'
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
  type LinkPersonBDto,
  type LinkPersonBDtoReligion,
  type LinkResponseDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { PartnerYearConsent } from './PartnerYearConsent'
import { StepUpInline } from '../../auth/StepUpInline'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { makePrivacyStyles } from '../privacy/styles'
import { LoadFailedState, LoadingState } from '../shared/ScreenState'
import { InlineLoadFailure } from '../shared/InlineLoadFailure'
import { triggerSaveErrorHaptic } from '../shared/saveFeedback'
import { classifyApiFailure, useApiFailureMessage } from '../../net/apiFailure'
import { germanToIso, isoToGerman, toDraft, zuPutDto, type MasterDataDraft } from './masterDataMapping'
import { PostalCodeHint } from '../shared/PostalCodeHint'
import { TaxIdHint } from '../shared/TaxIdHint'
import { PartnerLinkStatus } from './PartnerLinkStatus'
import { prefillCity } from '../shared/postalCodePrefill'
import { AddressSearch } from '../shared/AddressSearch'
import { todayIso } from '../shared/today'
import { useKnownEmployers } from './employersStore'

export interface MasterDataScreenProps {
  readonly onBack: () => void
  /** The Veranlagungsart and the partner belong to one tax year — the one the cockpit shows. */
  readonly taxYear?: number
  /** Opens a regular mask for the partner's figures — only while the partner has no own account. */
  readonly onRecordPartner?: (area: 'lstb' | 'arbeitsweg' | 'schweiz' | 'rente', name: string) => void
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
  // NM-10: leaving with unsaved changes asks once instead of dropping them silently.
  const [leaveWarned, setLeaveWarned] = useState(false)
  const failureMessage = useApiFailureMessage()

  if (query.isPending) return <LoadingState bp={bp} label={t('stammdaten.loading')} />
  if (query.isError) return <LoadFailedState bp={bp} error={query.error} onRetry={() => void query.refetch()} />

  const status = query.data.data
  const form = draft ?? toDraft(status)
  const unsaved = draft !== null
  const leaveOrWarn = (leave: () => void) => {
    if (unsaved && !leaveWarned) {
      setLeaveWarned(true)
      return
    }
    leave()
  }
  const set = (patch: Partial<MasterDataDraft>) => {
    setMessage(null)
    setLeaveWarned(false)
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
    // Art. 9 DSGVO: a religion without the consent is not sent; everything else is saved anyway (real-data run),
    // and the stored religion, consented before, stays.
    const religionWaits = form.religion !== null && !form.religionConsent
    const sent = religionWaits ? { ...form, religion: status.religion, religionConsent: status.religion !== null } : form
    save.mutate(
      { data: zuPutDto(sent) },
      {
        onSuccess: (response) => {
          queryClient.setQueryData(query.queryKey, response)
          setDraft(religionWaits ? { ...toDraft(response.data), religion: form.religion, religionConsent: false } : null)
          setLeaveWarned(false)
          if (religionWaits) triggerSaveErrorHaptic()
          setMessage(religionWaits ? { kind: 'fehler', text: t('stammdaten.ohneReligion') } : { kind: 'ok', text: t('stammdaten.gespeichert') })
        },
        onError: (error) => {
          // NM-07: a 400 names the inputs, a dropped connection the connection; 401/429/500 say what they are.
          triggerSaveErrorHaptic()
          setMessage({
            kind: 'fehler',
            text: failureMessage(error, { validation: t('stammdaten.saveError.validation'), offline: t('stammdaten.saveError.network') }),
          })
        },
      },
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.appbar}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('stammdaten.back')} onPress={() => leaveOrWarn(onBack)} style={styles.backButton} testID="stammdaten-zurueck">
          <Text style={styles.backGlyph}>←</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t('stammdaten.title')}</Text>
      </View>
      {leaveWarned ? (
        <Text style={styles.errorNote} accessibilityRole="alert" testID="stammdaten-ungespeichert">
          {t('stammdaten.ungespeichertZurueck')}
        </Text>
      ) : null}
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
      {form.familienstand === 'verheiratet' ? (
        <TaxYearLinkSection
          taxYear={taxYear}
          {...(onRecordPartner ? { onRecordPartner: (area: PartnerArea, name: string) => leaveOrWarn(() => onRecordPartner(area, name)) } : {})}
        />
      ) : null}

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

      <EmployersMasterDataSection />

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

type PartnerArea = 'lstb' | 'arbeitsweg' | 'schweiz' | 'rente'

function TaxYearLinkSection({
  taxYear,
  onRecordPartner,
}: {
  readonly taxYear: number
  readonly onRecordPartner?: (area: PartnerArea, name: string) => void
}) {
  const theme = useTheme()
  const { t } = useTranslation(APP_NS)
  const linkQuery = useLinkControllerGet(taxYear)
  const card = (children: ReactNode) => <Card style={{ marginVertical: theme.space.s3, padding: theme.space.s4 }}>{children}</Card>

  if (linkQuery.isPending) {
    return card(<Text style={{ ...theme.type.small, color: theme.color.tinte2 }}>{t('stammdaten.kopplungStand.loading')}</Text>)
  }
  // NM-02 / WEB-36: a failed load is not „keine Veranlagungsart“ with a choice to make — nothing is offered.
  if (linkQuery.isError) {
    return card(
      <InlineLoadFailure what={t('stammdaten.kopplungStand.loadError')} error={linkQuery.error} onRetry={() => void linkQuery.refetch()} testID="kopplung-ladefehler" />,
    )
  }
  return card(<LoadedLinkSection taxYear={taxYear} current={linkQuery.data.data} {...(onRecordPartner ? { onRecordPartner } : {})} />)
}

function LoadedLinkSection({
  taxYear,
  current,
  onRecordPartner,
}: {
  readonly taxYear: number
  readonly current: LinkResponseDto
  readonly onRecordPartner?: (area: PartnerArea, name: string) => void
}) {
  const theme = useTheme()
  const { t } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const failureMessage = useApiFailureMessage()
  const setLink = useLinkControllerSet()
  const join = useLinkControllerJoinWithCode()
  const [code, setCode] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  // Joining shows the own data to Person A: on an older session it needs the step-up first (API-12).
  const [joinStepUp, setJoinStepUp] = useState(false)
  const [kindError, setKindError] = useState<string | null>(null)

  const filingType = current.filingType
  const personB = current.personB ?? null
  const partnerDisplayName = personB?.firstName || 'deinem Partner'

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getLinkControllerGetQueryKey(taxYear) })
  }

  const selectKind = (kind: 'zusammen' | 'einzel') => {
    setKindError(null)
    setLink.mutate(
      { jahr: taxYear, data: { filingType: kind } },
      {
        onSuccess: invalidate,
        onError: (error) => {
          triggerSaveErrorHaptic()
          setKindError(failureMessage(error))
        },
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
        onSuccess: () => {
          setCode('')
          setJoinStepUp(false)
          invalidate()
        },
        onError: (error) => {
          if (classifyApiFailure(error).kind === 'step-up') return setJoinStepUp(true)
          triggerSaveErrorHaptic()
          setJoinError(joinErrorText(error, failureMessage, t('stammdaten.kopplungStand.codeUnbekannt')))
        },
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
      {joinError ? (
        <Text style={{ ...theme.type.small, color: theme.color.tinte }} accessibilityRole="alert">
          {joinError}
        </Text>
      ) : null}
      {joinStepUp ? (
        <StepUpInline testID="kopplung-beitreten-stepup" onConfirmed={redeemCode} onCancel={() => setJoinStepUp(false)} />
      ) : (
        <Button variant="ghost" onPress={redeemCode} disabled={join.isPending} testID="kopplung-beitreten">
          Einladung annehmen
        </Button>
      )}
    </View>
  )

  return (
    <>
      <Feld label={`Veranlagungsart ${taxYear} & Partner (Person B, Zeile 19–24 ESt 1 A)`}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.s2, marginBottom: theme.space.s3 }}>
          <Chip active={filingType === 'zusammen'} onPress={() => selectKind('zusammen')} testID="kopplung-zusammen">
            Zusammenveranlagung
          </Chip>
          <Chip active={filingType === 'einzel'} onPress={() => selectKind('einzel')} testID="kopplung-einzel">
            Einzelveranlagung
          </Chip>
        </View>
        {kindError ? (
          <Text style={{ ...theme.type.small, color: theme.color.tinte }} accessibilityRole="alert" testID="kopplung-art-fehler">
            {kindError}
          </Text>
        ) : null}
      </Feld>
      <PartnerLinkStatus taxYear={taxYear} onChanged={invalidate} />
      <PartnerYearConsent taxYear={taxYear} current={current} onChanged={invalidate} />
      {filingType === 'zusammen' && current.personBHasOwnAccount ? (
        <Text style={{ ...theme.type.small, color: theme.color.tinte2 }}>
          {`${[personB?.firstName, personB?.lastName].filter(Boolean).join(' ') || 'Person B'} pflegt die Angaben im eigenen Konto.`}
        </Text>
      ) : filingType === 'zusammen' ? (
        <View>
          {current.invitationCode ? (
            <Text style={{ ...theme.type.meta, color: theme.color.tinte2, marginBottom: theme.space.s2 }} testID="kopplung-code-anzeige">
              {invitationNotice(current.invitationCode, current.invitationCodeValidUntil ?? null)}
            </Text>
          ) : null}
          {/* Keyed by the stored values: the fields start from what is stored and follow it after a save. */}
          <PersonBForm key={JSON.stringify(personB)} taxYear={taxYear} personB={personB} onSaved={invalidate} />
          {onRecordPartner ? (
            <>
              <Text style={{ ...theme.type.small, color: theme.color.tinte2, marginTop: theme.space.s3 }}>
                Hat dein Partner kein eigenes Konto? Dann trag sein Einkommen hier mit ein – es kommt in eure gemeinsame Erklärung.
              </Text>
              <Button variant="ghost" onPress={() => onRecordPartner('lstb', partnerDisplayName)} testID="partner-lstb">
                {`Lohnsteuerbescheinigung von ${partnerDisplayName} erfassen`}
              </Button>
              <Button variant="ghost" onPress={() => onRecordPartner('schweiz', partnerDisplayName)} testID="partner-schweiz">
                {`Schweizer Lohnausweis von ${partnerDisplayName} erfassen`}
              </Button>
              <Button variant="ghost" onPress={() => onRecordPartner('arbeitsweg', partnerDisplayName)} testID="partner-arbeitsweg">
                {`Arbeitsweg von ${partnerDisplayName} erfassen`}
              </Button>
              <Button variant="ghost" onPress={() => onRecordPartner('rente', partnerDisplayName)} testID="partner-rente">
                {`Rente von ${partnerDisplayName} erfassen`}
              </Button>
            </>
          ) : null}
          {/* The interview set this joint return up (UX review H3); a partner who already created theirs can still be joined. */}
          {joinBlock}
        </View>
      ) : (
        joinBlock
      )}
    </>
  )
}

type PersonB = NonNullable<LinkResponseDto['personB']>

/**
 * Person B's details, started from what is stored (NM-01). „Partner-Angaben übernehmen“ sends only what the
 * user changed (WEB-29): the server keeps an absent field, so a Steuer-ID or confession the user never touched
 * is never sent as null and wiped.
 */
function PersonBForm({ taxYear, personB, onSaved }: { readonly taxYear: number; readonly personB: PersonB | null; readonly onSaved: () => void }) {
  const theme = useTheme()
  const { t } = useTranslation(APP_NS)
  const failureMessage = useApiFailureMessage()
  const updatePersonB = useLinkControllerUpdatePersonB()
  const stored = {
    firstName: personB?.firstName ?? '',
    lastName: personB?.lastName ?? '',
    steuerId: personB?.steuerId ?? '',
    geburtsdatum: isoToGerman(personB?.geburtsdatum ?? null),
    beruf: personB?.beruf ?? '',
    religion: personB?.religion ?? null,
  }
  const [firstNameB, setFirstNameB] = useState(stored.firstName)
  const [lastNameB, setLastNameB] = useState(stored.lastName)
  const [taxIdB, setTaxIdB] = useState(stored.steuerId)
  const [birthDateB, setBirthDateB] = useState(stored.geburtsdatum)
  const [occupationB, setOccupationB] = useState(stored.beruf)
  // Person B's confession decides the church tax of the joint return (§ 51a EStG); Art. 9 DSGVO asks for consent.
  const [religionB, setReligionB] = useState<string | null>(stored.religion)
  const [religionConsentB, setReligionConsentB] = useState(false)
  const [religionConsentMissing, setReligionConsentMissing] = useState(false)
  const [message, setMessage] = useState<{ readonly kind: 'ok' | 'fehler'; readonly text: string } | null>(null)

  const changedText = (typed: string, before: string): string | null | undefined => {
    const value = typed.trim()
    if (value === before.trim()) return undefined
    return value === '' ? null : value
  }

  const savePersonB = () => {
    setMessage(null)
    const religionChanged = religionB !== stored.religion
    if (religionChanged && religionB !== null && !religionConsentB) {
      setReligionConsentMissing(true)
      return
    }
    setReligionConsentMissing(false)
    const data: LinkPersonBDto = {}
    const firstName = changedText(firstNameB, stored.firstName)
    const lastName = changedText(lastNameB, stored.lastName)
    const steuerId = changedText(taxIdB, stored.steuerId)
    const beruf = changedText(occupationB, stored.beruf)
    const birth = changedText(birthDateB, stored.geburtsdatum)
    if (firstName !== undefined) data.firstName = firstName
    if (lastName !== undefined) data.lastName = lastName
    if (steuerId !== undefined) data.steuerId = steuerId
    if (beruf !== undefined) data.beruf = beruf
    if (birth !== undefined) data.geburtsdatum = birth === null ? null : germanToIso(birth)
    if (religionChanged) {
      data.religion = religionB as LinkPersonBDtoReligion
      if (religionB !== null) data.religionConsent = true
    }
    if (Object.keys(data).length === 0) {
      setMessage({ kind: 'ok', text: t('stammdaten.kopplungStand.personBUnveraendert') })
      return
    }
    updatePersonB.mutate(
      { jahr: taxYear, data },
      {
        onSuccess: () => {
          setMessage({ kind: 'ok', text: t('stammdaten.kopplungStand.personBGespeichert') })
          onSaved()
        },
        onError: (error) => {
          triggerSaveErrorHaptic()
          setMessage({ kind: 'fehler', text: `${t('apiFehler.saveHeading')} ${failureMessage(error)} ${t('apiFehler.saveKept')}` })
        },
      },
    )
  }

  return (
    <>
      <Feld label="Vorname Partner (Person B)">
        <Input value={firstNameB} onChange={setFirstNameB} autoComplete="off" accessibilityLabel="Vorname Partner (Person B)" testID="personb-vorname" />
      </Feld>
      <Feld label="Nachname Partner (Person B)">
        <Input value={lastNameB} onChange={setLastNameB} autoComplete="off" accessibilityLabel="Nachname Partner (Person B)" testID="personb-nachname" />
      </Feld>
      <Feld label="Steuer-ID Partner (11 Ziffern)">
        <Input type="numeric" value={taxIdB} onChange={setTaxIdB} accessibilityLabel="Steuer-ID Partner (11 Ziffern)" testID="personb-steuerid" />
        <TaxIdHint value={taxIdB} testID="personb-steuerid-hinweis" />
      </Feld>
      <Feld label="Geburtsdatum Partner (TT.MM.JJJJ)">
        <DateInput
          value={birthDateB}
          onChange={setBirthDateB}
          calendarLabel={t('datum.kalender')}
          max={todayIso()}
          accessibilityLabel="Geburtsdatum Partner (TT.MM.JJJJ)"
          testID="personb-geburtsdatum"
        />
      </Feld>
      <Feld label="Beruf Partner">
        <Input value={occupationB} onChange={setOccupationB} accessibilityLabel="Beruf Partner" testID="personb-beruf" />
      </Feld>
      <Feld label={t('stammdaten.religionPartner')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.s2, marginTop: theme.space.s2 }}>
          {RELIGION_KEYS.map((key) => (
            <Chip key={key} active={religionB === key} onPress={() => setReligionB(key)} testID={`personb-religion-${key}`}>
              {t(`stammdaten.religionen.${key}`)}
            </Chip>
          ))}
        </View>
      </Feld>
      {religionB !== null && religionB !== stored.religion ? (
        <Option selected={religionConsentB} onPress={() => setReligionConsentB(!religionConsentB)} testID="personb-einwilligung">
          {t('stammdaten.einwilligungPartner')}
        </Option>
      ) : null}
      {religionConsentMissing ? (
        <Text style={{ ...theme.type.small, color: theme.color.warn }} accessibilityLiveRegion="polite" testID="personb-einwilligung-fehlt">
          {t('stammdaten.einwilligungFehlt')}
        </Text>
      ) : null}
      {message ? (
        <Text
          style={{ ...theme.type.small, color: message.kind === 'ok' ? theme.color.tinte2 : theme.color.tinte }}
          {...(message.kind === 'fehler' ? { accessibilityRole: 'alert' as const } : { accessibilityLiveRegion: 'polite' as const })}
          testID="personb-meldung"
        >
          {message.text}
        </Text>
      ) : null}
      <Button variant="ghost" onPress={savePersonB} disabled={updatePersonB.isPending} testID="personb-speichern">
        Partner-Angaben übernehmen
      </Button>
    </>
  )
}

/** The server names why a code did not work (KopplungService.joinWithCode); say it in plain words. */
function joinErrorText(error: unknown, failureMessage: (error: unknown) => string, unknownCode: string): string {
  const failure = classifyApiFailure(error)
  if (failure.code === 'INVITATION_CODE_EXPIRED') return 'Der Code ist abgelaufen. Bitte deinen Partner um einen neuen.'
  if (failure.code === 'INVITATION_IS_OWN') return 'Das ist dein eigener Code – den gibst du an deinen Partner weiter.'
  if (failure.kind === 'offline') return 'Das hat nicht geklappt. Prüf die Verbindung und versuch es noch mal.'
  // NM-02: only an unknown or malformed code is „unknown“; a 409, 429 or 500 says what it is.
  if (failure.kind === 'not-found' || failure.kind === 'validation') return unknownCode
  return failureMessage(error)
}

/**
 * The employers already recorded on the household's Swiss salary certificates (Echtdatentest 18.11.2026).
 * Shown only — an employer is entered on the certificate itself; a fresh account shows none.
 */
function EmployersMasterDataSection() {
  const theme = useTheme()
  const employers = useKnownEmployers()
  if (employers.length === 0) return null
  return (
    <Card style={{ marginVertical: theme.space.s3, padding: theme.space.s4 }} testID="stammdaten-unternehmen-card">
      <Text style={{ ...theme.type.cardTitle, color: theme.color.tinte, marginBottom: theme.space.s1 }}>Arbeitgeber</Text>
      <Text style={{ ...theme.type.small, color: theme.color.tinte2, marginBottom: theme.space.s3 }}>
        Aus deinen Schweizer Lohnausweisen. Ändern kannst du sie im Lohnausweis des jeweiligen Jahres; dort schlagen wir sie dir auch für das nächste Jahr vor.
      </Text>
      <View style={{ gap: theme.space.s2 }}>
        {employers.map((emp) => (
          <View key={emp.id} style={{ padding: theme.space.s3, borderRadius: theme.radius.s, backgroundColor: theme.color.grund }} testID={`stammdaten-unternehmen-eintrag-${emp.id}`}>
            <Text style={{ ...theme.type.emphasis, color: theme.color.tinte }}>{emp.name}</Text>
            <Text style={{ ...theme.type.small, color: theme.color.tinte2 }}>{[emp.strasse, emp.plzOrt].filter(Boolean).join(' · ')}</Text>
          </View>
        ))}
      </View>
    </Card>
  )
}
