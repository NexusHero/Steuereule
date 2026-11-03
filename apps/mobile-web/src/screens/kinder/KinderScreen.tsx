import { useState } from 'react'
import { KatalogScreen } from '../katalog/KatalogScreen'
import { Pressable, ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, Feld, Input, useBreakpoint, useTheme, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import {
  anspruchsMonate,
  formatEuro,
  kindergeldAnspruchMonat,
  kinderStand,
  ANDERE_KINDSCHAFTSVERHAELTNISSE,
  ANDERER_ELTERNTEIL_STATUS,
  KINDSCHAFTSVERHAELTNISSE,
  type AndererElternteilStatus,
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
  andererElternteil?: AndererElternteilStatus | null
  andererElternteilName?: string | null
  andererElternteilGeburtsdatum?: string | null
  andererElternteilAdresse?: string | null
  andererElternteilArt?: '1' | '2' | null
  andererElternteilVerstorbenAm?: string | null
  gemeldetBeiMirGanzjaehrig?: boolean | null
  kindergeldAnMichGanzjaehrig?: boolean | null
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
  andererElternteil: AndererElternteilStatus | null
  andererElternteilName: string | null
  andererElternteilGeburtsdatum: string | null
  andererElternteilAdresse: string | null
  andererElternteilArt: '1' | '2' | null
  andererElternteilVerstorbenAm: string | null
  gemeldetBeiMirGanzjaehrig: boolean | null
  kindergeldAnMichGanzjaehrig: boolean | null
}

const ANDERER_ELTERNTEIL_LABEL: Record<AndererElternteilStatus, string> = {
  Inland: 'Lebt in Deutschland',
  Ausland: 'Lebt im Ausland',
  Verstorben: 'Ist verstorben',
  Unbekannt: 'Nicht zu ermitteln',
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
  /** Opens the two household questions behind the Entlastungsbetrag (Anlage Kind Zeilen 47/48). */
  readonly onAlleinerziehendFragen?: (() => void) | undefined
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
  const [haushaltsfragen, setHaushaltsfragen] = useState(false)

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

  if (haushaltsfragen) {
    return (
      <KatalogScreen
        entry="alleinerziehend"
        taxYear={taxYear}
        onDone={() => setHaushaltsfragen(false)}
        onBack={() => setHaushaltsfragen(false)}
      />
    )
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
      onAlleinerziehendFragen={() => setHaushaltsfragen(true)}
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
  onAlleinerziehendFragen,
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
  const [ae, setAe] = useState<AndererElternteilStatus | null>(null)
  const [aeName, setAeName] = useState('')
  const [aeGeburtsdatum, setAeGeburtsdatum] = useState('')
  const [aeAdresse, setAeAdresse] = useState('')
  const [aeArt, setAeArt] = useState<'1' | '2' | null>(null)
  const [aeVerstorbenAm, setAeVerstorbenAm] = useState('')
  const [gemeldet, setGemeldet] = useState<boolean | null>(null)
  const [kindergeldAnMich, setKindergeldAnMich] = useState<boolean | null>(null)
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
    setAe(k?.andererElternteil ?? null)
    setAeName(k?.andererElternteilName ?? '')
    setAeGeburtsdatum(k?.andererElternteilGeburtsdatum ?? '')
    setAeAdresse(k?.andererElternteilAdresse ?? '')
    setAeArt(k?.andererElternteilArt ?? null)
    setAeVerstorbenAm(k?.andererElternteilVerstorbenAm ?? '')
    setGemeldet(k?.gemeldetBeiMirGanzjaehrig ?? null)
    setKindergeldAnMich(k?.kindergeldAnMichGanzjaehrig ?? null)
    setBearbeitet(k?.id ?? null)
  }

  // Name, birth date and kind of relationship are asked only for a known parent (Zeilen 11/12).
  const aeBekannt = ae === 'Inland' || ae === 'Verstorben'

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
      andererElternteil: ae,
      andererElternteilName: aeBekannt ? aeName.trim() || null : null,
      andererElternteilGeburtsdatum: aeBekannt ? aeGeburtsdatum.trim() || null : null,
      andererElternteilAdresse: aeBekannt ? aeAdresse.trim() || null : null,
      andererElternteilArt: aeBekannt ? aeArt : null,
      andererElternteilVerstorbenAm: ae === 'Verstorben' ? aeVerstorbenAm.trim() || null : null,
      gemeldetBeiMirGanzjaehrig: gemeldet,
      kindergeldAnMichGanzjaehrig: kindergeldAnMich,
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
          <Feld label="Der andere Elternteil (nicht nötig, wenn ihr beide Eltern seid und zusammen veranlagt werdet)">
            <View style={styles.chips}>
              {ANDERER_ELTERNTEIL_STATUS.map((status) => (
                <Chip key={status} aktiv={ae === status} onPress={() => setAe(status)} testID={`kind-ae-${status}`}>
                  {ANDERER_ELTERNTEIL_LABEL[status]}
                </Chip>
              ))}
            </View>
          </Feld>
          {aeBekannt ? (
            <>
              <Feld label="Name, Vorname">
                <Input value={aeName} onChange={setAeName} placeholder="z.B. Muster, Max" accessibilityLabel="Name des anderen Elternteils" />
              </Feld>
              <Feld label="Geburtsdatum (JJJJ-MM-TT)">
                <Input
                  value={aeGeburtsdatum}
                  onChange={setAeGeburtsdatum}
                  placeholder="z.B. 1984-02-11"
                  accessibilityLabel="Geburtsdatum des anderen Elternteils"
                />
              </Feld>
              <Feld label={ae === 'Inland' ? 'Adresse' : 'Letzte bekannte Adresse (optional)'}>
                <Input value={aeAdresse} onChange={setAeAdresse} accessibilityLabel="Adresse des anderen Elternteils" />
              </Feld>
              <Feld label="Kindschaftsverhältnis zum anderen Elternteil">
                <View style={styles.chips}>
                  {ANDERE_KINDSCHAFTSVERHAELTNISSE.map((wert) => (
                    <Chip key={wert} aktiv={aeArt === wert} onPress={() => setAeArt(wert)} testID={`kind-ae-art-${wert}`}>
                      {KINDSCHAFT_LABEL[wert]}
                    </Chip>
                  ))}
                </View>
              </Feld>
              {ae === 'Verstorben' ? (
                <Feld label="Todestag (JJJJ-MM-TT)">
                  <Input value={aeVerstorbenAm} onChange={setAeVerstorbenAm} accessibilityLabel="Todestag des anderen Elternteils" />
                </Feld>
              ) : null}
            </>
          ) : null}
          <Text style={styles.formTitle}>{tr('kinder.entlastungTitel', 'Entlastungsbetrag für Alleinerziehende')}</Text>
          <Text style={styles.kindDetail}>
            {tr(
              'kinder.entlastungHilfe',
              'Nur wenn du allein mit dem Kind lebst. Der Ausdruck beantragt ihn für das ganze Jahr; Teilzeiträume kann er noch nicht.',
            )}
          </Text>
          <Feld label={`War das Kind ${taxYear} das ganze Jahr bei dir gemeldet?`}>
            <View style={styles.chips}>
              <Chip aktiv={gemeldet === true} onPress={() => setGemeldet(true)} testID="kind-gemeldet-ja">
                Ja
              </Chip>
              <Chip aktiv={gemeldet === false} onPress={() => setGemeldet(false)} testID="kind-gemeldet-nein">
                Nein
              </Chip>
            </View>
          </Feld>
          <Feld label={`Wurde das Kindergeld ${taxYear} das ganze Jahr an dich ausgezahlt?`}>
            <View style={styles.chips}>
              <Chip aktiv={kindergeldAnMich === true} onPress={() => setKindergeldAnMich(true)} testID="kind-kindergeld-an-mich-ja">
                Ja
              </Chip>
              <Chip aktiv={kindergeldAnMich === false} onPress={() => setKindergeldAnMich(false)} testID="kind-kindergeld-an-mich-nein">
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

      {onAlleinerziehendFragen && kinder.length > 0 ? (
        <Button variante="ghost" onPress={onAlleinerziehendFragen} style={styles.toggleButton}>
          {tr('kinder.entlastungFragen', 'Fragen zum Entlastungsbetrag beantworten')}
        </Button>
      ) : null}

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
