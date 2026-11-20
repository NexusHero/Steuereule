import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feld, useTheme } from '@steuereule/ui'
import { useBusinessControllerCatalogues, type ProfessionAnswersDto, type ProfessionAnswersDtoCatalogProfession, type ProfessionAnswersDtoFreeActivity } from '@steuereule/api-client'
import { Choice } from './Choice'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, BusinessQueryState, Note, Section } from './BusinessFrame'
import { personParams } from './businessKit'
import { CatalogPicker } from './CatalogPicker'
import { useProfileEditor } from './useProfileEditor'
import type { BusinessPageProps } from './BusinessScreen'

/** The questions behind „Freiberuf oder Gewerbe“ (§ 18 EStG): Katalogberuf, a similar one, free activity, what the tax office said. */
export function ProfessionPage({ taxYear, person, onBack }: BusinessPageProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const { query, profile, loadProblem, save, problem } = useProfileEditor(taxYear, person)
  const catalogues = useBusinessControllerCatalogues(taxYear, personParams(person))

  if (query.isPending || profile === null || loadProblem !== null) {
    return (
      <BusinessFrame title={tr('business.seite.beruf')} onBack={onBack}>
        <BusinessQueryState pending={query.isPending} problem={loadProblem} onRetry={() => void query.refetch()} />
      </BusinessFrame>
    )
  }
  const catalog = catalogues.data?.status === 200 ? catalogues.data.data : null
  const answers: ProfessionAnswersDto = profile.professionAnswers ?? {}
  const change = (patch: ProfessionAnswersDto) => void save({ professionAnswers: { ...answers, ...patch } })
  const prior = answers.priorAssessment ?? null

  return (
    <BusinessFrame title={tr('business.seite.beruf')} onBack={onBack} testID="beruf-seite">
      {problem !== null ? <Note tone="error" testID="business-speichern-fehler">{problem.message ?? tr('business.speichernFehler')}</Note> : null}
      <Section>
        <Feld label={tr('business.beruf.bisher')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
            {([null, 'freiberuf', 'gewerbe'] as const).map((kind) => (
              <Choice key={kind ?? 'keine'} selected={prior === kind} onPress={() => change({ priorAssessment: kind })} testID={`beruf-bisher-${kind ?? 'keine'}`}>
                {kind === null ? tr('business.beruf.keinBescheid') : tr(`business.art.${kind}`)}
              </Choice>
            ))}
          </View>
        </Feld>
        <Feld label={tr('business.beruf.katalog')}>
          <CatalogPicker
            value={answers.catalogProfession ?? null}
            options={catalog?.professions ?? []}
            emptyLabel={tr('business.beruf.keiner')}
            accessibilityLabel={tr('business.beruf.katalog')}
            onChange={(key) => change({ catalogProfession: key as ProfessionAnswersDtoCatalogProfession })}
            testID="beruf-katalog"
          />
        </Feld>
        <Feld label={tr('business.beruf.aehnlich')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
            <Choice selected={answers.similarToCatalogProfession === true} onPress={() => change({ similarToCatalogProfession: true })} testID="beruf-aehnlich-ja">
              {tr('business.ja')}
            </Choice>
            <Choice selected={answers.similarToCatalogProfession === false} onPress={() => change({ similarToCatalogProfession: false })} testID="beruf-aehnlich-nein">
              {tr('business.nein')}
            </Choice>
          </View>
        </Feld>
        <Feld label={tr('business.beruf.taetigkeit')}>
          <CatalogPicker
            value={answers.freeActivity ?? null}
            options={catalog?.freeActivities ?? []}
            emptyLabel={tr('business.beruf.keine')}
            accessibilityLabel={tr('business.beruf.taetigkeit')}
            onChange={(key) => change({ freeActivity: key as ProfessionAnswersDtoFreeActivity })}
            testID="beruf-taetigkeit"
          />
        </Feld>
      </Section>
    </BusinessFrame>
  )
}
