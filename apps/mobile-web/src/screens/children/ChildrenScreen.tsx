import { type ReactNode } from 'react'
import { HouseholdChildrenSection } from './HouseholdChildrenSection'
import { CatalogScreen } from '../catalog/CatalogScreen'
import { ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useBreakpoint, useTheme } from '@steuereule/ui'
import { type GermanState } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { ErrorState, LoadingState } from '../shared/ScreenState'
import { SaveFailedNotice } from '../shared/SaveFailedNotice'
import { makeStyles } from './ChildrenScreen.styles'
import { type ChildInput, type ChildItem } from './childrenModel'
import { useChildren } from './useChildren'
import { useChildForm } from './useChildForm'
import { ChildrenSummaryCard } from './ChildrenSummaryCard'
import { ChildCard } from './ChildCard'
import { ChildFormCard } from './ChildFormCard'

export { missingForPrintout, type ChildInput, type ChildItem } from './childrenModel'

export interface ChildrenScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
  readonly initialKinder?: readonly ChildItem[] | undefined
  /** Resolves with the stored list when the server returns it, so a new child carries the id it was given. */
  readonly onAddChild?: ((kind: ChildInput) => Promise<readonly ChildItem[] | void> | void) | undefined
  readonly onSaveChild?: ((id: string, kind: ChildInput) => Promise<readonly ChildItem[] | void> | void) | undefined
  readonly onDeleteChild?: ((id: string) => Promise<void> | void) | undefined
  readonly onSingleParentQuestions?: (() => void) | undefined
  /** Married people cannot claim the Entlastungsbetrag für Alleinerziehende (§ 24b EStG), so its questions stay hidden. */
  readonly married?: boolean | undefined
  /** The spouse's first name in a joint return — named instead of „Person B“ (UX review H7). */
  readonly partnerName?: string | undefined
  /** The household at account level (#452): last year's children to take over, duplicates, leaving. */
  readonly householdSlot?: ReactNode
  /** The user's own last name: offered for a new child, marked as a suggestion, never for an existing one. */
  readonly suggestedLastName?: string | undefined
  /** Bundesland of the user's own address: its Familienkassen are suggested first. */
  readonly addressState?: GermanState | null | undefined
}

export function ChildrenScreen(props: ChildrenScreenProps) {
  if (props.initialKinder !== undefined) {
    return <KinderScreenView {...props} initialKinder={props.initialKinder} />
  }
  return <ConnectedKinderScreen {...props} />
}

function ConnectedKinderScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR }: ChildrenScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const {
    query,
    ownLastName,
    addressState,
    married,
    partnerName,
    householdQuestions,
    setHouseholdQuestions,
    flushThen,
    saveFailed,
    invalidate,
    onAddChild,
    onSaveChild,
    onDeleteChild,
  } = useChildren(taxYear)

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

  if (householdQuestions) {
    return (
      <CatalogScreen
        entry="alleinerziehend"
        taxYear={taxYear}
        onDone={() => setHouseholdQuestions(false)}
        onBack={() => setHouseholdQuestions(false)}
      />
    )
  }

  return (
    <>
    <SaveFailedNotice visible={saveFailed} />
    <KinderScreenView
      onDone={() => flushThen(onDone)}
      {...(onBack ? { onBack: () => flushThen(onBack) } : {})}
      taxYear={taxYear}
      initialKinder={query.data.data.kinder}
      onAddChild={onAddChild}
      onSaveChild={onSaveChild}
      onDeleteChild={onDeleteChild}
      onSingleParentQuestions={() => setHouseholdQuestions(true)}
      married={married}
      {...(partnerName ? { partnerName } : {})}
      suggestedLastName={ownLastName}
      addressState={addressState}
      householdSlot={<HouseholdChildrenSection taxYear={taxYear} onChanged={invalidate} />}
    />
    </>
  )
}

function KinderScreenView({
  householdSlot = null,
  onDone = () => {},
  onBack,
  taxYear = CURRENT_TAX_YEAR,
  initialKinder = [],
  onAddChild,
  onSaveChild,
  onDeleteChild,
  onSingleParentQuestions,
  married = false,
  partnerName,
  suggestedLastName = '',
  addressState = null,
}: ChildrenScreenProps & { readonly initialKinder: readonly ChildItem[] }) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)

  const form = useChildForm({ taxYear, initialKinder, onAddChild, onSaveChild, onDeleteChild, married, suggestedLastName, addressState })
  const { kinder, foldStatus, formOpen, setFormOpen, savedName, fillForm, handleDelete } = form

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="kinder-screen">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('kinder.back', 'Zurück')} onPress={() => onBack()} /> : <BackButtonSpacer />}
      </View>
      <Text style={styles.heading}>{tr('kinder.heading', 'Kinder & Anlage Kind')}</Text>
      <Text style={styles.help}>
        {tr(
          'kinder.help',
          'Erfasse deine Kinder für die steuerliche Berücksichtigung (Kinderfreibetrag § 32 EStG, BEA-Freibetrag und Günstigerprüfung zum Kindergeld).',
        )}
      </Text>

      {householdSlot}

      {kinder.length > 0 && (
        <ChildrenSummaryCard styles={styles} foldStatus={foldStatus} />
      )}

      {kinder.map((k, index) => (
        <ChildCard
          key={k.id}
          k={k}
          index={index}
          taxYear={taxYear}
          styles={styles}
          onEdit={() => {
            fillForm(k)
            setFormOpen(true)
          }}
          onDelete={() => handleDelete(k.id)}
        />
      ))}

      {formOpen ? (
        <ChildFormCard
          form={form}
          styles={styles}
          t={t}
          taxYear={taxYear}
          married={married}
          {...(partnerName ? { partnerName } : {})}
          suggestedLastName={suggestedLastName}
          addressState={addressState}
        />
      ) : (
        <>
        {savedName !== null ? (
          <Text style={{ ...t.type.small, color: t.color.ok }} accessibilityLiveRegion="polite" testID="kind-gespeichert">
            {tr('kinder.gespeichert', { name: savedName })}
          </Text>
        ) : null}
        <Button
          variant="ghost"
          onPress={() => {
            fillForm(null)
            setFormOpen(true)
          }}
          style={styles.toggleButton}
          testID="kind-neu"
        >
          + Weiteres Kind hinzufügen
        </Button>
        </>
      )}

      {onSingleParentQuestions && kinder.length > 0 && !married ? (
        <Button variant="ghost" onPress={onSingleParentQuestions} style={styles.toggleButton}>
          {tr('kinder.entlastungFragen', 'Fragen zum Entlastungsbetrag beantworten')}
        </Button>
      ) : null}

      <Button onPress={() => onDone()} style={styles.cta} testID="kinder-weiter">
        {tr('kinder.done', 'Weiter')}
      </Button>
    </ScrollView>
  )
}
