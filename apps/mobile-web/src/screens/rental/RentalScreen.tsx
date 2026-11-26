import { useEffect, useRef, useState } from 'react'
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
import { useConfirmAction } from '../../confirm/useConfirmAction'
import { UnclearableNumberField } from '../shared/UnclearableNumberField'
import { screenHeaderStyles } from '../shared/screenStyles'
import { runningTaxYear } from '../../config/taxYear'
import { CatalogScreen } from '../catalog/CatalogScreen'
import { LoadingState, LoadFailedState } from '../shared/ScreenState'
import { InlineLoadFailure } from '../shared/InlineLoadFailure'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { usePendingMutations } from '../shared/usePendingMutations'
import { SaveFailedNotice } from '../shared/SaveFailedNotice'
import { watchSaveResult } from '../shared/saveFeedback'
import { useTrackField } from '../shared/useTrackField'
import { PostalCodeHint } from '../shared/PostalCodeHint'
import { prefillCity } from '../shared/postalCodePrefill'
import { AddressSearch } from '../shared/AddressSearch'
import { wholeEurosFrom } from '../shared/wholeEuros'
import { integerFrom } from '../shared/integer'

export interface RentalScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
}

export function RentalScreen({ onDone = () => {}, onBack, taxYear = runningTaxYear() }: RentalScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useRentalControllerGet(taxYear)
  const createProperty = useRentalControllerCreate()
  const setField = useRentalControllerSetField()
  const setAddress = useRentalControllerSetAddress()
  const { track, flushThen, saveFailed, saveError, clearSaveError } = usePendingMutations()
  const trackField = useTrackField(track, clearSaveError)

  // The depot / the kind of letting is a catalogue answer; the mask can ask it right here.
  const [questionOpen, setQuestionOpen] = useState(false)
  const link = useLinkControllerGet(taxYear)

  if (query.isPending) {
    return <LoadingState bp={bp} label={tr('vermietung.loading')} />
  }
  if (query.isError) return <LoadFailedState bp={bp} error={query.error} onRetry={() => void query.refetch()} />

  const response = query.data.data
  const paar = link.data?.data.filingType === 'zusammen'

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
    trackField(`${propertyId}:${field}`, watchSaveResult(setField.mutateAsync({ jahr: taxYear, objektId: propertyId, feld: field, data })).then(invalidate))
  }

  function sendAddress(propertyId: string, data: PutRentalAddressDto) {
    trackField(`${propertyId}:${Object.keys(data).sort((a, b) => a.localeCompare(b)).join(',')}`, watchSaveResult(setAddress.mutateAsync({ jahr: taxYear, objektId: propertyId, data })).then(invalidate))
  }

  function addProperty() {
    // NM-13: a second tap while the first is on its way does not create a second property.
    if (createProperty.isPending) return
    trackField('neues-objekt', watchSaveResult(createProperty.mutateAsync({ jahr: taxYear })).then(invalidate))
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
      {link.isError && response.properties.length > 0 ? (
        // NM-15: without the link the share question would vanish silently and the property count as A's alone.
        <InlineLoadFailure what={tr('vermietung.anteilLadefehler')} error={link.error} onRetry={() => void link.refetch()} testID="vermietung-anteil-ladefehler" />
      ) : null}

      {response.classification.kind === 'verkauf-oder-moebliert' ? null : (
        <Button variant="ghost" onPress={addProperty} disabled={createProperty.isPending} style={styles.addCta} testID="objekt-hinzufuegen">
          {tr('vermietung.addObjekt')}
        </Button>
      )}

      <StatusNotice response={response} />

      <SaveFailedNotice visible={saveFailed || saveError !== null} error={saveError} />
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
  taxYear = runningTaxYear(),
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
    // Sent once the field is left (WEB-39), not on every keystroke.
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
          <DraftInput
            stored={[property.strasse, property.hausnummer].filter(Boolean).join(' ')}
            placeholder="Musterstraße 12"
            accessibilityLabel="Straße und Hausnummer"
            autoComplete="street-address"
            testID={`vermietung-${index}-adresse`}
            onCommit={(val) => onSendAddress?.(streetAndNumber(val))}
          />
        </Feld>
        <View style={{ flexDirection: 'row', gap: t.space.s2 }}>
          <View style={{ flex: 1 }}>
            <Feld label="PLZ">
              <DraftInput
                stored={property.plz ?? ''}
                placeholder="10115"
                type="numeric"
                accessibilityLabel="Postleitzahl"
                autoComplete="postal-code"
                testID={`vermietung-${index}-plz`}
                onCommit={sendPostalCode}
              />
            </Feld>
          </View>
          <View style={{ flex: 2 }}>
            <Feld label="Ort">
              <DraftInput
                stored={property.city ?? ''}
                placeholder="Berlin"
                accessibilityLabel="Ort"
                autoComplete="address-level2"
                testID={`vermietung-${index}-ort`}
                onCommit={(city) => onSendAddress?.({ city })}
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
          <DraftInput
            stored={property.livingArea ?? ''}
            placeholder="85"
            type="numeric"
            accessibilityLabel="Gesamtwohnfläche"
            testID={`vermietung-${index}-wohnflaeche`}
            onCommit={(livingArea) => onSendAddress?.({ livingArea })}
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
          <WholeNumberAttribute
            key={field}
            label={label}
            stored={property[field] ?? ''}
            example={example}
            amount={field === 'umlagen' || field === 'schuldzinsen'}
            testID={`vermietung-${index}-${field}`}
            onCommit={(value) => onSendAddress?.({ [field]: value })}
          />
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

function repairUnreadable(draft: RepairDraft): boolean {
  return draft.betrag.trim() !== '' && wholeEurosFrom(draft.betrag) === null
}

/** „Am Markt 5“ → street „Am Markt“, number „5“; without a trailing number the number is cleared. */
function streetAndNumber(text: string): PutRentalAddressDto {
  const value = text.trim()
  const match = /^(.*\S)\s+(\d+\s?[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?)$/.exec(value)
  return match ? { strasse: match[1]!, hausnummer: match[2]!.replace(/\s/g, '') } : { strasse: value, hausnummer: '' }
}

/**
 * A text field of the property (WEB-39 / NM-04): it holds what the user types and sends it once the field is
 * left, instead of a PUT per keystroke whose answer overwrote the field (spaces vanished, characters got lost).
 * It follows the stored value while the user is not typing.
 */
function DraftInput({
  stored,
  onCommit,
  ...input
}: {
  readonly stored: string
  readonly onCommit: (text: string) => void
  readonly placeholder: string
  readonly accessibilityLabel: string
  readonly testID: string
  readonly type?: 'numeric'
  readonly autoComplete?: 'street-address' | 'postal-code' | 'address-level2'
}) {
  const [text, setText] = useState(stored)
  const editing = useRef(false)
  // A new stored value (the answer to a save, a refetch) replaces the text unless the user is typing; a
  // failed save leaves the typed text where it is.
  useEffect(() => {
    if (!editing.current) setText(stored)
  }, [stored])
  const commit = () => {
    editing.current = false
    if (text.trim() !== stored.trim()) onCommit(text.trim())
  }
  return (
    <Input
      {...input}
      value={text}
      onChange={(next) => {
        editing.current = true
        setText(next)
      }}
      onBlur={commit}
      onSubmit={commit}
    />
  )
}

/** A count, share or whole-euro amount of the property; unreadable text and an emptied stored value are named. */
function WholeNumberAttribute({
  label,
  stored,
  example,
  amount,
  testID,
  onCommit,
}: {
  readonly label: string
  readonly stored: string
  readonly example: string
  readonly amount: boolean
  readonly testID: string
  readonly onCommit: (value: string) => void
}) {
  const { t: tr } = useTranslation(APP_NS)
  const [problem, setProblem] = useState<'unlesbar' | 'leer' | null>(null)
  return (
    <Feld
      label={label}
      {...(problem === 'unlesbar' ? { error: tr(amount ? 'betrag.unlesbar' : 'arbeitstage.zahlUnlesbar') } : {})}
      {...(problem === 'leer' ? { error: tr('vermietung.leerenNichtMoeglich') } : {})}
    >
      <DraftInput
        stored={stored}
        placeholder={example}
        type="numeric"
        accessibilityLabel={label}
        testID={testID}
        onCommit={(text) => {
          if (text === '') {
            // The API keeps these fields once set; an empty field would silently show the old value again.
            setProblem(stored === '' ? null : 'leer')
            return
          }
          const value = amount ? wholeEurosFrom(text) : integerFrom(text)
          if (value === null) {
            setProblem('unlesbar')
            return
          }
          setProblem(null)
          if (String(value) !== stored) onCommit(String(value))
        }}
      />
    </Feld>
  )
}

/** ADR-0099 §8: the Erhaltungsaufwand of the year, one line per invoice with an optional date. */
function RepairsList({ property, index, taxYear, onSend }: { readonly property: RentalPropertyDto; readonly index: number; readonly taxYear: number; readonly onSend: (repairs: RentalRepairDto[]) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const confirmRemove = useConfirmAction('rentalRemoveRepair')
  const [drafts, setDrafts] = useState<RepairDraft[]>(() => property.erhaltungsaufwand.map((r, i) => ({ key: i, betrag: String(r.betrag), datum: isoDateToGerman(r.datum ?? '') })))
  const [nextKey, setNextKey] = useState(property.erhaltungsaufwand.length)
  const stored = JSON.stringify(property.erhaltungsaufwand.map((r) => ({ betrag: r.betrag, datum: r.datum ?? null })))

  function commit(next: readonly RepairDraft[] = drafts) {
    // An amount the app cannot read is named at its row; the list is not sent without it — that would delete
    // the stored repair the user is correcting.
    if (next.some(repairUnreadable)) return
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
          <Feld label={tr('vermietung.erhaltung.betrag')} {...(repairUnreadable(d) ? { error: tr('betrag.unlesbar') } : {})}>
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
            onPress={() =>
              confirmRemove.ask(
                () => {
                  const next = drafts.filter((x) => x.key !== d.key)
                  setDrafts(next)
                  commit(next)
                },
                { nummer: i + 1 },
              )
            }
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
      {confirmRemove.dialog}
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
