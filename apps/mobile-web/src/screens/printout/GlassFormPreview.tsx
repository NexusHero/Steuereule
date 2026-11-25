import { useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useApiFailureMessage } from '../../net/apiFailure'
import type { Screen } from '@steuereule/core'
import { AcroFormLiveViewer, type AcroFormPdfLoader } from './AcroFormLiveViewer'
import { useGlassFormPreview } from './useGlassFormPreview'
import { makeStyles } from './GlassFormPreviewStyles'
import { GlassFormPreviewCollapsed } from './GlassFormPreviewCollapsed'
import { GlassFormPreviewHeader } from './GlassFormPreviewHeader'
import { GlassFormPreviewFilterRow } from './GlassFormPreviewFilterRow'
import { GlassFormPreviewSectionCard } from './GlassFormPreviewSectionCard'

export type { GlassFormRow, GlassFormSection } from './glassFormTypes'

export interface GlassFormPreviewProps {
  readonly year: number
  readonly defaultOpen?: boolean | undefined
  readonly defaultMode?: 'zeilen' | 'acroform' | undefined
  readonly initialAcroForm?: string | undefined
  readonly highlightedAcroFieldId?: string | undefined
  readonly acroFormLoader?: AcroFormPdfLoader | undefined
  readonly onInspectField?: ((screen: Screen, field?: string, person?: 'A' | 'B') => void) | undefined
  /** On a screen with its own title the preview leaves out its heading and keeps only the view switch. */
  readonly hideHeading?: boolean | undefined
}

export function GlassFormPreview({
  year,
  defaultOpen = false,
  defaultMode = 'zeilen',
  initialAcroForm,
  highlightedAcroFieldId,
  acroFormLoader,
  onInspectField,
  hideHeading = false,
}: GlassFormPreviewProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [activeFilter, setActiveFilter] = useState<string>('alle')
  const [viewMode, setViewMode] = useState<'zeilen' | 'acroform'>(defaultMode)

  if (!open) {
    return <GlassFormPreviewCollapsed onOpen={() => setOpen(true)} />
  }

  return (
    <GlassFormPreviewBody
      year={year}
      activeFilter={activeFilter}
      onSelectFilter={setActiveFilter}
      viewMode={viewMode}
      onChangeViewMode={setViewMode}
      initialAcroForm={initialAcroForm}
      highlightedAcroFieldId={highlightedAcroFieldId}
      acroFormLoader={acroFormLoader}
      onCollapse={defaultOpen ? undefined : () => setOpen(false)}
      onInspectField={onInspectField}
      hideHeading={hideHeading}
    />
  )
}

function GlassFormPreviewBody({
  year,
  activeFilter,
  onSelectFilter,
  viewMode,
  onChangeViewMode,
  initialAcroForm,
  highlightedAcroFieldId,
  acroFormLoader,
  onCollapse,
  onInspectField,
  hideHeading,
}: {
  readonly year: number
  readonly activeFilter: string
  readonly onSelectFilter: (filter: string) => void
  readonly viewMode: 'zeilen' | 'acroform'
  readonly onChangeViewMode: (mode: 'zeilen' | 'acroform') => void
  readonly initialAcroForm?: string | undefined
  readonly highlightedAcroFieldId?: string | undefined
  readonly acroFormLoader?: AcroFormPdfLoader | undefined
  readonly onCollapse?: (() => void) | undefined
  readonly hideHeading: boolean
  readonly onInspectField?: ((screen: Screen, field?: string, person?: 'A' | 'B') => void) | undefined
}) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { loadFailure, liveForms, expertMode, saveAcroField, partnerName, sections, totalRows, visibleSections } =
    useGlassFormPreview(year, activeFilter)
  const { t: tr } = useTranslation(APP_NS)
  const failureMessage = useApiFailureMessage()
  // WEB-28: no direct entry over values whose read failed — the field would show a blank, not the stored value.
  const directEntry = expertMode && loadFailure === null

  return (
    <View style={styles.container} testID="glass-form-preview">
      <GlassFormPreviewHeader
        hideHeading={hideHeading}
        sectionCount={sections.length}
        totalRows={totalRows}
        viewMode={viewMode}
        onChangeViewMode={onChangeViewMode}
        onCollapse={onCollapse}
      />

      {loadFailure !== null ? (
        <View accessibilityRole="alert" style={{ gap: t.space.s2, marginBottom: t.space.s3 }} testID="glass-form-ladefehler">
          <Text style={{ ...t.type.body, color: t.color.fehler }}>{`${tr('ausdruck.vorschauLadefehler')} ${failureMessage(loadFailure.error)}`}</Text>
          <Button variant="ghost" onPress={loadFailure.retry} testID="glass-form-erneut">
            {tr('apiFehler.retry')}
          </Button>
        </View>
      ) : null}

      {viewMode === 'acroform' ? (
        <AcroFormLiveViewer
          year={year}
          initialForm={initialAcroForm}
          liveForms={liveForms}
          highlightedFieldId={highlightedAcroFieldId}
          loader={acroFormLoader}
          onInspectField={onInspectField}
          {...(directEntry ? { onSaveAcroField: saveAcroField } : {})}
        />
      ) : null}

      {sections.length > 1 ? (
        <GlassFormPreviewFilterRow
          sections={sections}
          totalRows={totalRows}
          activeFilter={activeFilter}
          onSelectFilter={onSelectFilter}
        />
      ) : null}

      {visibleSections.map((section) => (
        <GlassFormPreviewSectionCard
          key={section.formId}
          section={section}
          partnerName={partnerName}
          onInspectField={onInspectField}
        />
      ))}
    </View>
  )
}
