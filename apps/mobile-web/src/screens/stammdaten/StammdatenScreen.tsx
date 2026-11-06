import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, Feld, Input, Option, useBreakpoint, useTheme } from '@steuereule/ui'
import { formatGermanDate, MARITAL_STATUSES, RELIGION_KEYS } from '@steuereule/core'
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
import { makePrivacyStyles } from '../datenschutz/styles'
import { ErrorState, LoadingState } from '../shared/ScreenState'
import { germanToIso, isoToGerman, toDraft, zuPutDto, type MasterDataDraft } from './stammdatenMapping'

export interface MasterDataScreenProps {
  readonly onBack: () => void
  /** The Veranlagungsart and the partner belong to one tax year — the one the cockpit shows. */
  readonly taxYear?: number
  /** Opens a regular mask for the partner's figures — only while the partner has no own account. */
  readonly onRecordPartner?: (area: 'lstb' | 'arbeitsweg', name: string) => void
}

type TextField = Exclude<keyof MasterDataDraft, 'religion' | 'religionConsent' | 'familienstand'>

export function MasterDataScreen({ onBack, taxYear = CURRENT_TAX_YEAR, onRecordPartner }: MasterDataScreenProps) {
  const bp = useBreakpoint()
  const theme = useTheme()
  const styles = makePrivacyStyles(theme)
  const { t } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useMasterDataControllerRead()
  const save = useMasterDataControllerSave()
  const [draft, setDraft] = useState<MasterDataDraft | null>(null)
  const [message, setMessage] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null)

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
    setDraft({ ...form, ...patch })
  }
  const textField = (field: TextField, type: 'text' | 'numeric' = 'text') => (
    <Feld label={t(`stammdaten.${field}`)}>
      <Input type={type} value={form[field]} onChange={(value) => set({ [field]: value })} accessibilityLabel={t(`stammdaten.${field}`)} testID={`stammdaten-${field}`} />
    </Feld>
  )

  function submit() {
    if (form.religion !== null && !form.religionConsent) {
      setMessage({ art: 'fehler', text: t('stammdaten.saveError.einwilligung') })
      return
    }
    save.mutate(
      { data: zuPutDto(form) },
      {
        onSuccess: (response) => {
          if (response.status === 200) {
            queryClient.setQueryData(query.queryKey, response)
            setDraft(null)
            setMessage({ art: 'ok', text: t('stammdaten.gespeichert') })
          } else {
            setMessage({ art: 'fehler', text: t('stammdaten.saveError.validation') })
          }
        },
        onError: () => setMessage({ art: 'fehler', text: t('stammdaten.saveError.network') }),
      },
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.appbar}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('stammdaten.back')} onPress={onBack} style={styles.backButton}>
          <Text style={styles.backGlyph}>←</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t('stammdaten.title')}</Text>
      </View>
      <Text style={styles.sectionBody}>{t('stammdaten.intro')}</Text>
      <Text style={styles.hint} accessibilityLiveRegion="polite">
        {status.missing.length === 0 ? t('stammdaten.vollstaendig') : t('stammdaten.fehlendHinweis', { anzahl: status.missing.length })}
      </Text>

      {textField('geburtsdatum')}
      {textField('beruf')}
      {textField('strasse')}
      <View style={{ flexDirection: 'row', gap: theme.space.s3 }}>
        <View style={{ flex: 1 }}>{textField('hausnummer')}</View>
        <View style={{ flex: 1 }}>{textField('hausnummerZusatz')}</View>
      </View>
      {textField('plz', 'numeric')}
      {textField('wohnort')}

      <Feld label={t('stammdaten.familienstand')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.s2 }}>
          {MARITAL_STATUSES.map((status_) => (
            <Chip key={status_} active={form.familienstand === status_} onPress={() => set({ familienstand: status_ })}>
              {t(`stammdaten.familienstaende.${status_}`)}
            </Chip>
          ))}
        </View>
      </Feld>
      {form.familienstand !== null && form.familienstand !== 'ledig' ? textField('familienstandSeit') : null}
      {form.familienstand === 'verheiratet' ? <TaxYearLinkSection taxYear={taxYear} {...(onRecordPartner ? { onRecordPartner } : {})} /> : null}

      <Feld label={t('stammdaten.religion')}>
        <Text style={styles.hint}>{t('stammdaten.religionHinweis')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.s2, marginTop: theme.space.s2 }}>
          {RELIGION_KEYS.map((key) => (
            <Chip key={key} active={form.religion === key} onPress={() => set({ religion: key })}>
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

      {textField('iban')}
      {textField('kontoinhaber')}
      {textField('finanzamt')}
      {textField('telefon')}

      {message ? (
        <Text style={message.art === 'ok' ? styles.successNote : styles.errorNote} accessibilityLiveRegion="polite">
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
  const queryClient = useQueryClient()
  const linkQuery = useLinkControllerGet(taxYear)
  const setLink = useLinkControllerSet()
  const updatePersonB = useLinkControllerUpdatePersonB()
  const join = useLinkControllerJoinWithCode()
  const [code, setCode] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)

  const current = linkQuery.data?.status === 200 ? linkQuery.data.data : null
  const veranlagungsart = current?.veranlagungsart ?? 'keine'
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

  const selectKind = (art: 'zusammen' | 'einzel') => {
    setLink.mutate({ jahr: taxYear, data: { veranlagungsart: art } }, { onSuccess: invalidate })
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
          } else setJoinError(joinErrorText(answer.data))
        },
        onError: () => setJoinError('Das hat nicht geklappt. Prüf die Verbindung und versuch es noch mal.'),
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
      { onSuccess: invalidate },
    )
  }

  return (
    <Card style={{ marginVertical: theme.space.s3, padding: theme.space.s4 }}>
      <Feld label={`Veranlagungsart ${taxYear} & Partner (Person B, Zeile 19–24 ESt 1 A)`}>
        <View style={{ flexDirection: 'row', gap: theme.space.s2, marginBottom: theme.space.s3 }}>
          <Chip active={veranlagungsart === 'zusammen'} onPress={() => selectKind('zusammen')} testID="kopplung-zusammen">
            Zusammenveranlagung
          </Chip>
          <Chip active={veranlagungsart === 'einzel'} onPress={() => selectKind('einzel')} testID="kopplung-einzel">
            Einzelveranlagung
          </Chip>
        </View>
      </Feld>
      {veranlagungsart === 'zusammen' && current?.personBHasOwnAccount ? (
        <Text style={{ fontSize: theme.size.s, color: theme.color.tinte2 }}>
          {`${[personB?.firstName, personB?.lastName].filter(Boolean).join(' ') || 'Person B'} pflegt die Angaben im eigenen Konto.`}
        </Text>
      ) : veranlagungsart === 'zusammen' ? (
        <View>
          {current?.einladungsCode ? (
            <Text style={{ fontFamily: theme.font.mono, fontSize: theme.size.xs, color: theme.color.tinte2, marginBottom: theme.space.s2 }}>
              {invitationNotice(current.einladungsCode, current.einladungsCodeGueltigBis ?? null)}
            </Text>
          ) : null}
          <Feld label="Vorname Partner (Person B)">
            <Input value={firstNameB || (personB?.firstName ?? '')} onChange={setFirstNameB} testID="personb-vorname" />
          </Feld>
          <Feld label="Nachname Partner (Person B)">
            <Input value={lastNameB || (personB?.lastName ?? '')} onChange={setLastNameB} testID="personb-nachname" />
          </Feld>
          <Feld label="Steuer-ID Partner (11 Ziffern)">
            <Input type="numeric" value={taxIdB || (personB?.steuerId ?? '')} onChange={setTaxIdB} testID="personb-steuerid" />
          </Feld>
          <Feld label="Geburtsdatum Partner (TT.MM.JJJJ)">
            <Input value={birthDateB || isoToGerman(personB?.geburtsdatum ?? null)} onChange={setBirthDateB} testID="personb-geburtsdatum" />
          </Feld>
          <Feld label="Beruf Partner">
            <Input value={occupationB || (personB?.beruf ?? '')} onChange={setOccupationB} testID="personb-beruf" />
          </Feld>
          <Button variant="ghost" onPress={savePersonB} testID="personb-speichern">
            Partner-Angaben übernehmen
          </Button>
          {onRecordPartner ? (
            <>
              <Text style={{ fontSize: theme.size.s, color: theme.color.tinte2, marginTop: theme.space.s3 }}>
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
        </View>
      ) : (
        <View>
          <Text style={{ fontSize: theme.size.s, color: theme.color.tinte2, marginBottom: theme.space.s2 }}>
            {`Dein Partner hat die Zusammenveranlagung ${taxYear} schon angelegt? Dann gib hier den Einladungscode ein – ihr gebt dann eine gemeinsame Erklärung ab.`}
          </Text>
          <Feld label="Einladungscode deines Partners">
            <Input value={code} onChange={setCode} testID="kopplung-code" accessibilityLabel="Einladungscode deines Partners" />
          </Feld>
          {joinError ? <Text style={{ fontSize: theme.size.s, color: theme.color.tinte }}>{joinError}</Text> : null}
          <Button variant="ghost" onPress={redeemCode} testID="kopplung-beitreten">
            Einladung annehmen
          </Button>
        </View>
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
