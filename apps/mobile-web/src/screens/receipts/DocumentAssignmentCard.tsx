import { useState } from 'react'
import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { AssignmentPersonDto, AssignmentQuestionDto } from '@steuereule/api-client'
import { Button, Chip, DateInput, Input, germanDateToIso, isoDateToGerman, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { detailsComplete, holderTestId, type NewHolderDetails } from '../../lib/receipts/documentAssignment'

export interface DocumentAssignmentCardProps {
  readonly question: AssignmentQuestionDto
  /** What the document prints about the person it names, to prefill „anlegen“. */
  readonly printed: NewHolderDetails
  readonly busy?: boolean | undefined
  readonly error?: string | null | undefined
  readonly onChoose: (holder: string) => void
  readonly onCreate: (role: 'B' | 'kind', details: NewHolderDetails) => void
  /** „Ja, das bin ich“ (N1), with or without taking the name into the profile. */
  readonly onConfirmSelf: (takeName: boolean) => void
}

/** How a person is named on a button: „Für mich“, „Für Nora“, „Für Person B“, „Für das Kind“. */
export function useHolderLabel(): (person: AssignmentPersonDto) => string {
  const { t: tr } = useTranslation(APP_NS)
  return (person) =>
    person.holder === 'A'
      ? tr('belegZuordnung.person.A')
      : person.name
        ? tr('belegZuordnung.person.named', { name: person.name })
        : tr(person.holder === 'B' ? 'belegZuordnung.person.B' : 'belegZuordnung.person.kind')
}

/** How a person is named after „für:“ — the first name, or „mich“ / „Person B“ / „das Kind“. */
export function useHolderName(): (person: AssignmentPersonDto) => string {
  const { t: tr } = useTranslation(APP_NS)
  return (person) => (person.holder === 'A' ? (person.name ?? tr('belegZuordnung.name.A')) : (person.name ?? tr(person.holder === 'B' ? 'belegZuordnung.name.B' : 'belegZuordnung.name.kind')))
}

/**
 * „Für wen?“ (ADR-0092): asked before a document is read for anyone — in the chat and the Belege tab of a
 * household of several, when the name contradicts the upload area, names nobody of the household (create
 * them from the document), or A has no name yet („Bist du …?“). Nothing is taken over before the answer.
 */
export function DocumentAssignmentCard({ question, printed, busy = false, error = null, onChoose, onCreate, onConfirmSelf }: DocumentAssignmentCardProps) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const label = useHolderLabel()
  const name = useHolderName()
  const [notMe, setNotMe] = useState(false)
  const [takeName, setTakeName] = useState(true)
  const [creating, setCreating] = useState<'B' | 'kind' | null>(null)
  const [details, setDetails] = useState<NewHolderDetails>(printed)
  const [birth, setBirth] = useState(printed.birthDate ? isoDateToGerman(printed.birthDate) : '')

  const printedName = question.printedName ?? ''
  const text =
    question.reason === 'confirmSelf'
      ? tr('belegZuordnung.frage.confirmSelf', { printed: printedName })
      : question.reason === 'contradiction'
        ? tr('belegZuordnung.frage.contradiction', { printed: printedName || tr('belegZuordnung.frage.someoneElse'), area: question.area ? name(question.area) : '' })
        : question.reason === 'unknown'
          ? printedName
            ? tr('belegZuordnung.frage.unknown', { printed: printedName })
            : tr('belegZuordnung.frage.unknownNoName')
          : tr('belegZuordnung.frage.which')
  const asksSelf = question.reason === 'confirmSelf' && !notMe

  return (
    <View style={s.card} testID="beleg-zuordnung">
      <Text style={s.question} testID="beleg-zuordnung-frage">
        {text}
      </Text>
      <Text style={s.help}>{tr('belegZuordnung.nichtsUebernommen')}</Text>
      {asksSelf ? (
        <View style={s.row}>
          <Button disabled={busy} onPress={() => onConfirmSelf(takeName)} testID="beleg-zuordnung-bin-ich">
            {tr('belegZuordnung.binIch.ja')}
          </Button>
          <Button variant="leise" disabled={busy} onPress={() => setNotMe(true)} testID="beleg-zuordnung-nicht-ich">
            {tr('belegZuordnung.binIch.nein')}
          </Button>
          <Chip active={takeName} onPress={() => setTakeName((v) => !v)} testID="beleg-zuordnung-name-uebernehmen">
            {tr('belegZuordnung.binIch.nameUebernehmen')}
          </Chip>
        </View>
      ) : (
        <>
          {question.options.length > 0 ? (
            <View style={s.row}>
              {question.options.map((person) => (
                <Button
                  key={person.holder}
                  variant={person.holder === question.preselected ? 'primaer' : 'leise'}
                  disabled={busy}
                  onPress={() => onChoose(person.holder)}
                  testID={`beleg-zuordnung-fuer-${holderTestId(person.holder)}`}
                >
                  {label(person)}
                </Button>
              ))}
            </View>
          ) : null}
          {question.offerCreate.length > 0 && creating === null ? (
            <View style={s.row}>
              {question.offerCreate.map((role) => (
                <Button key={role} variant="ghost" disabled={busy} onPress={() => setCreating(role)} testID={`beleg-zuordnung-anlegen-${role === 'B' ? 'b' : 'kind'}`}>
                  {tr(role === 'B' ? 'belegZuordnung.anlegen.alsB' : 'belegZuordnung.anlegen.alsKind')}
                </Button>
              ))}
            </View>
          ) : null}
        </>
      )}
      {creating !== null ? (
        <View style={s.form} testID="beleg-zuordnung-anlegen-form">
          <Text style={s.formTitle}>{tr(creating === 'B' ? 'belegZuordnung.anlegen.titelB' : 'belegZuordnung.anlegen.titelKind')}</Text>
          <Text style={s.help}>{tr('belegZuordnung.anlegen.hinweis')}</Text>
          <Input value={details.firstName} onChange={(firstName) => setDetails((d) => ({ ...d, firstName }))} placeholder={tr('belegZuordnung.anlegen.vorname')} accessibilityLabel={tr('belegZuordnung.anlegen.vorname')} testID="beleg-zuordnung-anlegen-vorname" />
          <Input value={details.lastName} onChange={(lastName) => setDetails((d) => ({ ...d, lastName }))} placeholder={tr('belegZuordnung.anlegen.nachname')} accessibilityLabel={tr('belegZuordnung.anlegen.nachname')} testID="beleg-zuordnung-anlegen-nachname" />
          <DateInput
            value={birth}
            onChange={(next) => {
              setBirth(next)
              setDetails((d) => ({ ...d, birthDate: germanDateToIso(next) ?? '' }))
            }}
            calendarLabel={tr('belegZuordnung.anlegen.geburtsdatum')}
            accessibilityLabel={tr('belegZuordnung.anlegen.geburtsdatum')}
            testID="beleg-zuordnung-anlegen-geburtsdatum"
          />
          <Input type="numeric" value={details.taxId} onChange={(taxId) => setDetails((d) => ({ ...d, taxId }))} placeholder={tr('belegZuordnung.anlegen.steuerId')} accessibilityLabel={tr('belegZuordnung.anlegen.steuerId')} testID="beleg-zuordnung-anlegen-steuerid" />
          {!detailsComplete(details) ? <Text style={s.help}>{tr('belegZuordnung.anlegen.fehlt')}</Text> : null}
          <View style={s.row}>
            <Button disabled={busy || !detailsComplete(details)} onPress={() => onCreate(creating, details)} testID="beleg-zuordnung-anlegen-speichern">
              {tr('belegZuordnung.anlegen.speichern')}
            </Button>
            <Button variant="leise" disabled={busy} onPress={() => setCreating(null)} testID="beleg-zuordnung-anlegen-abbrechen">
              {tr('belegZuordnung.anlegen.abbrechen')}
            </Button>
          </View>
        </View>
      ) : null}
      {error ? (
        <Text style={s.error} testID="beleg-zuordnung-fehler">
          {error}
        </Text>
      ) : null}
    </View>
  )
}

export interface AlsoForOffersProps {
  readonly people: readonly AssignmentPersonDto[]
  readonly busy?: boolean | undefined
  readonly onTake: (holder: string) => void
}

/** „Auch für Jonas übernehmen?“ — a multi-person document read for another person of the household (ADR-0092 §5). */
export function AlsoForOffers({ people, busy = false, onTake }: AlsoForOffersProps) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const name = useHolderName()
  if (people.length === 0) return null
  return (
    <View style={s.row} testID="beleg-auch-fuer">
      {people.map((person) => (
        <Button key={person.holder} variant="leise" disabled={busy} onPress={() => onTake(person.holder)} testID={`beleg-auch-fuer-${holderTestId(person.holder)}`}>
          {tr('belegZuordnung.auchFuer', { name: name(person) })}
        </Button>
      ))}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const card: ViewStyle = { gap: t.space.s2, paddingVertical: t.space.s2 }
  const row: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2, alignItems: 'center' }
  const form: ViewStyle = { gap: t.space.s2 }
  const question: TextStyle = { ...t.type.bodyStrong, color: t.color.tinte }
  const formTitle: TextStyle = { ...t.type.label, color: t.color.tinte }
  const help: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const error: TextStyle = { ...t.type.small, color: t.color.warn }
  return { card, row, form, question, formTitle, help, error }
}
