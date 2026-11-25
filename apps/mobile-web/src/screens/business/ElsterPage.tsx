import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button, Chip, useTheme } from '@steuereule/ui'
import { formatNumber } from '@steuereule/core'
import type { PaymentReturn } from '@steuereule/core'
import { apiErrorStatus, useBusinessControllerElster, useBusinessControllerElsterForms, useUnlockControllerStatus, type ElsterFormEntryDto, type ElsterLineDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { copyText } from '../../lib/clipboard'
import { BusinessFrame, BusinessQueryState, Note, Section } from './BusinessFrame'
import { personParams, problemOf } from './businessKit'
import { queryProblem } from './useBusiness'
import type { BusinessPageProps } from './BusinessScreen'
import { usePaymentConfirmation, type PaymentConfirmationTiming, type PaymentPhase } from '../shared/usePaymentConfirmation'


/** A chip's stable id: the form, and the copy's number where the form has several (two Anlagen Kind). */
export function entryKey(entry: ElsterFormEntryDto): string {
  return entry.instance ? `${entry.form}-${entry.instance.number}` : entry.form
}

/**
 * The name of one copy: „Anlage Kind · Lotta“, „Anlage V · Kastanienallee 9“, „Anlage N · Partner“. A
 * person's form is named by the person only where the other person has one too.
 */
export function entryLabel(entry: ElsterFormEntryDto, all: readonly ElsterFormEntryDto[], tr: TFunction<typeof APP_NS>): string {
  const form = tr(`business.elster.formular.${entry.form}`)
  const instance = entry.instance
  if (!instance) return form
  const twin = all.filter((e) => e.form === entry.form).length > 1
  const name =
    instance.kind === 'child'
      ? (instance.name ?? tr('business.elster.instanz.kind', { number: instance.number }))
      : instance.kind === 'property'
        ? (instance.name ?? tr('business.elster.instanz.objekt', { number: instance.number }))
        : instance.kind === 'person'
          ? twin && instance.person
            ? tr(`business.person.${instance.person}`)
            : null
          : tr('business.elster.instanz.exemplar', { number: instance.number })
  return name === null ? form : tr('business.elster.instanz.titel', { form, name })
}

/** What to type: a number as German decimals (the copy is the same text), text as it is, nothing as „nicht ermittelt“. */
export function valueText(value: ElsterLineDto['value']): string | null {
  if (value === null) return null
  if (typeof value === 'number') return Number.isInteger(value) ? formatNumber(value) : value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return value
}

export interface ElsterPageProps extends BusinessPageProps {
  /** Back from the checkout of the self-employment tier (the shared return contract, WEB-1). */
  readonly payment?: PaymentReturn | undefined
  /** How often and how long the unlock is awaited after a successful return; the defaults outside tests. */
  readonly confirmTiming?: PaymentConfirmationTiming
}

/** The ELSTER fill-in help: per form, line by line, what to enter in Mein ELSTER, with a copy action per value. */
export function ElsterPage({ taxYear, person, business = 1, onBack, onOpenPage, payment, confirmTiming }: ElsterPageProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const [chosen, setChosen] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const list = useBusinessControllerElsterForms(taxYear, personParams(person, business))
  const entries = list.data?.data.forms ?? []
  const entry = entries.find((e) => entryKey(e) === chosen) ?? entries[0]
  const form = entry?.form ?? 'anlage-euer'
  const query = useBusinessControllerElster(taxYear, form, { ...personParams(person, business), ...(entry?.instance ? { instanz: entry.instance.id } : {}) }, { query: { enabled: entry !== undefined } })
  const [showRest, setShowRest] = useState(false)
  // Only the return trip needs the unlock status: it decides between "being confirmed" and "paid" (WEB-35).
  const status = useUnlockControllerStatus(taxYear, { query: { enabled: payment !== undefined } })
  const unlocked = status.data === undefined ? undefined : status.data.data.status === 'freigeschaltet'
  const { phase, recheck } = usePaymentConfirmation({ outcome: payment, unlocked, refetch: status.refetch, ...confirmTiming })
  const refetchList = list.refetch
  // Once the payment is confirmed the help is read again: it answered 402 before.
  useEffect(() => {
    if (phase === 'paid') void refetchList()
  }, [phase, refetchList])
  const formName = entry ? entryLabel(entry, entries, tr) : ''
  // The API's own notes may name the form by its id; the user reads its name.
  const noteOf = (note: string | null) => (note === null ? null : note.replaceAll(form, tr(`business.elster.formular.${form}`)))

  const chips = (group: ElsterFormEntryDto['group']) => {
    const inGroup = entries.filter((e) => e.group === group)
    if (inGroup.length === 0) return null
    return (
      <View style={{ marginBottom: t.space.s3 }}>
        <Text style={{ ...t.type.small, color: t.color.tinte2, marginBottom: t.space.s1 }}>{tr(`business.elster.gruppe.${group}`)}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }} accessibilityRole="tablist">
          {inGroup.map((e) => (
            <Chip key={entryKey(e)} active={entry !== undefined && entryKey(entry) === entryKey(e)} onPress={() => setChosen(entryKey(e))} testID={`elster-formular-${entryKey(e)}`}>
              {entryLabel(e, entries, tr)}
            </Chip>
          ))}
        </View>
      </View>
    )
  }
  const frame = (children: ReactNode) => (
    <BusinessFrame title={tr('business.seite.elster')} onBack={onBack} testID="elster-seite">
      <View style={{ marginBottom: t.space.s2 }}>
        {chips('business')}
        {chips('income-tax')}
      </View>
      <PaymentNote phase={phase} year={taxYear} onRecheck={recheck} />
      {/* Unconfirmed values are no values to type in (MCP-24): the return's forms wait for „Prüfen & bestätigen“. */}
      {(list.data?.data.unconfirmed ?? []).length > 0 ? <Note testID="elster-unbestaetigt">{tr('business.elster.unbestaetigt')}</Note> : null}
      {children}
    </BusinessFrame>
  )

  // While the payment is being confirmed, the help's 402 is stale: no "not unlocked" and no second payment (WEB-35).
  if (phase === 'confirming') return frame(null)
  // The fill-in help is part of the self-employment tier: 402 says so and leads to the checkout.
  if (apiErrorStatus(list.error) === 402 || apiErrorStatus(query.error) === 402) {
    return frame(
      <Section testID="elster-nicht-freigeschaltet">
        <Text style={{ ...t.type.body, color: t.color.tinte }}>{tr('business.elster.nichtFreigeschaltet', { year: taxYear })}</Text>
        <Button onPress={() => onOpenPage('freischalten')} testID="elster-freischalten">
          {tr('business.freischalten.knopf')}
        </Button>
      </Section>,
    )
  }
  if (list.isPending) return frame(<BusinessQueryState pending problem={null} onRetry={() => undefined} />)
  const listProblem = queryProblem(list)
  if (listProblem !== null) return frame(<BusinessQueryState pending={false} problem={listProblem} onRetry={() => void list.refetch()} />)
  if (entry === undefined) {
    return frame(
      <Section testID="elster-keine-formulare">
        <Text style={{ ...t.type.body, color: t.color.tinte }}>{tr('business.elster.keineFormulare', { year: taxYear })}</Text>
      </Section>,
    )
  }
  if (query.isPending) return frame(<BusinessQueryState pending problem={null} onRetry={() => undefined} />)
  const problem = queryProblem(query)
  if (problem !== null || query.data === undefined) return frame(<BusinessQueryState pending={false} problem={problem ?? problemOf(undefined)} onRetry={() => void query.refetch()} />)

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
        {line.column ? <Text style={{ ...t.type.small, color: t.color.tinte2 }}>{tr('business.elster.spalte', { column: line.column })}</Text> : null}
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

/** The one line about the return trip from the checkout, by phase; nothing without a return trip. */
function PaymentNote({ phase, year, onRecheck }: { readonly phase: PaymentPhase; readonly year: number; readonly onRecheck: () => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  if (phase === 'cancelled') return <Note testID="elster-abgebrochen">{tr('zahlung.abgebrochen')}</Note>
  if (phase === 'paid') return <Note testID="elster-freigeschaltet">{tr('zahlung.bestaetigt', { year })}</Note>
  if (phase === 'confirming') return <Note testID="elster-zahlung-wird-bestaetigt">{tr('zahlung.wirdBestaetigt')}</Note>
  if (phase === 'timeout') {
    return (
      <View style={{ gap: t.space.s2 }}>
        <Note testID="elster-zahlung-zeit-ueberschritten">{tr('zahlung.zeitUeberschritten', { year })}</Note>
        <Button variant="ghost" onPress={onRecheck} testID="elster-zahlung-erneut-pruefen">
          {tr('zahlung.erneutPruefen')}
        </Button>
      </View>
    )
  }
  return null
}
