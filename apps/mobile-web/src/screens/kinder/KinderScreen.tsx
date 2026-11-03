import { useState } from 'react'
import { Pressable, ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, Feld, Input, useBreakpoint, useTheme, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import {
  anspruchsMonate,
  formatEuro,
  kindergeldAnspruchMonat,
  kinderStand,
  KINDSCHAFTSVERHAELTNISSE,
  type Kindschaftsverhaeltnis,
} from '@steuereule/core'
import {
  getKinderControllerListQueryKey,
  useKinderControllerCreate,
  useKinderControllerDelete,
  useKinderControllerList,
  useKinderControllerUpdate,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { ErrorState, LoadingState } from '../shared/ScreenState'

export interface KindItem {
  id: string
  lfdNr: number
  vorname: string
  nachname: string
  geburtsdatum: string
  idnr?: string | null
  kindergeldAnspruchEur?: string | null
  kindschaftsverhaeltnis?: Kindschaftsverhaeltnis | null
  kindschaftsverhaeltnisB?: Kindschaftsverhaeltnis | null
  familienkasse?: string | null
  wohnsitzInlandGanzjaehrig?: boolean | null
}

/** What the form writes: the identity plus the Anlage-Kind facts (Zeilen 7, 8, 10). */
export interface KindEingabe {
  vorname: string
  nachname: string
  geburtsdatum: string
  idnr?: string
  kindergeldAnspruchEur?: string
  kindschaftsverhaeltnis: Kindschaftsverhaeltnis | null
  kindschaftsverhaeltnisB: Kindschaftsverhaeltnis | null
  familienkasse: string | null
  wohnsitzInlandGanzjaehrig: boolean | null
}

const KINDSCHAFT_LABEL: Record<Kindschaftsverhaeltnis, string> = {
  '1': 'Leibliches Kind / Adoptivkind',
  '2': 'Pflegekind',
  '3': 'Enkelkind / Stiefkind',
}

function fehltFuerAusdruck(k: KindItem): boolean {
  return !k.idnr || !k.kindschaftsverhaeltnis || !k.familienkasse || k.wohnsitzInlandGanzjaehrig == null
}

export interface KinderScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
  readonly initialKinder?: readonly KindItem[] | undefined
  readonly onAddKind?: ((kind: KindEingabe) => Promise<void> | void) | undefined
  readonly onSaveKind?: ((id: string, kind: KindEingabe) => Promise<void> | void) | undefined
  readonly onDeleteKind?: ((id: string) => Promise<void> | void) | undefined
}

export function KinderScreen(props: KinderScreenProps) {
  if (props.initialKinder !== undefined) {
    return <KinderScreenView {...props} initialKinder={props.initialKinder} />
  }
  return <ConnectedKinderScreen {...props} />
}

function ConnectedKinderScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR }: KinderScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useKinderControllerList(taxYear)
  const createKind = useKinderControllerCreate()
  const updateKind = useKinderControllerUpdate()
  const deleteKind = useKinderControllerDelete()

  if (query.isPending) {
    return <LoadingState bp={bp} label={tr('kinder.loading', 'Kinder werden geladen …')} />
  }
  if (query.isError || query.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('kinder.loadError.heading', 'Das hat nicht geklappt.')}
        message={tr('kinder.loadError.message', 'Deine Kinder konnten nicht geladen werden.')}
        retryLabel={tr('kinder.loadError.retry', 'Noch mal versuchen')}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: getKinderControllerListQueryKey(taxYear) })
  }

  return (
    <KinderScreenView
      onDone={onDone}
      {...(onBack ? { onBack } : {})}
      taxYear={taxYear}
      initialKinder={query.data.data.kinder}
      onAddKind={async (data) => {
        await createKind.mutateAsync({ jahr: taxYear, data })
        await invalidate()
      }}
      onSaveKind={async (id, data) => {
        await updateKind.mutateAsync({ jahr: taxYear, id, data })
        await invalidate()
      }}
      onDeleteKind={async (id) => {
        await deleteKind.mutateAsync({ jahr: taxYear, id })
        await invalidate()
      }}
    />
  )
}

function KinderScreenView({
  onDone = () => {},
  onBack,
  taxYear = CURRENT_TAX_YEAR,
  initialKinder = [],
  onAddKind,
  onSaveKind,
  onDeleteKind,
}: KinderScreenProps & { readonly initialKinder: readonly KindItem[] }) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)

  const [kinder, setKinder] = useState<readonly KindItem[]>(initialKinder)
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [geburtsdatum, setGeburtsdatum] = useState('')
  const [idnr, setIdnr] = useState('')
  const [kindergeld, setKindergeld] = useState('')
  const [verhaeltnis, setVerhaeltnis] = useState<Kindschaftsverhaeltnis | null>(null)
  const [verhaeltnisB, setVerhaeltnisB] = useState<Kindschaftsverhaeltnis | null>(null)
  const [familienkasse, setFamilienkasse] = useState('')
  const [inland, setInland] = useState<boolean | null>(null)
  const [bearbeitet, setBearbeitet] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(initialKinder.length === 0)

  const stand = kinderStand(
    kinder.map((k) => ({
      id: k.id,
      vorname: k.vorname,
      nachname: k.nachname,
      geburtsdatum: k.geburtsdatum,
      steuerId: k.idnr ?? null,
      kindergeld: k.kindergeldAnspruchEur ? Number(k.kindergeldAnspruchEur) : null,
    })),
    taxYear,
  )

  function fuelleFormular(k: KindItem | null) {
    setVorname(k?.vorname ?? '')
    setNachname(k?.nachname ?? '')
    setGeburtsdatum(k?.geburtsdatum ?? '')
    setIdnr(k?.idnr ?? '')
    setKindergeld(k?.kindergeldAnspruchEur ?? '')
    setVerhaeltnis(k?.kindschaftsverhaeltnis ?? null)
    setVerhaeltnisB(k?.kindschaftsverhaeltnisB ?? null)
    setFamilienkasse(k?.familienkasse ?? '')
    setInland(k?.wohnsitzInlandGanzjaehrig ?? null)
    setBearbeitet(k?.id ?? null)
  }

  async function handleSave() {
    if (!vorname.trim() || !nachname.trim() || !geburtsdatum.trim()) return
    const payload: KindEingabe = {
      vorname: vorname.trim(),
      nachname: nachname.trim(),
      geburtsdatum: geburtsdatum.trim(),
      ...(idnr.trim() && { idnr: idnr.trim() }),
      ...(kindergeld.trim() && { kindergeldAnspruchEur: kindergeld.trim() }),
      kindschaftsverhaeltnis: verhaeltnis,
      kindschaftsverhaeltnisB: verhaeltnisB,
      familienkasse: familienkasse.trim() || null,
      wohnsitzInlandGanzjaehrig: inland,
    }
    if (bearbeitet) {
      if (onSaveKind) await onSaveKind(bearbeitet, payload)
      setKinder(kinder.map((k) => (k.id === bearbeitet ? { ...k, ...payload } : k)))
    } else {
      if (onAddKind) await onAddKind(payload)
      setKinder([...kinder, { id: `local-${Date.now()}`, lfdNr: kinder.length + 1, ...payload }])
    }
    fuelleFormular(null)
    setFormOpen(false)
  }

  async function handleDelete(id: string) {
    if (onDeleteKind) await onDeleteKind(id)
    setKinder(kinder.filter((k) => k.id !== id))
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="kinder-screen">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('kinder.back', 'Zurück')} onPress={onBack} /> : <BackButtonSpacer />}
      </View>
      <Text style={styles.heading}>{tr('kinder.heading', 'Kinder & Anlage Kind')}</Text>
      <Text style={styles.help}>
        {tr(
          'kinder.help',
          'Erfasse deine Kinder für die steuerliche Berücksichtigung (Kinderfreibetrag § 32 EStG, BEA-Freibetrag und Günstigerprüfung zum Kindergeld).',
        )}
      </Text>

      {kinder.length > 0 && (
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{tr('kinder.summaryTitle', 'Steuerliche Entlastung')}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{tr('kinder.freibetragLabel', 'Kinderfreibetrag Gesamt:')}</Text>
            <Text style={styles.summaryValue}>{formatEuro(stand.freibetragGesamt)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{tr('kinder.kindergeldLabel', 'Kindergeld Anspruch:')}</Text>
            <Text style={styles.summaryValue}>{formatEuro(stand.kindergeldSumme)}</Text>
          </View>
        </Card>
      )}

      {kinder.map((k, index) => (
        <Card key={k.id} style={styles.kindCard}>
          <View style={styles.kindHeader}>
            <Text style={styles.kindName}>
              {`${index + 1}. ${k.vorname} ${k.nachname}`}
            </Text>
            <View style={styles.kindActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Kind ${k.vorname} bearbeiten`}
                onPress={() => {
                  fuelleFormular(k)
                  setFormOpen(true)
                }}
              >
                <Text style={styles.editButton}>{tr('kinder.edit', 'Bearbeiten')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Kind ${k.vorname} löschen`}
                onPress={() => handleDelete(k.id)}
              >
                <Text style={styles.deleteButton}>{tr('kinder.delete', 'Löschen')}</Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.kindDetail}>Geburtsdatum: {k.geburtsdatum}</Text>
          {k.idnr && <Text style={styles.kindDetail}>Steuer-ID: {k.idnr}</Text>}
          <Text style={styles.kindDetail}>
            Kindergeld:{' '}
            {k.kindergeldAnspruchEur
              ? `${k.kindergeldAnspruchEur} €`
              : `${formatEuro(kindergeldAnspruchMonat(taxYear) * anspruchsMonate(k.geburtsdatum, taxYear))} (gesetzlich)`}
          </Text>
          {fehltFuerAusdruck(k) ? (
            <Text style={styles.luecke}>
              {tr('kinder.luecke', 'Für den Ausdruck fehlen noch Angaben (Steuer-ID, Kindschaftsverhältnis, Familienkasse, Wohnsitz).')}
            </Text>
          ) : null}
        </Card>
      ))}

      {formOpen ? (
        <Card style={styles.formCard}>
          <Text style={styles.formTitle}>
            {bearbeitet ? tr('kinder.editTitle', 'Kind bearbeiten') : tr('kinder.addTitle', 'Kind hinzufügen')}
          </Text>
          <Feld label="Vorname">
            <Input value={vorname} onChange={setVorname} placeholder="z.B. Lina" accessibilityLabel="Vorname" />
          </Feld>
          <Feld label="Nachname">
            <Input value={nachname} onChange={setNachname} placeholder="z.B. Mustermann" accessibilityLabel="Nachname" />
          </Feld>
          <Feld label="Geburtsdatum (JJJJ-MM-TT)">
            <Input
              value={geburtsdatum}
              onChange={setGeburtsdatum}
              placeholder="z.B. 2018-05-12"
              accessibilityLabel="Geburtsdatum"
            />
          </Feld>
          <Feld label="Steuer-Identifikationsnummer">
            <Input
              value={idnr}
              onChange={setIdnr}
              placeholder="11 Ziffern"
              type="numeric"
              accessibilityLabel="Steuer-Identifikationsnummer"
            />
          </Feld>
          <Feld label="Erhaltenes Kindergeld im Steuerjahr (optional in €)">
            <Input
              value={kindergeld}
              onChange={setKindergeld}
              placeholder="3000"
              type="numeric"
              accessibilityLabel="Kindergeld"
            />
          </Feld>
          <Feld label="Kindschaftsverhältnis zu dir">
            <View style={styles.chips}>
              {KINDSCHAFTSVERHAELTNISSE.map((wert) => (
                <Chip key={wert} aktiv={verhaeltnis === wert} onPress={() => setVerhaeltnis(wert)} testID={`kind-verhaeltnis-${wert}`}>
                  {KINDSCHAFT_LABEL[wert]}
                </Chip>
              ))}
            </View>
          </Feld>
          <Feld label="Kindschaftsverhältnis zu deinem Ehepartner (nur bei Zusammenveranlagung)">
            <View style={styles.chips}>
              {KINDSCHAFTSVERHAELTNISSE.map((wert) => (
                <Chip key={wert} aktiv={verhaeltnisB === wert} onPress={() => setVerhaeltnisB(wert)} testID={`kind-verhaeltnis-b-${wert}`}>
                  {KINDSCHAFT_LABEL[wert]}
                </Chip>
              ))}
              <Chip aktiv={verhaeltnisB === null} onPress={() => setVerhaeltnisB(null)} testID="kind-verhaeltnis-b-keins">
                Keines
              </Chip>
            </View>
          </Feld>
          <Feld label="Für das Kindergeld zuständige Familienkasse">
            <Input
              value={familienkasse}
              onChange={setFamilienkasse}
              placeholder="z.B. Familienkasse Sachsen"
              accessibilityLabel="Familienkasse"
            />
          </Feld>
          <Feld label={`Hat das Kind ${taxYear} durchgehend in Deutschland gewohnt?`}>
            <View style={styles.chips}>
              <Chip aktiv={inland === true} onPress={() => setInland(true)} testID="kind-inland-ja">
                Ja
              </Chip>
              <Chip aktiv={inland === false} onPress={() => setInland(false)} testID="kind-inland-nein">
                Nein
              </Chip>
            </View>
          </Feld>
          <Button onPress={handleSave} style={styles.addButton} testID="kind-speichern">
            {tr('kinder.save', 'Kind speichern')}
          </Button>
        </Card>
      ) : (
        <Button
          variante="ghost"
          onPress={() => {
            fuelleFormular(null)
            setFormOpen(true)
          }}
          style={styles.toggleButton}
          testID="kind-neu"
        >
          + Weiteres Kind hinzufügen
        </Button>
      )}

      <Button onPress={onDone} style={styles.cta}>
        {tr('kinder.done', 'Weiter')}
      </Button>
    </ScrollView>
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
  const summaryCard: ViewStyle = {
    padding: t.space.s4,
    marginBottom: t.space.s4,
    backgroundColor: t.color.karte,
    borderWidth: t.space.kontur,
    borderColor: t.color.funke,
    borderRadius: t.radius.m,
  }
  const summaryTitle: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.fett,
    fontSize: t.size.l,
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const summaryRow: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: t.space.s1,
  }
  const summaryLabel: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.m,
    color: t.color.tinte2,
  }
  const summaryValue: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.m,
    fontWeight: t.weight.fett,
    color: t.color.tinte,
  }
  const kindCard: ViewStyle = {
    padding: t.space.s4,
    marginBottom: t.space.s3,
    backgroundColor: t.color.karte,
    borderRadius: t.radius.m,
  }
  const kindHeader: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: t.space.s2,
  }
  const kindName: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.fett,
    fontSize: t.size.l,
    color: t.color.tinte,
  }
  const deleteButton: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.s,
    color: t.color.fehler,
  }
  const kindActions: ViewStyle = { flexDirection: 'row', gap: t.space.s3 }
  const editButton: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte }
  const luecke: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.fehler, marginTop: t.space.s2 }
  const chips: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }
  const kindDetail: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.s,
    color: t.color.tinte2,
    marginVertical: 2,
  }
  const formCard: ViewStyle = {
    padding: t.space.s4,
    marginVertical: t.space.s4,
    backgroundColor: t.color.karte,
    borderRadius: t.radius.m,
  }
  const formTitle: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.fett,
    fontSize: t.size.l,
    color: t.color.tinte,
    marginBottom: t.space.s3,
  }
  const addButton: ViewStyle = {
    marginTop: t.space.s3,
  }
  const toggleButton: ViewStyle = {
    marginVertical: t.space.s3,
  }
  const cta: ViewStyle = {
    marginTop: t.space.s5,
    marginBottom: t.space.s6,
  }
  return {
    screen,
    wideScreen,
    headerRow,
    heading,
    help,
    summaryCard,
    summaryTitle,
    summaryRow,
    summaryLabel,
    summaryValue,
    kindCard,
    kindHeader,
    kindName,
    deleteButton,
    kindActions,
    editButton,
    luecke,
    chips,
    kindDetail,
    formCard,
    formTitle,
    addButton,
    toggleButton,
    cta,
  }
}
