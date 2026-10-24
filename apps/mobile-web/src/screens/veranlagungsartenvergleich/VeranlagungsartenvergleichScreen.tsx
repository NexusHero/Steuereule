// Veranlagungsartenvergleich (M1, ticket 10.2) — "zwei Zahlen + Empfehlung" aus dem
// Veranlagungsartenvergleich (ADR-0034): Einzel- vs. Zusammenveranlagung als bounded
// comparison, NIE ein nacktes Urteil. `aussage`/`kind` wird ZUERST gelesen:
//   - `eindeutig`  → die Empfehlung (einzel/zusammen);
//   - `zu-knapp`   → ehrlich "zu knapp, um das zu sagen";
//   - `unbestimmt` → ehrlich "das können wir noch nicht".
// Beide Zahlen tragen einen Herkunfts-Chip (welche zvE-Basen, welche Bestandteile).
//
// NAMENS-DISZIPLIN (ADR-0034 §1): "Günstigerprüfung" ist für §32d Abs. 6 EStG reserviert
// (Ticket 10.5) — dieser Screen heißt Veranlagungsartenvergleich, in Code, Tests und Prosa.
//
// M1-HONESTY: der Verheiratet-Flag und das Partner-Einkommen sind Screen-Eingaben, weil M1 sie
// noch nicht persistiert (die Segment-2-Frage `partner` ist deklariert, aber noch nicht
// server-seitig zugelassen — Kopplung D4). Der Screen fragt sie direkt und reicht sie als
// Query-Params an den Endpoint weiter — nie ein erfundener Partner-Wert.
import { useState } from 'react'
import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, HerkunftsChip, Input, Option, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { formatEuro } from '@steuereule/core'
import {
  useVeranlagungsartenvergleichControllerGetVergleich,
  type VeranlagungsartenvergleichControllerGetVergleichParams,
  type VeranlagungsartenvergleichDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'

export interface VeranlagungsartenvergleichScreenProps {
  readonly onBack?: () => void
  readonly onDone?: () => void
  readonly taxYear?: number
}

export function VeranlagungsartenvergleichScreen({ onBack, onDone, taxYear = CURRENT_TAX_YEAR }: VeranlagungsartenvergleichScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)

  const [verheiratet, setVerheiratet] = useState(false)
  const [zveB, setZveB] = useState('')
  const zveBWert = Number(zveB)
  const bereit = verheiratet && zveB !== '' && Number.isFinite(zveBWert) && zveBWert >= 0

  // Build the params object conditionally so an absent zveB is OMITTED (not `undefined`) —
  // exactOptionalPropertyTypes forbids `zveB: undefined` on the generated params type.
  const params: VeranlagungsartenvergleichControllerGetVergleichParams = bereit
    ? { verheiratet, zveB: zveBWert }
    : { verheiratet }

  const query = useVeranlagungsartenvergleichControllerGetVergleich(taxYear, params, { query: { enabled: bereit } })

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('veranlagungsartenvergleich.back')} onPress={onBack} /> : <BackButtonSpacer />}
      </View>

      <Text style={styles.heading}>{tr('veranlagungsartenvergleich.heading')}</Text>

      {/* M1 inputs: the married flag + partner income are not persisted yet (Segment 2 not
          admitted) — asked directly here, never a fabricated default. */}
      <Text style={styles.label}>{tr('veranlagungsartenvergleich.verheiratetLabel')}</Text>
      <View style={styles.optionRow}>
        <Option gewaehlt={verheiratet} onPress={() => setVerheiratet(true)} testID="verheiratet-ja">
          {tr('veranlagungsartenvergleich.ja')}
        </Option>
        <Option gewaehlt={!verheiratet} onPress={() => setVerheiratet(false)} testID="verheiratet-nein">
          {tr('veranlagungsartenvergleich.nein')}
        </Option>
      </View>

      {verheiratet ? (
        <View style={styles.inputBlock}>
          <Text style={styles.label}>{tr('veranlagungsartenvergleich.partnerEinkommenLabel')}</Text>
          <Input
            type="numeric"
            mono
            value={zveB}
            onChange={setZveB}
            placeholder={tr('veranlagungsartenvergleich.partnerEinkommenPlaceholder')}
            testID="zveb-input"
            accessibilityLabel={tr('veranlagungsartenvergleich.partnerEinkommenLabel')}
          />
        </View>
      ) : (
        <Text style={styles.hinweis}>{tr('veranlagungsartenvergleich.nichtVerheiratet')}</Text>
      )}

      {bereit && query.isPending ? <LoadingState bp={bp} label={tr('veranlagungsartenvergleich.loading')} /> : null}
      {bereit && (query.isError || query.data?.status !== 200) ? (
        <ErrorState
          bp={bp}
          heading={tr('veranlagungsartenvergleich.loadError.heading')}
          message={tr('veranlagungsartenvergleich.loadError.message')}
          retryLabel={tr('veranlagungsartenvergleich.loadError.retry')}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {bereit && !query.isPending && query.data?.status === 200 && query.data.data !== null ? (
        <Ergebnis dto={query.data.data} />
      ) : null}

      {onDone ? (
        <Button variante="ghost" onPress={onDone} style={styles.doneCta}>
          {tr('plausibilitaet.back')}
        </Button>
      ) : null}
    </ScrollView>
  )
}

/** The comparison result: `aussage`/`kind` FIRST, then the two numbers with Herkunfts-Chips. */
function Ergebnis({ dto }: { readonly dto: VeranlagungsartenvergleichDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)

  if (dto.kind === 'nicht-anwendbar') {
    const text = dto.grund === 'keine-einnahmen' ? tr('veranlagungsartenvergleich.keineEinnahmen') : tr('veranlagungsartenvergleich.nichtVerheiratet')
    return <Text style={styles.aussage}>{text}</Text>
  }

  const aussage =
    dto.kind === 'eindeutig'
      ? dto.empfehlung === 'zusammen'
        ? tr('veranlagungsartenvergleich.eindeutigZusammen')
        : tr('veranlagungsartenvergleich.eindeutigEinzel')
      : dto.kind === 'zu-knapp'
        ? tr('veranlagungsartenvergleich.zuKnapp')
        : tr('veranlagungsartenvergleich.unbestimmt')

  const zveA = dto.herkunft?.zveA ?? 0
  const zveB = dto.herkunft?.zveB ?? 0
  const rechenweg = tr('veranlagungsartenvergleich.herkunftRechenweg', { zveA, zveB })

  return (
    <View style={styles.resultBlock}>
      <Text style={styles.aussage} testID="aussage">
        {aussage}
      </Text>

      <Card>
        <Text style={styles.zahlLabel}>{tr('veranlagungsartenvergleich.einzel')}</Text>
        <Text style={styles.zahl}>{formatEuro(dto.einzel ?? 0)}</Text>
        <HerkunftsChip quelle={{ regel: tr('veranlagungsartenvergleich.herkunftRegelEinzel'), rechenweg }} />
      </Card>

      <Card>
        <Text style={styles.zahlLabel}>{tr('veranlagungsartenvergleich.zusammen')}</Text>
        <Text style={styles.zahl}>{formatEuro(dto.zusammen ?? 0)}</Text>
        <HerkunftsChip quelle={{ regel: tr('veranlagungsartenvergleich.herkunftRegelZusammen'), rechenweg }} />
      </Card>

      {dto.unschaerfe?.kind === 'unbestimmt' ? (
        <Text style={styles.hinweis}>{tr('veranlagungsartenvergleich.progressionsvorbehaltHinweis')}</Text>
      ) : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = {
    backgroundColor: t.color.grund,
    paddingHorizontal: t.space.s5,
    paddingVertical: t.space.s6,
    minHeight: '100%',
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  }
  const wideScreen: ViewStyle = { ...screen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
  const headerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', marginBottom: t.space.s4 }
  const heading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['2xl'],
    color: t.color.tinte,
    marginBottom: t.space.s3,
  }
  const label: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.s, marginBottom: t.space.s2 }
  const optionRow: ViewStyle = { flexDirection: 'row', gap: t.space.s3 }
  const inputBlock: ViewStyle = { marginTop: t.space.s3 }
  const hinweis: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s, marginTop: t.space.s3 }
  const resultBlock: ViewStyle = { marginTop: t.space.s5 }
  const aussage: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.xl, marginBottom: t.space.s4 }
  const zahlLabel: TextStyle = { color: t.color.tinte2, fontFamily: t.font.mono, fontSize: t.size.xs, textTransform: 'uppercase', letterSpacing: 0.08 * t.size.xs, marginBottom: t.space.s1 }
  const zahl: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['2xl'], fontVariant: ['tabular-nums'], marginBottom: t.space.s2 }
  const doneCta: ViewStyle = { marginTop: t.space.s5 }
  return { screen, wideScreen, headerRow, heading, label, optionRow, inputBlock, hinweis, resultBlock, aussage, zahlLabel, zahl, doneCta }
}
