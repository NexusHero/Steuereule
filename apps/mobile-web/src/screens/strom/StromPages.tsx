import { useState } from 'react'
import { View, Text, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Option, useTheme, type UiTheme } from '@steuereule/ui'
import {
  ENTRIES,
  LATER_ALLOWED_STEPS,
  QUESTIONS,
  STROM_TOPICS,
  answersToPost,
  deselectedWithAnswers,
  initialSelection,
  pageSteps,
  selectionChanges,
  topicEntry,
  topicKinds,
  topicPageSteps,
  type Answers,
  type EntryStepId,
  type QuestionId,
  type StromGroup,
  type StromTopicId,
} from '@steuereule/core'
import { getTaxEstimateControllerGetQueryKey, taxEstimateControllerGet } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { QUESTION_COPY } from '../interview/QuestionScreen'
import { StromFields, type FieldCopy } from './StromFields'
import { useStromSave, type SaveResult } from './useStromSave'
import { estimateMidpoint, rememberEffect } from './stromEffects'
import { applicableTopics } from './stromPlan'

const LATER_ALLOWED: ReadonlySet<EntryStepId> = new Set<EntryStepId>(LATER_ALLOWED_STEPS)

/** Amounts that rarely change and may be taken over from last year (#452 decision 8). */
const PRIOR_YEAR_STEPS: ReadonlySet<EntryStepId> = new Set<EntryStepId>(['spenden-betrag', 'riester-betrag'])

export function useKatalogCopy(): FieldCopy {
  const { t: tr } = useTranslation(APP_NS)
  return {
    question: (id) => tr(`katalog.questions.${id}`, { defaultValue: id }),
    option: (_id, value) => tr(`katalog.options.${value}`, { defaultValue: value }),
    notice: (id) => [tr(`katalog.questions.${id}`, { defaultValue: id })],
  }
}

function useBasisCopy(taxYear: number, answers: Answers): FieldCopy {
  const { t: tr } = useTranslation(APP_NS)
  return {
    question: (id) => {
      const copy = QUESTION_COPY[id as QuestionId]
      if (copy === undefined) return id
      // A pensioner does not commute: the foreign question is asked the way that fits (UX review M3).
      const key = id === 'ausland' && answers.job === 'Rente' ? 'interview.auslandRente' : copy.titleKey
      return `${tr(`${key}.titleBefore`)}${tr(`${key}.titleMark`)}${tr(`${key}.titleAfter`, { taxYear })}`
    },
    option: (id, value) => {
      const spec = QUESTION_COPY[id as QuestionId]?.options.find((o) => o.value === value)
      return spec === undefined ? value : tr(spec.labelKey)
    },
    help: (id) => {
      const copy = QUESTION_COPY[id as QuestionId]
      if (copy === undefined) return ''
      return tr(id === 'ausland' && answers.job === 'Rente' ? 'interview.auslandRente.help' : copy.helpKey)
    },
    notice: (id) =>
      id === 'gewerbe'
        ? [tr('interview.gewerbe.heading'), tr('interview.gewerbe.body1'), tr('interview.gewerbe.body2')]
        : [tr('interview.chOnly.heading'), tr('interview.chOnly.body1'), tr('interview.chOnly.body2')],
  }
}

function SaveNotice({ result }: { readonly result: SaveResult | null }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  if (result === null || result === 'ok') return null
  return (
    <Text style={{ ...t.type.small, color: t.color.warn, marginBottom: t.space.s3 }} accessibilityLiveRegion="polite" testID="strom-speicherfehler">
      {tr(result === 'conflict' ? 'strom.konflikt' : 'strom.netzwerk')}
    </Text>
  )
}

function missingOf(steps: readonly EntryStepId[], draft: Answers): ReadonlySet<EntryStepId> {
  return new Set(steps.filter((id) => QUESTIONS[id].kind === 'question' && (draft[id] === undefined || draft[id] === '')))
}

function withoutEmpty(draft: Answers): Answers {
  return Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== undefined && v !== '')) as Answers
}

// ---------------------------------------------------------------------------------------------
// Basis: only what branches — work, Switzerland, children, marital status (and the partner's work).

export function BasisPage({ taxYear, stored, onSaved }: { readonly taxYear: number; readonly stored: Answers; readonly onSaved: (answers: Answers) => void }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [draft, setDraft] = useState<Answers>(stored)
  const [missing, setMissing] = useState<ReadonlySet<EntryStepId>>(new Set())
  const [result, setResult] = useState<SaveResult | null>(null)
  const { save, saving } = useStromSave(taxYear)
  const copy = useBasisCopy(taxYear, draft)
  const entry = ENTRIES['minimal-gate']
  const steps = pageSteps(entry, draft)

  async function next() {
    const plan = answersToPost(entry, withoutEmpty(draft), stored)
    if (!plan.complete) {
      setMissing(missingOf(steps, draft))
      return
    }
    setMissing(new Set())
    const saved = await save(plan.posts)
    setResult(saved)
    if (saved === 'ok') onSaved({ ...stored, ...Object.fromEntries(plan.posts.map((p) => [p.questionId, p.value])) })
  }

  return (
    <View>
      <Text style={styles.heading} accessibilityRole="header">
        {tr('strom.basis.titel')}
      </Text>
      <Text style={styles.help}>{tr('strom.basis.hilfe')}</Text>
      <SaveNotice result={result} />
      <StromFields steps={steps} draft={draft} onChange={(id, value) => setDraft((d) => ({ ...d, [id]: value }))} copy={copy} idPrefix="interview" missing={missing} />
      <Button onPress={() => void next()} disabled={saving} testID="strom-weiter">
        {tr('strom.weiter')}
      </Button>
    </View>
  )
}

// ---------------------------------------------------------------------------------------------
// Auswahl: "Was trifft {{year}} auf dich zu?" — every topic on one page, grouped.

const GROUPS: readonly StromGroup[] = ['arbeit', 'wohnen', 'vorsorge', 'gesundheit', 'sonstiges']

export function AuswahlPage({ taxYear, stored, onSaved }: { readonly taxYear: number; readonly stored: Answers; readonly onSaved: () => void }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const katalog = useKatalogCopy()
  const [selection, setSelection] = useState<Partial<Record<StromTopicId, string>>>(() => initialSelection(stored))
  const [showRare, setShowRare] = useState(() => STROM_TOPICS.some((topic) => topic.rare && initialSelection(stored)[topic.id] !== undefined))
  const [confirming, setConfirming] = useState<readonly StromTopicId[] | null>(null)
  const [kindMissing, setKindMissing] = useState<ReadonlySet<StromTopicId>>(new Set())
  const [result, setResult] = useState<SaveResult | null>(null)
  const { save, saving } = useStromSave(taxYear)
  const applicable = new Set(applicableTopics(stored))
  const topics = STROM_TOPICS.filter((topic) => applicable.has(topic.id) && (showRare || !topic.rare))
  const hiddenRare = STROM_TOPICS.some((topic) => applicable.has(topic.id) && topic.rare) && !showRare
  const chosenCount = Object.keys(selection).length

  function toggle(id: StromTopicId) {
    setConfirming(null)
    setSelection((s) => {
      const updated = { ...s }
      if (updated[id] !== undefined) delete updated[id]
      else updated[id] = topicKinds(id) === null ? 'Ja' : ''
      return updated
    })
  }

  async function commit() {
    const posts = selectionChanges(stored, withoutEmpty(selection as Answers) as Partial<Record<StromTopicId, string>>, stored)
    const saved = await save(posts)
    setResult(saved)
    if (saved === 'ok') onSaved()
  }

  function next() {
    const withoutKind = new Set((Object.keys(selection) as StromTopicId[]).filter((id) => selection[id] === ''))
    setKindMissing(withoutKind)
    if (withoutKind.size > 0) return
    const dropped = deselectedWithAnswers(stored, selection)
    if (dropped.length > 0 && confirming === null) {
      setConfirming(dropped)
      return
    }
    void commit()
  }

  return (
    <View>
      <Text style={styles.heading} accessibilityRole="header">
        {tr('strom.auswahl.titel', { year: taxYear })}
      </Text>
      <Text style={styles.help}>{tr('strom.auswahl.hilfe')}</Text>
      <SaveNotice result={result} />
      {GROUPS.map((group) => {
        const inGroup = topics.filter((topic) => topic.group === group)
        if (inGroup.length === 0) return null
        return (
          <View key={group} style={styles.group}>
            <Text style={styles.groupTitle}>{tr(`strom.gruppe.${group}`)}</Text>
            {inGroup.map(({ id }) => {
              const kinds = topicKinds(id)
              const chosen = selection[id] !== undefined
              return (
                <View key={id}>
                  <Option selected={chosen} onPress={() => toggle(id)} testID={`strom-thema-${id}`}>
                    {tr(`strom.thema.${id}`)}
                  </Option>
                  {chosen && kinds !== null ? (
                    <View style={styles.kinds} testID={`strom-arten-${id}`}>
                      <Text style={styles.kindQuestion}>{tr(`strom.art.${id}`)}</Text>
                      {kinds.map((kind) => (
                        <Option key={kind} selected={selection[id] === kind} onPress={() => setSelection((s) => ({ ...s, [id]: kind }))} testID={`strom-art-${id}-${kind}`}>
                          {katalog.option(id, kind)}
                        </Option>
                      ))}
                      {kindMissing.has(id) ? (
                        <Text style={styles.warn} testID={`strom-fehlt-art-${id}`}>
                          {tr('strom.artFehlt')}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              )
            })}
          </View>
        )
      })}
      {hiddenRare ? (
        <Button variant="leise" onPress={() => setShowRare(true)} style={styles.more} testID="strom-mehr">
          {tr('strom.auswahl.mehr')}
        </Button>
      ) : null}
      {confirming !== null ? (
        <View style={styles.confirm} testID="strom-abwaehlen">
          <Text style={styles.confirmText}>{tr('strom.auswahl.abwaehlen', { themen: confirming.map((id) => tr(`strom.thema.${id}`)).join(', ') })}</Text>
          <Button onPress={() => void commit()} disabled={saving} testID="strom-abwaehlen-ja">
            {tr('strom.auswahl.abwaehlenJa')}
          </Button>
          <Button variant="leise" onPress={() => setConfirming(null)} style={styles.more} testID="strom-abwaehlen-nein">
            {tr('strom.auswahl.abwaehlenNein')}
          </Button>
        </View>
      ) : (
        <Button onPress={next} disabled={saving} testID="strom-weiter">
          {chosenCount === 0 ? tr('strom.auswahl.nichtsDavon') : tr('strom.auswahl.weiterMit', { count: chosenCount })}
        </Button>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------------------------
// One page per chosen topic: every amount of the topic, the form line, Weiter or Später.

export interface TopicPageProps {
  readonly taxYear: number
  readonly stored: Answers
  readonly prior: Answers
  /** A Strom topic, or the order-free Alleinerziehend entry. */
  readonly topic: StromTopicId | 'alleinerziehend'
  readonly slug: string
  readonly onSaved: () => void
}

export function TopicPage({ taxYear, stored, prior, topic, slug, onSaved }: TopicPageProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const katalog = useKatalogCopy()
  const [draft, setDraft] = useState<Answers>(stored)
  const [missing, setMissing] = useState<ReadonlySet<EntryStepId>>(new Set())
  const [result, setResult] = useState<SaveResult | null>(null)
  const { save, saving } = useStromSave(taxYear)
  const entry = topic === 'alleinerziehend' ? ENTRIES.alleinerziehend : topicEntry(topic)
  const steps = topic === 'alleinerziehend' ? pageSteps(entry, draft) : topicPageSteps(topic, draft)

  async function estimateNow(): Promise<number | null> {
    try {
      const response = await queryClient.fetchQuery({
        queryKey: getTaxEstimateControllerGetQueryKey(taxYear),
        queryFn: () => taxEstimateControllerGet(taxYear),
        staleTime: 0,
      })
      return response.status === 200 ? estimateMidpoint(response.data) : null
    } catch {
      return null
    }
  }

  async function send(values: Answers) {
    const plan = answersToPost(entry, withoutEmpty(values), stored)
    if (!plan.complete) {
      setMissing(missingOf(steps, values))
      return
    }
    setMissing(new Set())
    const before = await estimateNow()
    const saved = await save(plan.posts)
    setResult(saved)
    if (saved !== 'ok') return
    rememberEffect(taxYear, slug, before, await estimateNow())
    onSaved()
  }

  /** „Später“: amounts that may wait are marked so; a page that still lacks a choice is left open as it is. */
  function later() {
    const filled: Answers = { ...withoutEmpty(draft) }
    for (const id of steps) {
      if (filled[id] === undefined && LATER_ALLOWED.has(id)) filled[id] = 'spaeter'
    }
    const plan = answersToPost(entry, filled, stored)
    if (plan.complete) void send(filled)
    else onSaved()
  }

  const heading = topic === 'alleinerziehend' ? tr('strom.alleinerziehend.titel') : tr(`strom.thema.${topic}`)
  return (
    <View>
      <Text style={styles.heading} accessibilityRole="header">
        {heading}
      </Text>
      <SaveNotice result={result} />
      <StromFields
        steps={steps}
        draft={draft}
        onChange={(id, value) => setDraft((d) => ({ ...d, [id]: value }))}
        copy={katalog}
        idPrefix="katalog"
        prior={{ year: taxYear - 1, answers: prior, steps: PRIOR_YEAR_STEPS }}
        missing={missing}
        taxYear={taxYear}
      />
      <View style={styles.formLine} testID="strom-wirkungszeile">
        <View style={styles.dot} />
        <Text style={styles.formLineText}>{tr(`strom.formular.${topic}`)}</Text>
      </View>
      <Button onPress={() => void send(draft)} disabled={saving} testID="strom-weiter">
        {tr('strom.weiter')}
      </Button>
      <Button variant="leise" onPress={later} disabled={saving} style={styles.more} testID="strom-spaeter">
        {tr('strom.spaeter')}
      </Button>
    </View>
  )
}

export function makeStyles(t: UiTheme) {
  const heading: TextStyle = { ...t.type.headline, color: t.color.tinte, marginBottom: t.space.s3 }
  const help: TextStyle = { ...t.type.small, color: t.color.tinte2, marginBottom: t.space.s4 }
  const group: ViewStyle = { marginBottom: t.space.s4 }
  const groupTitle: TextStyle = { ...t.type.label, color: t.color.tinte2, marginBottom: t.space.s2 }
  const kinds: ViewStyle = { paddingLeft: t.space.s4, marginBottom: t.space.s2 }
  const kindQuestion: TextStyle = { ...t.type.small, color: t.color.tinte, marginBottom: t.space.s2 }
  const warn: TextStyle = { ...t.type.small, color: t.color.warn }
  const more: ViewStyle = { marginTop: t.space.s2 }
  const confirm: ViewStyle = { borderWidth: 1, borderColor: t.color.tinte2, borderRadius: t.radius.s, padding: t.space.s4, gap: t.space.s2 }
  const confirmText: TextStyle = { ...t.type.body, color: t.color.tinte }
  const formLine: ViewStyle = { flexDirection: 'row', gap: t.space.s2, alignItems: 'flex-start', padding: t.space.s3, borderRadius: t.radius.s, borderWidth: 1, borderColor: t.color.tinte2, marginBottom: t.space.s4 }
  const dot: ViewStyle = { width: 8, height: 8, borderRadius: 4, backgroundColor: t.color.funke, marginTop: t.space.s1 }
  const formLineText: TextStyle = { ...t.type.small, color: t.color.tinte, flex: 1 }
  return { heading, help, group, groupTitle, kinds, kindQuestion, warn, more, confirm, confirmText, formLine, dot, formLineText }
}
