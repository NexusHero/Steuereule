import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Chip, useTheme } from '@steuereule/ui'
import { formatNumber } from '@steuereule/core'
import { useBusinessControllerElster, type ElsterLineDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { copyText } from '../../lib/clipboard'
import { BusinessFrame, BusinessQueryState, Note, Section } from './BusinessFrame'
import { personParams } from './businessKit'
import { queryProblem } from './useBusiness'
import type { BusinessPageProps } from './BusinessScreen'

const FORMS = ['anlage-euer', 'anlage-s', 'anlage-g', 'ust-2-a', 'gewst-1-a', 'est-1-a', 'anlage-sonstiges'] as const
type Form = (typeof FORMS)[number]

/** What to type: a number as German decimals (the copy is the same text), text as it is, nothing as „nicht ermittelt“. */
export function valueText(value: ElsterLineDto['value']): string | null {
  if (value === null) return null
  if (typeof value === 'number') return Number.isInteger(value) ? formatNumber(value) : value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return value
}

/** The ELSTER fill-in help: per form, line by line, what to enter in Mein ELSTER, with a copy action per value. */
export function ElsterPage({ taxYear, person, onBack, onOpenPage, payment }: BusinessPageProps & { readonly payment?: string | undefined }) {
  const paid = payment === 'erfolg'
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const [form, setForm] = useState<Form>('anlage-euer')
  const [copied, setCopied] = useState<string | null>(null)
  const query = useBusinessControllerElster(taxYear, form, personParams(person))
  const [showRest, setShowRest] = useState(false)
  const refetch = query.refetch
  // Back from the checkout (`?zahlung=erfolg`): the year is paid, the help is read again.
  useEffect(() => {
    if (paid) void refetch()
  }, [paid, refetch])
  const formName = tr(`business.elster.formular.${form}`)
  // The API's own notes may name the form by its id; the user reads its name.
  const noteOf = (note: string | null) => (note === null ? null : note.replaceAll(form, formName))

  const forms = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2, marginBottom: t.space.s4 }} accessibilityRole="tablist">
      {FORMS.map((f) => (
        <Chip key={f} active={form === f} onPress={() => setForm(f)} testID={`elster-formular-${f}`}>
          {tr(`business.elster.formular.${f}`)}
        </Chip>
      ))}
    </View>
  )
  const frame = (children: ReactNode) => (
    <BusinessFrame title={tr('business.seite.elster')} onBack={onBack} testID="elster-seite">
      {forms}
      {payment === 'abbruch' ? <Note testID="elster-abgebrochen">{tr('business.elster.abgebrochen')}</Note> : null}
      {paid ? <Note testID="elster-freigeschaltet">{tr('business.elster.freigeschaltet', { year: taxYear })}</Note> : null}
      {children}
    </BusinessFrame>
  )

  if (query.isPending) return frame(<BusinessQueryState pending problem={null} onRetry={() => undefined} />)
  // The fill-in help is part of the self-employment tier: 402 says so and leads to the checkout.
  if (query.data?.status === 402) {
    return frame(
      <Section testID="elster-nicht-freigeschaltet">
        <Text style={{ ...t.type.body, color: t.color.tinte }}>{tr('business.elster.nichtFreigeschaltet', { year: taxYear })}</Text>
        <Button onPress={() => onOpenPage('freischalten')} testID="elster-freischalten">
          {tr('business.freischalten.knopf')}
        </Button>
      </Section>,
    )
  }
  const problem = queryProblem(query)
  if (problem !== null || query.data?.status !== 200) return frame(<BusinessQueryState pending={false} problem={problem ?? { status: 0, code: null, message: null }} onRetry={() => void query.refetch()} />)

  const help = query.data.data
  if (help.status === 'not_published') {
    return frame(
      <Section testID="elster-nicht-veroeffentlicht">
        <Text style={{ ...t.type.body, color: t.color.tinte }}>{tr('business.elster.nichtVeroeffentlicht', { year: help.year, form: formName })}</Text>
        {help.note ? <Note>{noteOf(help.note)}</Note> : null}
      </Section>,
    )
  }
  // By-meaning lines (Anlage S/G, GewSt 1 A) come with their own status: lines there are shown, never hidden behind „no help“.
  if (help.status === 'not_available' && help.lines.length === 0) {
    return frame(
      <Section testID="elster-nicht-verfuegbar">
        <Text style={{ ...t.type.body, color: t.color.tinte }}>{tr('business.elster.nichtVerfuegbar', { form: formName })}</Text>
        {help.note ? <Note>{noteOf(help.note)}</Note> : null}
      </Section>,
    )
  }

  const filled = help.lines.filter((line) => valueText(line.value) !== null)
  const rest = help.lines.filter((line) => valueText(line.value) === null)
  const row = (line: ElsterLineDto) => {
    const text = valueText(line.value)
    const place =
      help.lineNumbersAvailable && line.zeile !== null
        ? [tr('business.elster.zeile', { zeile: line.zeile }), ...(line.kennzahlen.length > 0 ? [tr('business.elster.kennzahl', { kz: line.kennzahlen.join(', ') })] : [])].join(' · ')
        : tr('business.elster.feld', { label: line.label })
    return (
      <View key={line.id} style={{ paddingVertical: t.space.s2, borderBottomWidth: 1, borderBottomColor: t.color.linieWeich }} testID={`elster-zeile-${line.id}`}>
        <Text style={{ ...t.type.small, color: t.color.tinte2 }}>{place}</Text>
        {help.lineNumbersAvailable ? <Text style={{ ...t.type.body, color: t.color.tinte }}>{line.label}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.s3 }}>
          <Text style={{ ...t.type.figureStrong, color: text === null ? t.color.tinte2 : t.color.tinte, fontVariant: ['tabular-nums'] }} testID={`elster-wert-${line.id}`}>
            {text ?? tr('business.elster.nichtErmittelt')}
          </Text>
          {text !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('business.elster.kopierenA11y', { label: line.label })}
              onPress={() => {
                void copyText(text)
                setCopied(line.id)
              }}
              style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' }}
              testID={`elster-kopieren-${line.id}`}
            >
              <Text style={{ ...t.type.label, color: t.color.tinte, textDecorationLine: 'underline' }}>{copied === line.id ? tr('business.elster.kopiert') : tr('business.elster.kopieren')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    )
  }

  return frame(
    <>
      {!help.lineNumbersAvailable ? <Note testID="elster-nach-bedeutung">{tr('business.elster.nachBedeutung')}</Note> : null}
      {help.note ? <Note>{noteOf(help.note)}</Note> : null}
      <Section testID="elster-zeilen">{filled.map(row)}</Section>
      {rest.length > 0 ? (
        <Section>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showRest }} onPress={() => setShowRest((v) => !v)} style={{ minHeight: 44, justifyContent: 'center' }} testID="elster-weitere-zeilen">
            <Text style={{ ...t.type.bodyStrong, color: t.color.tinte }}>{tr('business.elster.weitere', { count: rest.length })}</Text>
          </Pressable>
          {showRest ? rest.map(row) : null}
        </Section>
      ) : null}
    </>,
  )
}
