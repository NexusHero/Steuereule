// DatenschutzScreen's export section (Art. 15 / Art. 20) — the two download rows (JSON, PDF)
// and their per-format loading/success/error states. Extracted from DatenschutzScreen.tsx so
// that file stays a screen; the download itself lives in ./exportDownload.
import { View, Text } from 'react-native'
import { Button, Card, useTheme } from '@steuereule/ui'
import { makeDatenschutzStyles } from './styles'
import type { ExportFormat } from './exportDownload'

export type ExportButtonState = 'idle' | 'loading' | 'success' | 'error'

interface ExportSectionProps {
  readonly tr: (key: string) => string
  readonly state: Record<ExportFormat, ExportButtonState>
  readonly onExport: (format: ExportFormat) => void
}

export function ExportSection({ tr, state, onExport }: ExportSectionProps) {
  const t = useTheme()
  const styles = makeDatenschutzStyles(t)
  return (
    <Card>
      <Text style={styles.sectionTitle}>{tr('datenschutz.export.title')}</Text>
      <Text style={styles.sectionBody}>{tr('datenschutz.export.subtitle')}</Text>

      <ExportFormatRow
        tr={tr}
        format="json"
        label={tr('datenschutz.export.jsonButton')}
        hint={tr('datenschutz.export.jsonHint')}
        state={state.json}
        onPress={() => onExport('json')}
      />
      <ExportFormatRow
        tr={tr}
        format="pdf"
        label={tr('datenschutz.export.pdfButton')}
        hint={tr('datenschutz.export.pdfHint')}
        state={state.pdf}
        onPress={() => onExport('pdf')}
      />
    </Card>
  )
}

interface ExportFormatRowProps {
  readonly tr: (key: string) => string
  readonly format: ExportFormat
  readonly label: string
  readonly hint: string
  readonly state: ExportButtonState
  readonly onPress: () => void
}

function ExportFormatRow({ tr, label, hint, state, onPress }: ExportFormatRowProps) {
  const t = useTheme()
  const styles = makeDatenschutzStyles(t)
  return (
    <View style={styles.exportRow}>
      <Button variante="ghost" onPress={onPress} disabled={state === 'loading'}>
        {state === 'loading' ? tr('datenschutz.export.preparing') : label}
      </Button>
      <Text style={styles.hint}>{hint}</Text>
      {state === 'success' ? <Text style={styles.successNote}>{tr('datenschutz.export.success')}</Text> : null}
      {state === 'error' ? (
        <Text style={styles.errorNote} accessibilityRole="alert">
          {tr('datenschutz.export.error')}
        </Text>
      ) : null}
    </View>
  )
}
