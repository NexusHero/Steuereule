import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, useBreakpoint, useTheme } from '@steuereule/ui'
import type { Screen } from '@steuereule/core'
import {
  apiErrorStatus,
  NetworkError,
  usePrintoutControllerCheckout,
  usePrintoutControllerCheck,
  useUnlockControllerStatus,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { useApiFailureMessage } from '../../net/apiFailure'
import { isRunningTaxYear } from '../../config/taxYear'
import { makePrivacyStyles } from '../privacy/styles'
import { ErrorState, LoadingState } from '../shared/ScreenState'
import { GlassFormPreview } from './GlassFormPreview'
import { loadPrintout } from './printoutDownload'

export interface PrintoutScreenProps {
  readonly year: number
  readonly payment?: 'erfolg' | 'abbruch'
  readonly onBack: () => void
  readonly onCompleteDetails: () => void
  readonly onCompleteRiester: () => void
  readonly onCompleteChildren: () => void
  readonly onCompleteRental: () => void
  readonly onCompleteCapital: () => void
  readonly onCompleteCrossBorder: () => void
  readonly onConfirm: () => void
  readonly onInspectField?: (screen: Screen, field?: string) => void
  readonly openCheckout?: (url: string) => void
}

export function PrintoutScreen({ year, payment, onBack, onCompleteDetails, onCompleteRiester, onCompleteChildren, onCompleteRental, onCompleteCapital, onCompleteCrossBorder, onConfirm, onInspectField, openCheckout = (url) => window.location.assign(url) }: PrintoutScreenProps) {
  const bp = useBreakpoint()
  const theme = useTheme()
  const styles = makePrivacyStyles(theme)
  const { t } = useTranslation(APP_NS)
  const status = useUnlockControllerStatus(year)
  const check = usePrintoutControllerCheck(year)
  const checkout = usePrintoutControllerCheckout()
  const [message, setMessage] = useState<{ kind: 'ok' | 'fehler'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const failureMessage = useApiFailureMessage()

  if (isRunningTaxYear(year)) {
    // K2: the running year has no official forms yet — name when filing opens, up front.
    return (
      <ErrorState
        bp={bp}
        heading={t('cockpit.laufendesJahr', { jahr: year, abgabeAb: year + 1 })}
        message={t('ausdruck.laufendesJahr')}
        retryLabel={t('ausdruck.back')}
        onRetry={onBack}
      />
    )
  }
  if (status.isPending || check.isPending) return <LoadingState bp={bp} label={t('ausdruck.loading')} />
  if (apiErrorStatus(check.error) === 404) {
    return (
      <ErrorState
        bp={bp}
        heading={t('ausdruck.keineVordrucke.heading', { jahr: year })}
        message={t('ausdruck.keineVordrucke.message')}
        retryLabel={t('ausdruck.back')}
        onRetry={onBack}
      />
    )
  }
  if (status.isError || check.isError) {
    return (
      <ErrorState
        bp={bp}
        heading={t('ausdruck.loadError.heading')}
        message={failureMessage(status.error ?? check.error, { offline: t('ausdruck.loadError.message') })}
        retryLabel={t('ausdruck.loadError.retry')}
        onRetry={() => {
          void status.refetch()
          void check.refetch()
        }}
      />
    )
  }

  const unlock = status.data.data.status
  const missing = check.data.data.missing
  const married = missing.includes('ehegatte')
  const riester = missing.includes('riester')
  const kinder = missing.includes('kinder')
  // Which of the children's details are missing; an API that does not name them gets the general hint.
  const childFields = check.data.data.missingChildFields ?? []
  const rental = missing.includes('vermietung')
  const capital = missing.includes('kapital')
  const crossBorder = missing.includes('grenzgaenger')
  const annexes = missing.filter((key) => key.startsWith('anlage'))
  const unconfirmed = missing.filter((key) => key.startsWith('unbestaetigt.') && key !== 'unbestaetigt.personB').map((key) => key.slice('unbestaetigt.'.length))
  const personBUnconfirmed = missing.includes('unbestaetigt.personB')
  // Values too long for their box at the 10 pt the forms require (ADR-0085): named, to be shortened.
  const tooLong = missing.filter((key) => key.startsWith('zuLang.')).map((key) => key.slice('zuLang.'.length))
  const ownWay = new Set(['ehegatte', 'riester', 'kinder', 'vermietung', 'kapital', 'grenzgaenger'])
  const masterDataMissing = missing.some((key) => !ownWay.has(key) && !key.startsWith('anlage') && !key.startsWith('unbestaetigt.') && !key.startsWith('zuLang.'))
  const locked = missing.length > 0

  function pay() {
    setMessage(null)
    checkout.mutate(
      { jahr: year },
      {
        onSuccess: (response) => openCheckout(response.data.checkoutUrl),
        // WEB-10: a 429 names its wait, a lost session says so; the rest in the shared wording.
        onError: (error) => setMessage({ kind: 'fehler', text: failureMessage(error, { unknown: t('ausdruck.fehler') }) }),
      },
    )
  }

  async function download(editable = false) {
    setLoading(true)
    setMessage(null)
    try {
      const result = await loadPrintout(year, { editable })
      setMessage(result.ok ? { kind: 'ok', text: t('ausdruck.heruntergeladen') } : { kind: 'fehler', text: failureMessage(result.error, { validation: t('ausdruck.fehler'), unknown: t('ausdruck.fehler') }) })
      if (!result.ok && result.status === 422) void check.refetch()
    } catch (error) {
      setMessage({ kind: 'fehler', text: failureMessage(new NetworkError(error)) })
    } finally {
      setLoading(false)
    }
  }

  function handleInspectField(screen: Screen, field?: string) {
    if (onInspectField) {
      onInspectField(screen, field)
      return
    }
    switch (screen) {
      case 'stammdaten':
      case 'profil':
      case 'kopplung':
        onCompleteDetails()
        return
      case 'chLohnausweis':
        onCompleteCrossBorder()
        return
      case 'kapital':
        onCompleteCapital()
        return
      case 'vermietung':
        onCompleteRental()
        return
      case 'kind':
        onCompleteChildren()
        return
      case 'interview':
        if (field?.startsWith('riester')) onCompleteRiester()
        else onCompleteDetails()
        return
      default:
        onCompleteDetails()
    }
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.appbar}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('ausdruck.back')} onPress={onBack} style={styles.backButton} testID="ausdruck-zurueck">
          <Text style={styles.backGlyph}>←</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t('ausdruck.title', { jahr: year })}</Text>
      </View>
      <Text style={styles.sectionBody}>{t('ausdruck.intro')}</Text>

      <GlassFormPreview year={year} onInspectField={handleInspectField} />

      {locked ? (
        <Card style={{ marginBottom: theme.space.s4 }}>
          <Text style={styles.sectionTitle}>{t('ausdruck.fehlendTitel')}</Text>
          {masterDataMissing ? <Text style={styles.sectionBody}>{t('ausdruck.fehlendAngaben')}</Text> : null}
          {married ? <Text style={styles.sectionBody}>{t('ausdruck.fehlendEhegatte')}</Text> : null}
          {annexes.map((annex) => (
            <Text key={annex} style={styles.sectionBody}>
              {t('ausdruck.anlageNochNicht', { anlage: t(`ausdruck.anlagen.${annex}`) })}
            </Text>
          ))}
          {unconfirmed.length > 0 ? (
            <>
              <Text style={styles.sectionBody}>
                {t('ausdruck.fehlendUnbestaetigt', { anlagen: unconfirmed.map((a) => t(`bestaetigung.anlagen.${a}`)).join(', ') })}
              </Text>
              <Button variant="ghost" onPress={onConfirm} testID="ausdruck-bestaetigung-oeffnen">
                {t('ausdruck.bestaetigungOeffnen')}
              </Button>
            </>
          ) : null}
          {personBUnconfirmed ? <Text style={styles.sectionBody}>{t('ausdruck.fehlendPersonB')}</Text> : null}
          {tooLong.length > 0 ? (
            <Text style={styles.sectionBody} testID="ausdruck-zu-lang">
              {t('ausdruck.fehlendZuLang', { felder: tooLong.map((id) => t(`ausdruck.feldNamen.${id.replace('.', '_')}`, { defaultValue: id })).join(', ') })}
            </Text>
          ) : null}
          {masterDataMissing || married ? (
            <Button variant="ghost" onPress={onCompleteDetails} testID="ausdruck-angaben-ergaenzen">
              {t('ausdruck.angabenErgaenzen')}
            </Button>
          ) : null}
          {kinder ? (
            <>
              <Text style={styles.sectionBody} testID="ausdruck-kinder-fehlend">
                {childFields.length > 0
                  ? t('ausdruck.fehlendKinderGenau', { felder: childFields.map((field) => t(`ausdruck.kinderFelder.${field}`)).join(', ') })
                  : t('ausdruck.fehlendKinder')}
              </Text>
              <Button variant="ghost" onPress={onCompleteChildren} testID="ausdruck-kinder-ergaenzen">
                {t('ausdruck.kinderErgaenzen')}
              </Button>
            </>
          ) : null}
          {crossBorder ? (
            <>
              <Text style={styles.sectionBody}>{t('ausdruck.fehlendGrenzgaenger')}</Text>
              <Button variant="ghost" onPress={onCompleteCrossBorder}>
                {t('ausdruck.grenzgaengerErgaenzen')}
              </Button>
            </>
          ) : null}
          {capital ? (
            <>
              <Text style={styles.sectionBody}>{t('ausdruck.fehlendKapital')}</Text>
              <Button variant="ghost" onPress={onCompleteCapital}>
                {t('ausdruck.kapitalErgaenzen')}
              </Button>
            </>
          ) : null}
          {rental ? (
            <>
              <Text style={styles.sectionBody}>{t('ausdruck.fehlendVermietung')}</Text>
              <Button variant="ghost" onPress={onCompleteRental}>
                {t('ausdruck.vermietungErgaenzen')}
              </Button>
            </>
          ) : null}
          {riester ? (
            <>
              <Text style={styles.sectionBody}>{t('ausdruck.fehlendRiester')}</Text>
              <Button variant="ghost" onPress={onCompleteRiester}>
                {t('ausdruck.riesterErgaenzen')}
              </Button>
            </>
          ) : null}
        </Card>
      ) : null}

      {payment === 'abbruch' && unlock !== 'freigeschaltet' ? <Text style={styles.hint}>{t('ausdruck.zahlungAbgebrochen')}</Text> : null}

      {unlock === 'nicht-verfuegbar' ? <Text style={styles.sectionBody}>{t('ausdruck.nichtVerfuegbar')}</Text> : null}

      {unlock === 'offen' && payment === 'erfolg' ? (
        <View style={{ gap: theme.space.s3 }}>
          <Text style={styles.sectionBody} accessibilityLiveRegion="polite">
            {t('ausdruck.zahlungLaeuft')}
          </Text>
          <Button variant="ghost" onPress={() => void status.refetch()}>
            {t('ausdruck.aktualisieren')}
          </Button>
        </View>
      ) : null}

      {unlock === 'offen' && payment !== 'erfolg' ? (
        <View style={{ gap: theme.space.s2 }}>
          <Button onPress={pay} disabled={checkout.isPending || locked} testID="ausdruck-bezahlen">
            {t('ausdruck.freischalten')}
          </Button>
          <Text style={styles.hint}>{t('ausdruck.freischaltenHinweis')}</Text>
        </View>
      ) : null}

      {unlock === 'freigeschaltet' ? (
        <>
          <Button onPress={() => void download()} disabled={loading || locked} testID="ausdruck-herunterladen">
            {t('ausdruck.herunterladen')}
          </Button>
          <Button variant="ghost" onPress={() => void download(true)} disabled={loading || locked} testID="ausdruck-herunterladen-bearbeitbar">
            {t('ausdruck.herunterladenBearbeitbar')}
          </Button>
          <Text style={styles.hint}>{t('ausdruck.bearbeitbarHinweis')}</Text>
        </>
      ) : null}

      {message ? (
        <Text style={message.kind === 'ok' ? styles.successNote : styles.errorNote} accessibilityLiveRegion="polite" {...(message.kind === 'fehler' ? { accessibilityRole: 'alert' as const } : {})}>
          {message.text}
        </Text>
      ) : null}

      <View style={{ marginTop: theme.space.s5 }}>
        <Text style={styles.sectionTitle}>{t('ausdruck.hinweiseTitel')}</Text>
        {(t('ausdruck.hinweise', { returnObjects: true }) as string[]).map((notice) => (
          <Text key={notice} style={styles.sectionBody}>
            • {notice}
          </Text>
        ))}
        <Text style={styles.hint}>{t('ausdruck.hinweisEdaten')}</Text>
      </View>
    </ScrollView>
  )
}
