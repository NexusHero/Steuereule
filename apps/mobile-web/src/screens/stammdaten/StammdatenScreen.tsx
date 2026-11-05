import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, Feld, Input, Option, useBreakpoint, useTheme } from '@steuereule/ui'
import { deutschesDatum, FAMILIENSTAENDE, RELIGIONSSCHLUESSEL } from '@steuereule/core'
import {
  getKopplungControllerGetQueryKey,
  useKopplungControllerGet,
  useKopplungControllerSet,
  useKopplungControllerJoinWithCode,
  useKopplungControllerUpdatePersonB,
  useStammdatenControllerLese,
  useStammdatenControllerSpeichere,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { makeDatenschutzStyles } from '../datenschutz/styles'
import { ErrorState, LoadingState } from '../shared/ScreenState'
import { deutschZuIso, isoZuDeutsch, zuEntwurf, zuPutDto, type StammdatenEntwurf } from './stammdatenMapping'

export interface StammdatenScreenProps {
  readonly onZurueck: () => void
  /** The Veranlagungsart and the partner belong to one tax year — the one the cockpit shows. */
  readonly taxYear?: number
  /** Opens a regular mask for the partner's figures — only while the partner has no own account. */
  readonly onPartnerErfassen?: (bereich: 'lstb' | 'arbeitsweg', name: string) => void
}

type TextFeld = Exclude<keyof StammdatenEntwurf, 'religion' | 'religionEinwilligung' | 'familienstand'>

export function StammdatenScreen({ onZurueck, taxYear = CURRENT_TAX_YEAR, onPartnerErfassen }: StammdatenScreenProps) {
  const bp = useBreakpoint()
  const theme = useTheme()
  const styles = makeDatenschutzStyles(theme)
  const { t } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useStammdatenControllerLese()
  const speichern = useStammdatenControllerSpeichere()
  const [entwurf, setEntwurf] = useState<StammdatenEntwurf | null>(null)
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null)

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

  const stand = query.data.data
  const form = entwurf ?? zuEntwurf(stand)
  const setze = (patch: Partial<StammdatenEntwurf>) => {
    setMeldung(null)
    setEntwurf({ ...form, ...patch })
  }
  const textFeld = (feld: TextFeld, type: 'text' | 'numeric' = 'text') => (
    <Feld label={t(`stammdaten.${feld}`)}>
      <Input type={type} value={form[feld]} onChange={(wert) => setze({ [feld]: wert })} accessibilityLabel={t(`stammdaten.${feld}`)} testID={`stammdaten-${feld}`} />
    </Feld>
  )

  function absenden() {
    if (form.religion !== null && !form.religionEinwilligung) {
      setMeldung({ art: 'fehler', text: t('stammdaten.saveError.einwilligung') })
      return
    }
    speichern.mutate(
      { data: zuPutDto(form) },
      {
        onSuccess: (response) => {
          if (response.status === 200) {
            queryClient.setQueryData(query.queryKey, response)
            setEntwurf(null)
            setMeldung({ art: 'ok', text: t('stammdaten.gespeichert') })
          } else {
            setMeldung({ art: 'fehler', text: t('stammdaten.saveError.validation') })
          }
        },
        onError: () => setMeldung({ art: 'fehler', text: t('stammdaten.saveError.network') }),
      },
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.appbar}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('stammdaten.back')} onPress={onZurueck} style={styles.backButton}>
          <Text style={styles.backGlyph}>←</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t('stammdaten.title')}</Text>
      </View>
      <Text style={styles.sectionBody}>{t('stammdaten.intro')}</Text>
      <Text style={styles.hint} accessibilityLiveRegion="polite">
        {stand.fehlend.length === 0 ? t('stammdaten.vollstaendig') : t('stammdaten.fehlendHinweis', { anzahl: stand.fehlend.length })}
      </Text>

      {textFeld('geburtsdatum')}
      {textFeld('beruf')}
      {textFeld('strasse')}
      <View style={{ flexDirection: 'row', gap: theme.space.s3 }}>
        <View style={{ flex: 1 }}>{textFeld('hausnummer')}</View>
        <View style={{ flex: 1 }}>{textFeld('hausnummerZusatz')}</View>
      </View>
      {textFeld('plz', 'numeric')}
      {textFeld('wohnort')}

      <Feld label={t('stammdaten.familienstand')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.s2 }}>
          {FAMILIENSTAENDE.map((stand_) => (
            <Chip key={stand_} aktiv={form.familienstand === stand_} onPress={() => setze({ familienstand: stand_ })}>
              {t(`stammdaten.familienstaende.${stand_}`)}
            </Chip>
          ))}
        </View>
      </Feld>
      {form.familienstand !== null && form.familienstand !== 'ledig' ? textFeld('familienstandSeit') : null}
      {form.familienstand === 'verheiratet' ? <SteuerjahrKopplungSection taxYear={taxYear} {...(onPartnerErfassen ? { onPartnerErfassen } : {})} /> : null}

      <Feld label={t('stammdaten.religion')}>
        <Text style={styles.hint}>{t('stammdaten.religionHinweis')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.s2, marginTop: theme.space.s2 }}>
          {RELIGIONSSCHLUESSEL.map((schluessel) => (
            <Chip key={schluessel} aktiv={form.religion === schluessel} onPress={() => setze({ religion: schluessel })}>
              {t(`stammdaten.religionen.${schluessel}`)}
            </Chip>
          ))}
        </View>
      </Feld>
      {form.religion !== null ? (
        <Option
          gewaehlt={form.religionEinwilligung}
          onPress={() => setze({ religionEinwilligung: !form.religionEinwilligung })}
          testID="stammdaten-einwilligung"
        >
          {t('stammdaten.einwilligung')}
        </Option>
      ) : null}

      {textFeld('iban')}
      {textFeld('kontoinhaber')}
      {textFeld('finanzamt')}
      {textFeld('telefon')}

      {meldung ? (
        <Text style={meldung.art === 'ok' ? styles.successNote : styles.errorNote} accessibilityLiveRegion="polite">
          {meldung.text}
        </Text>
      ) : null}
      <View style={styles.buttonSpacer}>
        <Button onPress={absenden} disabled={speichern.isPending} testID="stammdaten-speichern">
          {t('stammdaten.speichern')}
        </Button>
      </View>
    </ScrollView>
  )
}

function einladungsHinweis(code: string, gueltigBis: string | null): string {
  if (gueltigBis !== null && new Date(gueltigBis) <= new Date()) {
    return 'Der Einladungscode ist abgelaufen — wähle erneut Zusammenveranlagung für einen neuen.'
  }
  const bis = gueltigBis ? ` (gültig bis ${deutschesDatum(gueltigBis.slice(0, 10))})` : ''
  return `Einladungscode für Partner-Account: ${code}${bis}`
}

function SteuerjahrKopplungSection({
  taxYear,
  onPartnerErfassen,
}: {
  readonly taxYear: number
  readonly onPartnerErfassen?: (bereich: 'lstb' | 'arbeitsweg', name: string) => void
}) {
  const theme = useTheme()
  const queryClient = useQueryClient()
  const kopplungQuery = useKopplungControllerGet(taxYear)
  const setKopplung = useKopplungControllerSet()
  const updatePersonB = useKopplungControllerUpdatePersonB()
  const beitreten = useKopplungControllerJoinWithCode()
  const [code, setCode] = useState('')
  const [beitrittsFehler, setBeitrittsFehler] = useState<string | null>(null)

  const current = kopplungQuery.data?.status === 200 ? kopplungQuery.data.data : null
  const veranlagungsart = current?.veranlagungsart ?? 'keine'
  const personB = current?.personB
  const partnerAnzeigeName = personB?.firstName || 'deinem Partner'

  const [vornameB, setVornameB] = useState(personB?.firstName ?? '')
  const [nachnameB, setNachnameB] = useState(personB?.lastName ?? '')
  const [steuerIdB, setSteuerIdB] = useState(personB?.steuerId ?? '')
  const [geburtsdatumB, setGeburtsdatumB] = useState(personB?.geburtsdatum ?? '')
  const [berufB, setBerufB] = useState(personB?.beruf ?? '')

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getKopplungControllerGetQueryKey(taxYear) })
  }

  const wähleArt = (art: 'zusammen' | 'einzel') => {
    setKopplung.mutate({ jahr: taxYear, data: { veranlagungsart: art } }, { onSuccess: invalidate })
  }

  const loeseCodeEin = () => {
    const bereinigt = code.trim().toUpperCase()
    if (bereinigt === '') return
    setBeitrittsFehler(null)
    beitreten.mutate(
      { jahr: taxYear, code: bereinigt },
      {
        onSuccess: (antwort) => {
          if (antwort.status === 200) {
            setCode('')
            invalidate()
          } else setBeitrittsFehler(beitrittsFehlerText(antwort.data))
        },
        onError: () => setBeitrittsFehler('Das hat nicht geklappt. Prüf die Verbindung und versuch es noch mal.'),
      },
    )
  }

  const speicherePersonB = () => {
    updatePersonB.mutate(
      {
        jahr: taxYear,
        data: {
          firstName: vornameB || null,
          lastName: nachnameB || null,
          steuerId: steuerIdB || null,
          geburtsdatum: geburtsdatumB ? deutschZuIso(geburtsdatumB) : null,
          beruf: berufB || null,
        },
      },
      { onSuccess: invalidate },
    )
  }

  return (
    <Card style={{ marginVertical: theme.space.s3, padding: theme.space.s4 }}>
      <Feld label={`Veranlagungsart ${taxYear} & Partner (Person B, Zeile 19–24 ESt 1 A)`}>
        <View style={{ flexDirection: 'row', gap: theme.space.s2, marginBottom: theme.space.s3 }}>
          <Chip aktiv={veranlagungsart === 'zusammen'} onPress={() => wähleArt('zusammen')} testID="kopplung-zusammen">
            Zusammenveranlagung
          </Chip>
          <Chip aktiv={veranlagungsart === 'einzel'} onPress={() => wähleArt('einzel')} testID="kopplung-einzel">
            Einzelveranlagung
          </Chip>
        </View>
      </Feld>
      {veranlagungsart === 'zusammen' && current?.personBHatEigenesKonto ? (
        <Text style={{ fontSize: theme.size.s, color: theme.color.tinte2 }}>
          {`${[personB?.firstName, personB?.lastName].filter(Boolean).join(' ') || 'Person B'} pflegt die Angaben im eigenen Konto.`}
        </Text>
      ) : veranlagungsart === 'zusammen' ? (
        <View>
          {current?.einladungsCode ? (
            <Text style={{ fontFamily: theme.font.mono, fontSize: theme.size.xs, color: theme.color.tinte2, marginBottom: theme.space.s2 }}>
              {einladungsHinweis(current.einladungsCode, current.einladungsCodeGueltigBis ?? null)}
            </Text>
          ) : null}
          <Feld label="Vorname Partner (Person B)">
            <Input value={vornameB || (personB?.firstName ?? '')} onChange={setVornameB} testID="personb-vorname" />
          </Feld>
          <Feld label="Nachname Partner (Person B)">
            <Input value={nachnameB || (personB?.lastName ?? '')} onChange={setNachnameB} testID="personb-nachname" />
          </Feld>
          <Feld label="Steuer-ID Partner (11 Ziffern)">
            <Input type="numeric" value={steuerIdB || (personB?.steuerId ?? '')} onChange={setSteuerIdB} testID="personb-steuerid" />
          </Feld>
          <Feld label="Geburtsdatum Partner (TT.MM.JJJJ)">
            <Input value={geburtsdatumB || isoZuDeutsch(personB?.geburtsdatum ?? null)} onChange={setGeburtsdatumB} testID="personb-geburtsdatum" />
          </Feld>
          <Feld label="Beruf Partner">
            <Input value={berufB || (personB?.beruf ?? '')} onChange={setBerufB} testID="personb-beruf" />
          </Feld>
          <Button variante="ghost" onPress={speicherePersonB} testID="personb-speichern">
            Partner-Angaben übernehmen
          </Button>
          {onPartnerErfassen ? (
            <>
              <Text style={{ fontSize: theme.size.s, color: theme.color.tinte2, marginTop: theme.space.s3 }}>
                Hat dein Partner kein eigenes Konto? Dann trag sein Einkommen hier mit ein – es kommt in eure gemeinsame Erklärung.
              </Text>
              <Button variante="ghost" onPress={() => onPartnerErfassen('lstb', partnerAnzeigeName)} testID="partner-lstb">
                {`Lohnsteuerbescheinigung von ${partnerAnzeigeName} erfassen`}
              </Button>
              <Button variante="ghost" onPress={() => onPartnerErfassen('arbeitsweg', partnerAnzeigeName)} testID="partner-arbeitsweg">
                {`Arbeitsweg von ${partnerAnzeigeName} erfassen`}
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
          {beitrittsFehler ? <Text style={{ fontSize: theme.size.s, color: theme.color.tinte }}>{beitrittsFehler}</Text> : null}
          <Button variante="ghost" onPress={loeseCodeEin} testID="kopplung-beitreten">
            Einladung annehmen
          </Button>
        </View>
      )}
    </Card>
  )
}

/** The server names why a code did not work (KopplungService.joinWithCode); say it in plain words. */
function beitrittsFehlerText(antwort: unknown): string {
  const code = typeof antwort === 'object' && antwort !== null && 'code' in antwort ? String((antwort as { code: unknown }).code) : ''
  if (code === 'INVITATION_CODE_EXPIRED') return 'Der Code ist abgelaufen. Bitte deinen Partner um einen neuen.'
  if (code === 'INVITATION_IS_OWN') return 'Das ist dein eigener Code – den gibst du an deinen Partner weiter.'
  return 'Diesen Code kennen wir nicht. Prüf die Schreibweise.'
}
