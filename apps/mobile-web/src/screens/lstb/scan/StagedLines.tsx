import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Feld, HerkunftsChip, Input, useTheme, type UiTheme } from '@steuereule/ui'
import { LSTB_SCAN_LINES } from '@steuereule/core'
import { APP_NS } from '../../../i18n/resources'
import { formatCalculation } from '../../../lib/lstb/formatCalculation'
import { LINE_LABEL_KEYS, type StagedFieldDraft, type StagedLstbScanDraft } from './lstbScanDraft'
import type { LstbScanState } from './useLstbScan'

/**
 * The further lines a scan read (Soli, church tax, Zeilen 22–27, Zeile 24) and the employer, in the draft
 * banner: each editable, a yellow one with its own „Wert bestätigen“, all taken over with „Werte übernehmen“.
 */
export function StagedLines({ scan, draft }: { readonly scan: LstbScanState; readonly draft: StagedLstbScanDraft }) {
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(useTheme())
  const lines = LSTB_SCAN_LINES.flatMap((line) => {
    const lineDraft = draft.lines[line]
    return lineDraft === undefined ? [] : [{ line, lineDraft }]
  })
  if (lines.length === 0 && draft.employer === null) return null

  return (
    <View style={s.section} testID="lstb-scan-lines">
      <Text style={s.heading}>{tr('lstb.scan.lines.heading')}</Text>
      <Text style={s.help}>{tr('lstb.scan.lines.help')}</Text>
      {draft.employer !== null && (
        <StagedLine
          label={tr('lstb.arbeitgeber.label')}
          id="arbeitgeber"
          text={draft.employer.text}
          status={draft.employer.status}
          confirmed={draft.employer.confirmed}
          reason={draft.employer.reason}
          calculation={null}
          receipt={draft.fileName}
          numeric={false}
          onChange={scan.updateEmployerText}
          onConfirm={scan.confirmEmployer}
        />
      )}
      {lines.map(({ line, lineDraft }) => (
        <StagedLine
          key={line}
          label={tr(LINE_LABEL_KEYS[line])}
          id={line}
          text={lineDraft.text}
          status={lineDraft.status}
          confirmed={lineDraft.confirmed}
          reason={lineDraft.reason}
          calculation={lineDraft.calculation}
          receipt={draft.fileName}
          numeric
          onChange={(next) => scan.updateLineText(line, next)}
          onConfirm={() => scan.confirmLine(line)}
        />
      ))}
    </View>
  )
}

function StagedLine({
  label,
  id,
  text,
  status,
  confirmed,
  reason,
  calculation,
  receipt,
  numeric,
  onChange,
  onConfirm,
}: {
  readonly label: string
  readonly id: string
  readonly text: string
  readonly status: 'ok' | 'pruefen'
  readonly confirmed: boolean
  readonly reason: StagedFieldDraft['reason'] | 'missing' | 'ocr_source'
  readonly calculation: StagedFieldDraft['calculation'] | null
  readonly receipt: string
  readonly numeric: boolean
  readonly onChange: (next: string) => void
  readonly onConfirm: () => void
}) {
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(useTheme())
  const path = calculation === null ? null : formatCalculation(calculation, (line, amount) => tr('lstb.scan.field.calculationTerm', { line, amount }))
  return (
    <Feld label={label}>
      <View style={s.metaRow}>
        <HerkunftsChip
          variant={confirmed ? 'ok' : 'pruefen'}
          testID={`lstb-chip-line-${id}`}
          source={{
            receipt,
            rule: tr('lstb.scan.field.ruleLabel'),
            ...(path !== null ? { calculationPath: path } : {}),
            ...(reason ? { reason: tr(`lstb.scan.field.reason.${reason}`) } : {}),
          }}
        />
        {status === 'pruefen' && !confirmed && (
          <Button variant="leise" onPress={onConfirm} style={s.confirmButton} testID={`lstb-confirm-line-${id}`}>
            {tr('lstb.scan.field.confirm')}
          </Button>
        )}
        {status === 'pruefen' && confirmed && <Text style={s.confirmed}>{tr('lstb.scan.field.confirmed')}</Text>}
      </View>
      <Input
        {...(numeric ? { type: 'numeric' as const, mono: true } : {})}
        value={text}
        onChange={onChange}
        placeholder={numeric ? tr('lstb.feld.placeholder') : ''}
        accessibilityLabel={label}
        testID={`lstb-scan-line-${id}`}
      />
    </Feld>
  )
}

function makeStyles(t: UiTheme): { section: ViewStyle; heading: TextStyle; help: TextStyle; metaRow: ViewStyle; confirmButton: ViewStyle; confirmed: TextStyle } {
  return {
    section: { marginTop: t.space.s3, gap: t.space.s2 },
    heading: { ...t.type.itemTitle, color: t.color.tinte },
    help: { ...t.type.small, color: t.color.tinte2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, marginBottom: t.space.s2, flexWrap: 'wrap' },
    confirmButton: { width: 'auto', minHeight: 32, paddingHorizontal: t.space.s3 },
    confirmed: { ...t.type.captionStrong, color: t.color.ok },
  }
}
