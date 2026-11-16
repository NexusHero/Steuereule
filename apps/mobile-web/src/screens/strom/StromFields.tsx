import { View, Text, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Input, Option, useTheme, type UiTheme } from '@steuereule/ui'
import { QUESTIONS, formatEuro, type Answers, type EntryStepId } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { GlossaryHint } from '../shared/GlossaryHint'
import { integerFrom } from '../shared/integer'

export interface FieldCopy {
  readonly question: (id: EntryStepId) => string
  readonly option: (id: EntryStepId, value: string) => string
  /** A notice (gate) shown in place of a question; its text. */
  readonly notice: (id: EntryStepId) => readonly string[]
  /** A line of help under the question; empty for none. */
  readonly help?: (id: EntryStepId) => string
}

export interface StromFieldsProps {
  readonly steps: readonly EntryStepId[]
  readonly draft: Answers
  readonly onChange: (id: EntryStepId, value: string) => void
  readonly copy: FieldCopy
  /** testID prefix of options and inputs — kept from the screens these pages replace. */
  readonly idPrefix: 'interview' | 'katalog'
  /** Last year's amounts the user may take over with a tap (#452). */
  readonly prior?: { readonly year: number; readonly answers: Answers; readonly steps: ReadonlySet<EntryStepId> }
  /** Fields left empty although the page wants them, after a press on Weiter. */
  readonly missing?: ReadonlySet<EntryStepId>
}

/** One page, many fields: every question of a Strom page in order, with notices in place. */
export function StromFields({ steps, draft, onChange, copy, idPrefix, prior, missing }: StromFieldsProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <View>
      {steps.map((id) => {
        const decl = QUESTIONS[id]
        if (decl.kind === 'gate') {
          return (
            <View key={id} style={styles.notice} testID={`strom-hinweis-${id}`}>
              {copy.notice(id).map((line) => (
                <Text key={line} style={styles.noticeText}>
                  {line}
                </Text>
              ))}
            </View>
          )
        }
        const isMissing = missing?.has(id) === true
        return (
          <View key={id} style={styles.field} testID={`strom-feld-${id}`}>
            <Text style={styles.label} nativeID={`strom-label-${id}`}>
              {copy.question(id)}
            </Text>
            {copy.help !== undefined && copy.help(id) !== '' ? <Text style={styles.help}>{copy.help(id)}</Text> : null}
            <GlossaryHint stepId={id} />
            {decl.form.kind === 'enum' ? (
              decl.form.values.map((value) => (
                <Option key={value} selected={draft[id] === value} onPress={() => onChange(id, value)} testID={`${idPrefix}-option-${id}-${value}`}>
                  {copy.option(id, value)}
                </Option>
              ))
            ) : (
              <AmountField id={id} value={draft[id]} onChange={(v) => onChange(id, v)} label={copy.question(id)} idPrefix={idPrefix} prior={prior} />
            )}
            {isMissing ? (
              <Text style={styles.missing} accessibilityLiveRegion="polite" testID={`strom-fehlt-${id}`}>
                {tr('strom.fehlt')}
              </Text>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

function AmountField({
  id,
  value,
  onChange,
  label,
  idPrefix,
  prior,
}: {
  readonly id: EntryStepId
  readonly value: string | undefined
  readonly onChange: (value: string) => void
  readonly label: string
  readonly idPrefix: 'interview' | 'katalog'
  readonly prior?: StromFieldsProps['prior']
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const later = value === 'spaeter'
  const priorRaw = prior?.steps.has(id) === true ? prior.answers[id] : undefined
  const priorValue = priorRaw !== undefined && /^\d+$/.test(priorRaw) && Number(priorRaw) > 0 ? Number(priorRaw) : null
  return (
    <View>
      {priorValue !== null && prior !== undefined && value === undefined ? (
        <Button variant="leise" onPress={() => onChange(String(priorValue))} style={styles.prior} testID={`wie-vorjahr-${id}`}>
          {tr('vorjahr.betrag', { year: prior.year, amount: formatEuro(priorValue) })}
        </Button>
      ) : null}
      <Input
        type="numeric"
        mono
        value={later || value === undefined ? '' : value}
        onChange={(next) => {
          const n = integerFrom(next)
          if (next.trim() === '') onChange('')
          else if (n !== null) onChange(String(n))
        }}
        placeholder={later ? tr('strom.spaeterMarkiert') : tr('katalog.amountPlaceholder')}
        accessibilityLabel={`${label} (${tr('katalog.amountPlaceholder')})`}
        testID={`${idPrefix}-input-${id}`}
      />
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const field: ViewStyle = { marginBottom: t.space.s5 }
  const label: TextStyle = { ...t.type.bodyStrong, color: t.color.tinte, marginBottom: t.space.s2 }
  const notice: ViewStyle = { borderWidth: 1, borderColor: t.color.tinte2, borderRadius: t.radius.s, padding: t.space.s3, marginBottom: t.space.s4 }
  const noticeText: TextStyle = { ...t.type.small, color: t.color.tinte, marginBottom: t.space.s1 }
  const missing: TextStyle = { ...t.type.small, color: t.color.warn, marginTop: t.space.s1 }
  const prior: ViewStyle = { marginBottom: t.space.s2 }
  const help: TextStyle = { ...t.type.small, color: t.color.tinte2, marginBottom: t.space.s2 }
  return { field, label, notice, noticeText, missing, prior, help }
}
