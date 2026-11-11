import { useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, Feld, Input, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { formatEuro, RENTAL_FIELDS, type RentalFieldId } from '@steuereule/core'
import {
  getCockpitControllerGetCockpitSummaryQueryKey,
  getRentalControllerGetQueryKey,
  getTaxEstimateControllerGetQueryKey,
  useLinkControllerGet,
  useRentalControllerCreate,
  useRentalControllerGet,
  useRentalControllerSetAddress,
  useRentalControllerSetField,
  type PutRentalAddressDto,
  type RentalFieldDto,
  type RentalResponseDto,
  type RentalPropertyDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { integerFrom } from '../shared/integer'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { CatalogScreen } from '../catalog/CatalogScreen'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { usePendingMutations } from '../shared/usePendingMutations'
import { SaveFailedNotice } from '../shared/SaveFailedNotice'
import { watchSaveResult } from '../shared/saveFeedback'
import { PostalCodeHint } from '../shared/PostalCodeHint'
import { prefillCity } from '../shared/postalCodePrefill'
import { AddressSearch } from '../shared/AddressSearch'

export interface RentalScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
}

export function RentalScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR }: RentalScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useRentalControllerGet(taxYear)
  const createProperty = useRentalControllerCreate()
  const setField = useRentalControllerSetField()
  const setAddress = useRentalControllerSetAddress()
  const { track, flushThen, saveFailed } = usePendingMutations()

  // The depot / the kind of letting is a catalogue answer; the mask can ask it right here.
  const [questionOpen, setQuestionOpen] = useState(false)
  const link = useLinkControllerGet(taxYear)

  if (query.isPending) {
    return <LoadingState bp={bp} label={tr('vermietung.loading')} />
  }
  if (query.isError || query.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('vermietung.loadError.heading')}
        message={tr('vermietung.loadError.message')}
        retryLabel={tr('vermietung.loadError.retry')}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const response = query.data.data
  const paar = link.data?.status === 200 && link.data.data.filingType === 'zusammen'

  if (questionOpen) {
    const back = () => {
      setQuestionOpen(false)
      void query.refetch()
    }
    return <CatalogScreen taxYear={taxYear} entry="einkuenfte" onDone={back} onBack={back} />
  }

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: getRentalControllerGetQueryKey(taxYear) })
    void queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) })
    void queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) })
  }

  function send(propertyId: string, field: RentalFieldId, data: RentalFieldDto) {
    track(watchSaveResult(setField.mutateAsync({ jahr: taxYear, objektId: propertyId, feld: field, data })).then(invalidate))
  }

  function sendAddress(propertyId: string, data: PutRentalAddressDto) {
    track(watchSaveResult(setAddress.mutateAsync({ jahr: taxYear, objektId: propertyId, data })).then(invalidate))
  }

  function addProperty() {
    track(watchSaveResult(createProperty.mutateAsync({ jahr: taxYear })).then(invalidate))
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('vermietung.back')} onPress={() => flushThen(onBack)} /> : <BackButtonSpacer />}
      </View>
      <Text style={styles.heading}>{tr('vermietung.heading')}</Text>
      <Text style={styles.help}>{tr('vermietung.help')}</Text>

      <ClassificationNotice kind={response.classification.kind} />
      {response.classification.kind === 'unbekannt' ? (
        <Button variant="ghost" onPress={() => setQuestionOpen(true)} testID="vermietung-frage-beantworten">
          {tr('katalog.einkuenfteBeantworten')}
        </Button>
      ) : null}

      {response.properties.map((property, index) => (
        <PropertyCard
          key={property.id}
          property={property}
          index={index}
          onSend={(field, data) => send(property.id, field, data)}
          onSendAddress={(data) => sendAddress(property.id, data)}
          paar={paar}
        />
      ))}

      {response.classification.kind === 'verkauf-oder-moebliert' ? null : (
        <Button variant="ghost" onPress={addProperty} style={styles.addCta} testID="objekt-hinzufuegen">
          {tr('vermietung.addObjekt')}
        </Button>
      )}

      <StatusNotice response={response} />

      <SaveFailedNotice visible={saveFailed} />
      <Button onPress={() => flushThen(onDone)} style={styles.cta} testID="vermietung-weiter">
        {tr('vermietung.weiter')}
      </Button>
    </ScrollView>
  )
}

function ClassificationNotice({ kind }: { readonly kind: RentalResponseDto['classification']['kind'] }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const text =
    kind === 'verkauf-oder-moebliert'
      ? tr('vermietung.einordnung.verkaufOderMoebliert')
      : kind === 'unbekannt'
        ? tr('vermietung.einordnung.unbekannt')
        : tr('vermietung.einordnung.berechenbar')
  return <Text style={styles.notice}>{text}</Text>
}

function PropertyCard({
  property,
  index,
  onSend,
  onSendAddress,
  paar = false,
}: {
  readonly paar?: boolean
  readonly property: RentalPropertyDto
  readonly index: number
  readonly onSend: (field: RentalFieldId, data: RentalFieldDto) => void
  readonly onSendAddress?: (address: PutRentalAddressDto) => void
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const [cityPrefill, setCityPrefill] = useState<string | null>(null)

  function sendPostalCode(plz: string) {
    // #451 slice 3: a one-place postal code fills an empty Ort of the property.
    const { city, prefill } = prefillCity({ plz, city: property.city ?? '', lastPrefill: cityPrefill })
    setCityPrefill(prefill)
    onSendAddress?.(city !== (property.city ?? '') ? { plz, city } : { plz })
  }

  return (
    <Card style={styles.objektCard}>
      <Text style={styles.objektHeading}>{tr('vermietung.objektHeading', { index: index + 1 })}</Text>
      {RENTAL_FIELDS.map((field) => (
        <RentalFieldEditor
          key={field}
          label={tr(`vermietung.felder.${field}`)}
          state={property[field]}
          testID={`vermietung-${index}-${field}`}
          onRecorded={(value) => onSend(field, { kind: 'erfasst', value })}
          onUnclear={() => onSend(field, { kind: 'unklar' })}
        />
      ))}

      <View style={{ marginTop: t.space.s3, borderTopWidth: t.space.kontur, borderTopColor: t.color.tinte, paddingTop: t.space.s3 }}>
        <Text style={{ fontFamily: t.font.display, fontWeight: t.weight.fett, fontSize: t.size.m, color: t.color.tinte, marginBottom: t.space.s2 }}>
          {tr('vermietung.adresseHeading', 'Objektadresse (für Anlage V)')}
        </Text>
        <AddressSearch
          postalCode={property.plz ?? ''}
          testIDPrefix={`vermietung-${index}`}
          onPick={(address) => {
            // The picked place is the user's choice, so the PLZ prefill must not treat the Ort as its own.
            setCityPrefill(null)
            const hausnummer = address.houseNumber !== null ? `${address.houseNumber}${address.houseNumberSuffix ?? ''}` : null
            onSendAddress?.({ strasse: address.street, ...(hausnummer ? { hausnummer } : {}), plz: address.postalCode, city: address.city })
          }}
        />
        <Feld label="Straße & Hausnummer">
          <Input
            value={[property.strasse, property.hausnummer].filter(Boolean).join(' ')}
            placeholder="Musterstraße 12"
            accessibilityLabel="Straße und Hausnummer"
            autoComplete="street-address"
            testID={`vermietung-${index}-adresse`}
            onChange={(val) => {
              const parts = val.split(' ')
              const h = parts.length > 1 ? parts.pop() : ''
              const hausnummer = h ? h : undefined
              const strasse = parts.join(' ')
              onSendAddress?.({ strasse, ...(hausnummer ? { hausnummer } : {}) })
            }}
          />
        </Feld>
        <View style={{ flexDirection: 'row', gap: t.space.s2 }}>
          <View style={{ flex: 1 }}>
            <Feld label="PLZ">
              <Input
                value={property.plz ?? ''}
                placeholder="10115"
                type="numeric"
                accessibilityLabel="Postleitzahl"
                autoComplete="postal-code"
                testID={`vermietung-${index}-plz`}
                onChange={sendPostalCode}
              />
            </Feld>
          </View>
          <View style={{ flex: 2 }}>
            <Feld label="Ort">
              <Input
                value={property.city ?? ''}
                placeholder="Berlin"
                accessibilityLabel="Ort"
                autoComplete="address-level2"
                testID={`vermietung-${index}-ort`}
                onChange={(city) => onSendAddress?.({ city })}
              />
            </Feld>
          </View>
        </View>
        <PostalCodeHint
          plz={property.plz ?? ''}
          city={property.city ?? ''}
          prefill={cityPrefill}
          onChooseCity={(city) => {
            setCityPrefill(city)
            onSendAddress?.({ city })
          }}
          testIDPrefix={`vermietung-${index}`}
        />
        <Feld label="Gesamtwohnfläche (m²)">
          <Input
            value={property.livingArea ?? ''}
            placeholder="85"
            type="numeric"
            accessibilityLabel="Gesamtwohnfläche"
            testID={`vermietung-${index}-wohnflaeche`}
            onChange={(livingArea) => onSendAddress?.({ livingArea })}
          />
        </Feld>
        {(
          [
            ['einheiten', 'Wie viele Wohnungen vermietest du in diesem Gebäude?', '1'],
            ['umlagen', 'Umlagen / Nebenkosten, die die Mieter gezahlt haben (€ im Jahr)', '2400'],
            ['schuldzinsen', 'Schuldzinsen für das Objekt, ohne Tilgung (€ im Jahr)', '3100'],
            ...(paar ? ([['anteilA', 'Dein Anteil am Objekt in % (der Rest gehört deinem Partner)', '50']] as const) : []),
          ] as const
        ).map(([field, label, example]) => (
          <Feld key={field} label={label}>
            <Input
              value={property[field] ?? ''}
              placeholder={example}
              type="numeric"
              accessibilityLabel={label}
              testID={`vermietung-${index}-${field}`}
              onChange={(value) => {
                if (/^\d+$/.test(value.trim())) onSendAddress?.({ [field]: value.trim() })
              }}
            />
          </Feld>
        ))}
        <Feld label="Ist die Gebäude-AfA unverändert wie im Vorjahr?">
          <View style={{ flexDirection: 'row', gap: t.space.s2 }}>
            <Chip
              active={property.depreciationAsLastYear === true}
              onPress={() => onSendAddress?.({ depreciationAsLastYear: true })}
              testID={index === 0 ? 'vermietung-afa-wie-vorjahr-ja' : `vermietung-${index}-afa-wie-vorjahr-ja`}
            >
              Ja
            </Chip>
            <Chip
              active={property.depreciationAsLastYear === false}
              onPress={() => onSendAddress?.({ depreciationAsLastYear: false })}
              testID={index === 0 ? 'vermietung-afa-wie-vorjahr-nein' : `vermietung-${index}-afa-wie-vorjahr-nein`}
            >
              Nein, im Jahr gekauft oder geändert
            </Chip>
          </View>
        </Feld>
      </View>

      <FactsNotice property={property} />
    </Card>
  )
}

function RentalFieldEditor({
  label,
  state,
  testID,
  onRecorded,
  onUnclear,
}: {
  readonly label: string
  readonly state: RentalFieldDto
  readonly testID?: string
  readonly onRecorded: (value: number) => void
  readonly onUnclear: () => void
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const [text, setText] = useState(state.kind === 'erfasst' ? String(state.value) : '')

  function commit() {
    const value = integerFrom(text)
    if (value === null) return
    if (state.kind === 'erfasst' && state.value === value) return
    onRecorded(value)
  }

  return (
    <Feld label={label}>
      <View style={s.feldRow}>
        <Input
          type="numeric"
          mono
          value={state.kind === 'unklar' ? '' : text}
          onChange={setText}
          placeholder={tr('vermietung.feld.placeholder')}
          onSubmit={commit}
          onBlur={commit}
          accessibilityLabel={`${label} (${tr('vermietung.feld.placeholder')})`}
          {...(testID ? { testID } : {})}
        />
        <Pressable accessibilityRole="button" onPress={onUnclear} style={s.unklarButton}>
          <Text style={state.kind === 'unklar' ? s.unklarActive : s.unklarLabel}>{tr('vermietung.feld.unklar')}</Text>
        </Pressable>
      </View>
    </Feld>
  )
}

function FactsNotice({ property }: { readonly property: RentalPropertyDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const { facts } = property

  if (facts.openItems === 3 && facts.einnahmen === null && facts.depreciation === null) {
    return <Text style={styles.faktenOffen}>{tr('vermietung.fakten.leer')}</Text>
  }

  return (
    <View style={styles.faktenBlock}>
      {facts.einnahmen !== null ? (
        <Text style={styles.faktenZeile}>{tr('vermietung.fakten.miete', { betrag: formatEuro(facts.einnahmen) })}</Text>
      ) : null}
      {facts.werbungskosten !== null ? (
        <Text style={styles.faktenZeile}>{tr('vermietung.fakten.werbungskosten', { betrag: formatEuro(facts.werbungskosten) })}</Text>
      ) : null}
      {facts.depreciation !== null ? (
        <View>
          <Text style={styles.faktenZeile}>{tr('vermietung.fakten.afa', { betrag: formatEuro(facts.depreciation.amount) })}</Text>
          <Text style={styles.faktenHerkunft}>{facts.depreciation.provenance}</Text>
        </View>
      ) : null}
      {facts.openItems > 0 ? (
        <Text style={styles.faktenOffen}>{tr('vermietung.fakten.offen', { count: facts.openItems })}</Text>
      ) : null}
    </View>
  )
}

function StatusNotice({ response }: { readonly response: RentalResponseDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const { status } = response
  if (response.properties.length === 0) return null

  return (
    <View style={styles.standBlock}>
      <Text style={styles.standHeading}>{tr('vermietung.stand.heading')}</Text>
      <Text style={styles.standZeile}>{tr('vermietung.stand.einnahmen', { betrag: formatEuro(status.einnahmen) })}</Text>
      <Text style={styles.standZeile}>{tr('vermietung.stand.werbungskosten', { betrag: formatEuro(status.werbungskosten) })}</Text>
      <Text style={styles.standZeile}>{tr('vermietung.stand.afa', { betrag: formatEuro(status.depreciation) })}</Text>
      {status.kind === 'offen' ? (
        <Text style={styles.standOffen}>{tr('vermietung.stand.offen', { count: status.openItems })}</Text>
      ) : null}
      {status.kind === 'offen' && status.gated !== undefined && status.gated.includes('Vermietung') ? (
        <Text style={styles.standOffen}>{tr('vermietung.stand.gated')}</Text>
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
    marginBottom: t.space.s2,
  }
  const help: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, marginBottom: t.space.s4 }
  const notice: TextStyle = {
    color: t.color.tinte,
    fontFamily: t.font.text,
    fontSize: t.size.m,
    borderLeftWidth: 3,
    borderLeftColor: t.color.funke,
    paddingLeft: t.space.s3,
    marginBottom: t.space.s4,
  }
  const propertyCard: ViewStyle = { marginBottom: t.space.s4 }
  const propertyHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.l, marginBottom: t.space.s3 }
  const fieldRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3 }
  const unclearButton: ViewStyle = {
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte,
    borderRadius: t.radius.s,
  }
  const unclearLabel: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s }
  const unclearActive: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.s }
  const factsBlock: ViewStyle = { marginTop: t.space.s3, padding: t.space.s3, borderWidth: t.space.kontur, borderColor: t.color.tinte, borderRadius: t.radius.s }
  const factsRow: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontSize: t.size.m, marginBottom: t.space.s1 }
  const factsSource: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s }
  const factsOpen: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s, marginTop: t.space.s2 }
  const addCta: ViewStyle = { marginTop: t.space.s2 }
  const statusBlock: ViewStyle = { marginTop: t.space.s4, padding: t.space.s3, borderWidth: t.space.kontur, borderColor: t.color.tinte, borderRadius: t.radius.s }
  const statusHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.m, marginBottom: t.space.s2 }
  const statusLine: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontSize: t.size.m, marginBottom: t.space.s1 }
  const statusOpen: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s, marginTop: t.space.s2 }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  return {
    screen,
    wideScreen,
    headerRow,
    heading,
    help,
    notice,
    objektCard: propertyCard,
    objektHeading: propertyHeading,
    feldRow: fieldRow,
    unklarButton: unclearButton,
    unklarLabel: unclearLabel,
    unklarActive: unclearActive,
    faktenBlock: factsBlock,
    faktenZeile: factsRow,
    faktenHerkunft: factsSource,
    faktenOffen: factsOpen,
    addCta,
    standBlock: statusBlock,
    standHeading: statusHeading,
    standZeile: statusLine,
    standOffen: statusOpen,
    cta,
  }
}
