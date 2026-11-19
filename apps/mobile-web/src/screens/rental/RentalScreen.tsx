import { useState } from 'react'
import { Pressable, ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, DateInput, Feld, germanDateToIso, Input, isoDateToGerman, useTheme, useBreakpoint, type UiTheme } from '@steuereule/ui'
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
  type RentalRepairDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { UnclearableNumberField } from '../shared/UnclearableNumberField'
import { screenHeaderStyles } from '../shared/screenStyles'
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
import { wholeEurosFrom } from '../shared/wholeEuros'

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
          taxYear={taxYear}
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
  taxYear = CURRENT_TAX_YEAR,
}: {
  readonly paar?: boolean
  readonly taxYear?: number
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
        <UnclearableNumberField
          key={field}
          label={tr(`vermietung.felder.${field}`)}
          state={property[field]}
          placeholder={tr('vermietung.feld.placeholder')}
          unclearLabel={tr('vermietung.feld.unklar')}
          testID={`vermietung-${index}-${field}`}
          onRecorded={(value) => onSend(field, { kind: 'erfasst', value })}
          onUnclear={() => onSend(field, { kind: 'unklar' })}
        />
      ))}

      <View style={{ marginTop: t.space.s3, borderTopWidth: t.space.kontur, borderTopColor: t.color.tinte, paddingTop: t.space.s3 }}>
        <Text style={{ ...t.type.itemTitle, color: t.color.tinte, marginBottom: t.space.s2 }}>
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
        <AcquisitionDate property={property} index={index} taxYear={taxYear} onSend={(anschaffungsdatum) => onSendAddress?.({ anschaffungsdatum })} />
        <RepairsList property={property} index={index} taxYear={taxYear} onSend={(erhaltungsaufwand) => onSendAddress?.({ erhaltungsaufwand })} />
      </View>

      <FactsNotice property={property} />
    </Card>
  )
}

/** ADR-0099 §8: the day of purchase, for the 15 % window of § 6 Abs. 1 Nr. 1a EStG in the Verlauf. */
function AcquisitionDate({ property, index, taxYear, onSend }: { readonly property: RentalPropertyDto; readonly index: number; readonly taxYear: number; readonly onSend: (iso: string | null) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const [text, setText] = useState(isoDateToGerman(property.anschaffungsdatum ?? ''))
  function commit(value: string = text) {
    if (value.trim() === '') {
      if (property.anschaffungsdatum !== null) onSend(null)
      return
    }
    const iso = germanDateToIso(value)
    if (iso !== null && iso !== property.anschaffungsdatum) onSend(iso)
  }
  return (
    <Feld label={tr('vermietung.anschaffungsdatum')}>
      <Text style={{ ...t.type.small, color: t.color.tinte2 }}>{tr('vermietung.anschaffungsdatumHilfe')}</Text>
      <DateInput
        value={text}
        onChange={(value) => {
          setText(value)
          if (value.length === 10 && value !== text) commit(value)
        }}
        max={`${taxYear}-12-31`}
        calendarLabel={tr('datum.kalender')}
        onSubmit={() => commit()}
        onBlur={() => commit()}
        accessibilityLabel={tr('vermietung.anschaffungsdatum')}
        testID={`vermietung-${index}-anschaffungsdatum`}
      />
    </Feld>
  )
}

interface RepairDraft {
  readonly key: number
  readonly betrag: string
  readonly datum: string
}

/** The repairs to send: whole euros above zero, a complete date or none; rows still being typed stay out. */
function repairsOf(drafts: readonly RepairDraft[]): RentalRepairDto[] {
  return drafts.flatMap((d) => {
    const betrag = wholeEurosFrom(d.betrag)
    if (betrag === null || betrag <= 0) return []
    const datum = d.datum.trim() === '' ? null : germanDateToIso(d.datum)
    return [{ betrag, datum }]
  })
}

/** ADR-0099 §8: the Erhaltungsaufwand of the year, one line per invoice with an optional date. */
function RepairsList({ property, index, taxYear, onSend }: { readonly property: RentalPropertyDto; readonly index: number; readonly taxYear: number; readonly onSend: (repairs: RentalRepairDto[]) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const [drafts, setDrafts] = useState<RepairDraft[]>(() => property.erhaltungsaufwand.map((r, i) => ({ key: i, betrag: String(r.betrag), datum: isoDateToGerman(r.datum ?? '') })))
  const [nextKey, setNextKey] = useState(property.erhaltungsaufwand.length)
  const stored = JSON.stringify(property.erhaltungsaufwand.map((r) => ({ betrag: r.betrag, datum: r.datum ?? null })))

  function commit(next: readonly RepairDraft[] = drafts) {
    const repairs = repairsOf(next)
    if (JSON.stringify(repairs) !== stored) onSend(repairs)
  }
  function update(key: number, patch: Partial<Omit<RepairDraft, 'key'>>) {
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  return (
    <View style={{ marginTop: t.space.s3, gap: t.space.s2 }} testID={`vermietung-${index}-erhaltung`}>
      <Text style={{ ...t.type.itemTitle, color: t.color.tinte }}>{tr('vermietung.erhaltung.titel', { jahr: taxYear })}</Text>
      {drafts.length === 0 ? <Text style={{ ...t.type.small, color: t.color.tinte2 }}>{tr('vermietung.erhaltung.leer')}</Text> : null}
      {drafts.map((d, i) => (
        <View key={d.key} style={{ gap: t.space.s1, borderTopWidth: 1, borderTopColor: t.color.linieWeich, paddingTop: t.space.s2 }}>
          <Text style={{ ...t.type.labelStrong, color: t.color.tinte }}>{tr('vermietung.erhaltung.eintrag', { nummer: i + 1 })}</Text>
          <Feld label={tr('vermietung.erhaltung.betrag')}>
            <Input
              type="numeric"
              mono
              value={d.betrag}
              placeholder="1200"
              accessibilityLabel={`${tr('vermietung.erhaltung.eintrag', { nummer: i + 1 })}: ${tr('vermietung.erhaltung.betrag')}`}
              onChange={(betrag) => update(d.key, { betrag })}
              onBlur={() => commit()}
              onSubmit={() => commit()}
              testID={`vermietung-${index}-erhaltung-${i}-betrag`}
            />
          </Feld>
          <Feld label={tr('vermietung.erhaltung.datum')}>
            <DateInput
              value={d.datum}
              onChange={(datum) => {
                update(d.key, { datum })
                if (datum.length === 10) commit(drafts.map((x) => (x.key === d.key ? { ...x, datum } : x)))
              }}
              min={`${taxYear}-01-01`}
              max={`${taxYear}-12-31`}
              calendarLabel={tr('datum.kalender')}
              onBlur={() => commit()}
              onSubmit={() => commit()}
              accessibilityLabel={`${tr('vermietung.erhaltung.eintrag', { nummer: i + 1 })}: ${tr('vermietung.erhaltung.datum')}`}
              testID={`vermietung-${index}-erhaltung-${i}-datum`}
            />
          </Feld>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('vermietung.erhaltung.entfernenA11y', { nummer: i + 1 })}
            onPress={() => {
              const next = drafts.filter((x) => x.key !== d.key)
              setDrafts(next)
              commit(next)
            }}
            style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
            testID={`vermietung-${index}-erhaltung-${i}-entfernen`}
          >
            <Text style={{ ...t.type.small, color: t.color.tinte, textDecorationLine: 'underline' }}>{tr('vermietung.erhaltung.entfernen')}</Text>
          </Pressable>
        </View>
      ))}
      <Button
        variant="ghost"
        onPress={() => {
          setDrafts((list) => [...list, { key: nextKey, betrag: '', datum: '' }])
          setNextKey((k) => k + 1)
        }}
        testID={`vermietung-${index}-erhaltung-hinzufuegen`}
      >
        {tr('vermietung.erhaltung.hinzufuegen')}
      </Button>
    </View>
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
  const screen: ViewStyle = t.layout.flow.narrow
  const wideScreen: ViewStyle = t.layout.flow.wide
  const notice: TextStyle = {
    ...t.type.body,
    color: t.color.tinte,
    borderLeftWidth: 3,
    borderLeftColor: t.color.funke,
    paddingLeft: t.space.s3,
    marginBottom: t.space.s4,
  }
  const propertyCard: ViewStyle = { marginBottom: t.space.s4 }
  const propertyHeading: TextStyle = { ...t.type.cardTitle, color: t.color.tinte, marginBottom: t.space.s3 }
  const factsBlock: ViewStyle = { marginTop: t.space.s3, padding: t.space.s3, borderWidth: t.space.kontur, borderColor: t.color.tinte, borderRadius: t.radius.s }
  const factsRow: TextStyle = { ...t.type.body, color: t.color.tinte, marginBottom: t.space.s1 }
  const factsSource: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const factsOpen: TextStyle = { ...t.type.small, color: t.color.tinte2, marginTop: t.space.s2 }
  const addCta: ViewStyle = { marginTop: t.space.s2 }
  const statusBlock: ViewStyle = { marginTop: t.space.s4, padding: t.space.s3, borderWidth: t.space.kontur, borderColor: t.color.tinte, borderRadius: t.radius.s }
  const statusHeading: TextStyle = { ...t.type.itemTitle, color: t.color.tinte, marginBottom: t.space.s2 }
  const statusLine: TextStyle = { ...t.type.body, color: t.color.tinte, marginBottom: t.space.s1 }
  const statusOpen: TextStyle = { ...t.type.small, color: t.color.tinte2, marginTop: t.space.s2 }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  return {
    screen,
    wideScreen,
    ...screenHeaderStyles(t),
    notice,
    objektCard: propertyCard,
    objektHeading: propertyHeading,
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
