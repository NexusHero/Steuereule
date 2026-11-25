import { RefreshControl, ScrollView, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, useTheme } from '@steuereule/ui'
import { useTaxEstimateControllerGet, type TaxEstimateDto, type AnnexConfirmationDto, type CockpitSummaryDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { SubmissionMarker } from './SubmissionMarker'
import { isRunningTaxYear } from '../../config/taxYear'
import { tileRevisitFlag } from './CockpitTiles'
import { tileById } from './tiles'
import { makeStyles } from './CockpitScreen.styles'
import { Appbar, ProgressLine, YearNotices } from './CockpitHeader'
import { ConfirmationNotice, EuleBannerNotice } from './CockpitNotices'
import { GatedHero, NumericHero } from './CockpitHero'
import { Refund, RefundHeadline } from './CockpitRefund'
import { CockpitWorkArea, SecondaryActions } from './CockpitWorkArea'
import { estimateMissingItems } from './cockpitFormat'
import type { CockpitEmptyProps } from './cockpitTypes'

export interface CockpitLoadedProps extends CockpitEmptyProps {
  readonly summary: CockpitSummaryDto
  readonly confirmation: readonly AnnexConfirmationDto[] | null
  readonly assistantTaskCount: number
  readonly onOpenConfirmation?: () => void
}

export function CockpitLoaded(props: CockpitLoadedProps) {
  const { summary, year, onYearChange, confirmation, onOpenConfirmation, refresh, isRefreshing, next, tileFacts, onOpenInterview, onOpenAssessment, onOpenCapital, onOpenRental, onOpenKinder, onOpenPrintout, onOpenOfficialForm, deadlineAnswers, progress, bp } = props
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const { openItems, status } = summary
  const hasOpenItems = openItems > 0
  const estimateQuery = useTaxEstimateControllerGet(year)
  const estimate: TaxEstimateDto | null = estimateQuery.data?.data ?? null
  // UX review H1: as soon as there is a range, the refund is the headline and the income the detail.
  const refundFirst = estimate?.kind === 'spanne'

  return (
    <ScrollView
      contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen}
      refreshControl={<RefreshControl refreshing={refresh.pulling} onRefresh={refresh.onPull} />}
      testID="screen-container"
    >
      <Appbar year={year} onYearChange={onYearChange} isRefreshing={isRefreshing} />
      <YearNotices year={year} answers={deadlineAnswers} />
      <EuleBannerNotice />
      <ConfirmationNotice annexes={confirmation} taskCount={props.assistantTaskCount} status={status} {...(onOpenConfirmation ? { onOpenConfirmation } : {})} />
      <Card variant="nacht">
        {refundFirst ? (
          <>
            <RefundHeadline year={year} estimate={estimate} />
            <View style={styles.heroDivider} />
          </>
        ) : null}
        <Text style={styles.heroLabel}>{tr('cockpit.hero.label')}</Text>
        {status.kind === 'gated' ? (
          <GatedHero status={status} />
        ) : (
          <NumericHero status={status} compact={refundFirst} byPerson={summary.byPerson} partnerName={props.partnerName} />
        )}
        {/* Zero open questions is no news: the progress line below says where the user stands. */}
        {hasOpenItems || progress === null ? <Text style={styles.openItems}>{tr('cockpit.hero.openItems', { count: openItems })}</Text> : null}
        <Refund
          year={year}
          hideRange={refundFirst}
          partnerName={props.partnerName}
          onOpenMissing={(target) => {
            if (target.kind === 'partner') props.onOpenPartner?.(target.area, props.partnerName)
            else props.onOpenTile(tileById(target.tile), tileFacts !== null && tileRevisitFlag(tileById(target.tile), tileFacts.answers))
          }}
        />
      </Card>
      <ProgressLine progress={progress} />
      {next ? (
        <Button onPress={next.onPress} style={styles.cta} testID="cockpit-weiter">
          {next.label}
        </Button>
      ) : hasOpenItems && tileFacts === null ? (
        <Button onPress={onOpenInterview} style={styles.cta} testID="cockpit-interview">
          {tr('cockpit.answerQuestions')}
        </Button>
      ) : null}
      {props.filedViaElster ? (
        <Text style={styles.elsterHint} testID="cockpit-elster-hinweis">
          {tr('cockpit.elsterHinweis')}
        </Text>
      ) : null}
      <CockpitWorkArea {...props} hasPositiveRefund={estimate?.kind === 'spanne' && (estimate.result?.from ?? 0) > 0} estimateMissing={estimateMissingItems(estimate)} />
      <SecondaryActions
        tileFacts={tileFacts}
        onOpenAssessment={onOpenAssessment}
        onOpenOfficialForm={onOpenOfficialForm}
        onOpenCapital={onOpenCapital}
        onOpenRental={onOpenRental}
        onOpenKinder={onOpenKinder}
        onOpenPrintout={onOpenPrintout}
        kinderTestID="cockpit-kinder"
      />
      {/* After printing: the year is marked as filed, so the Verlauf shows it waiting for its Bescheid (ADR-0098). */}
      {props.isSignedIn && onOpenPrintout && !isRunningTaxYear(year) ? <SubmissionMarker year={year} submission={summary.submission ?? null} /> : null}
    </ScrollView>
  )
}
