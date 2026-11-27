import { RefreshControl, ScrollView, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { makeStyles } from './CockpitScreen.styles'
import { Appbar, ProgressLine, YearNotices } from './CockpitHeader'
import { EuleBannerNotice } from './CockpitNotices'
import { CockpitWorkArea, SecondaryActions } from './CockpitWorkArea'
import type { CockpitEmptyProps } from './cockpitTypes'

export function CockpitEmpty(props: CockpitEmptyProps) {
  const { year, onYearChange, refresh, isRefreshing, next, tileFacts, onOpenInterview, onOpenAssessment, onOpenCapital, onOpenRental, onOpenKinder, onOpenOfficialForm, deadlineAnswers, progress, bp } = props
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <ScrollView
      contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen}
      refreshControl={<RefreshControl refreshing={refresh.pulling} onRefresh={refresh.onPull} />}
      testID="screen-container"
    >
      <Appbar year={year} onYearChange={onYearChange} isRefreshing={isRefreshing} />
      <YearNotices year={year} answers={deadlineAnswers} />
      <EuleBannerNotice />
      <View style={styles.emptyBlock}>
        <Text style={styles.heading}>{tr('cockpit.empty.heading')}</Text>
        <ProgressLine progress={progress} />
        {next ? (
          <Button onPress={next.onPress} style={styles.cta} testID="cockpit-weiter">
            {next.label}
          </Button>
        ) : tileFacts === null ? (
          <Button onPress={onOpenInterview} style={styles.cta} testID="cockpit-interview">
            {tr('cockpit.answerQuestions')}
          </Button>
        ) : null}
        {props.filedViaElster ? (
        <Text style={styles.elsterHint} testID="cockpit-elster-hinweis">
          {tr('cockpit.elsterHinweis')}
        </Text>
      ) : null}
      <CockpitWorkArea {...props} owlTestID="cockpit-empty-eulen-modus" />
        <SecondaryActions
          tileFacts={tileFacts}
          onOpenAssessment={onOpenAssessment}
          onOpenOfficialForm={onOpenOfficialForm}
          onOpenCapital={onOpenCapital}
          onOpenRental={onOpenRental}
          onOpenKinder={onOpenKinder}
          kinderTestID="cockpit-empty-kinder"
        />
      </View>
    </ScrollView>
  )
}
