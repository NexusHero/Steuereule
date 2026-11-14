import { useEffect, useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, useTheme, type UiTheme } from '@steuereule/ui'
import {
  getHouseholdControllerGetQueryKey,
  useHouseholdControllerAdoptChildren,
  useHouseholdControllerAnswer,
  useHouseholdControllerDelete,
  useHouseholdControllerGet,
  useHouseholdControllerLeave,
  type HouseholdPersonDto,
  type HouseholdResponseDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { isoToGerman } from '../master-data/masterDataMapping'

export interface HouseholdChildrenSectionProps {
  readonly taxYear: number
  /** Re-reads the Kinder list and the estimate after a change. */
  readonly onChanged: () => Promise<void>
}

/**
 * Children of the household at account level (#452 slice 3, ADR-0062): last year's children
 * preselected and marked „aus 2025“, a one-time „Sind das dieselben?“, „ab Jahr X nicht mehr dabei“
 * and „endgültig löschen“. Nothing is retyped; nothing is copied without a click.
 */
export function HouseholdChildrenSection({ taxYear, onChanged }: HouseholdChildrenSectionProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useHouseholdControllerGet(taxYear, { query: { retry: false } })
  const adopt = useHouseholdControllerAdoptChildren()
  const answer = useHouseholdControllerAnswer()
  const leave = useHouseholdControllerLeave()
  const remove = useHouseholdControllerDelete()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const view: HouseholdResponseDto | null = query.data?.status === 200 ? query.data.data : null
  const children = view?.persons.filter((p) => p.kind === 'child') ?? []
  const offered = children.filter((p) => !p.inThisYear && p.selectable)
  const present = children.filter((p) => p.inThisYear)

  // Re-seed the preselection only when the offered people themselves change.
  const offeredKey = offered.map((p) => `${p.personId}:${p.preselected ? 1 : 0}`).join('|')
  useEffect(() => {
    setSelected(new Set(offeredKey.split('|').flatMap((entry) => (entry.endsWith(':1') ? [entry.slice(0, -2)] : []))))
  }, [offeredKey])

  if (!view || (offered.length === 0 && present.length === 0 && view.candidates.length === 0)) return null

  async function run(task: () => Promise<{ status: number }>) {
    setFailed(false)
    const res = await task().catch(() => ({ status: 0 }))
    if (res.status !== 200) {
      setFailed(true)
      return
    }
    await queryClient.invalidateQueries({ queryKey: getHouseholdControllerGetQueryKey(taxYear) })
    await onChanged()
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const label = (p: HouseholdPersonDto) => `${p.firstName} ${p.lastName}, ${isoToGerman(p.birthDate)}`

  return (
    <Card style={styles.card} testID="haushalt-kinder">
      <Text style={styles.title}>{tr('haushalt.kinder.titel')}</Text>

      {view.candidates.map((c) => (
        <View key={c.id} style={styles.question} testID="haushalt-dublette">
          <Text style={styles.text}>
            {tr('haushalt.dublette.frage', { a: `${c.a.name} (${isoToGerman(c.a.birthDate)})`, b: `${c.b.name} (${isoToGerman(c.b.birthDate)})` })}
          </Text>
          <View style={styles.row}>
            <Button onPress={() => void run(() => answer.mutateAsync({ jahr: taxYear, id: c.id, data: { same: true } }))} style={styles.button} testID="haushalt-dublette-ja">
              {tr('haushalt.dublette.ja')}
            </Button>
            <Button variant="ghost" onPress={() => void run(() => answer.mutateAsync({ jahr: taxYear, id: c.id, data: { same: false } }))} style={styles.button} testID="haushalt-dublette-nein">
              {tr('haushalt.dublette.nein')}
            </Button>
          </View>
        </View>
      ))}

      {offered.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.text}>{tr('haushalt.kinder.auswahl', { year: taxYear })}</Text>
          {offered.map((p, index) => (
            <Pressable
              key={p.personId}
              role="checkbox"
              aria-checked={selected.has(p.personId)}
              onPress={() => toggle(p.personId)}
              style={styles.choice}
              testID={`haushalt-kind-${index}`}
            >
              <Text style={styles.check}>{selected.has(p.personId) ? '☑' : '☐'}</Text>
              <Text style={styles.text}>{label(p)}</Text>
              {p.fromYear !== null ? <Chip active={false} onPress={() => toggle(p.personId)}>{tr('haushalt.ausJahr', { year: p.fromYear })}</Chip> : null}
              {!p.preselected && p.fromYear !== null ? <Text style={styles.hint}>{tr('haushalt.kinder.ueber25')}</Text> : null}
            </Pressable>
          ))}
          <Button
            onPress={() => void run(() => adopt.mutateAsync({ jahr: taxYear, data: { personIds: [...selected] } }))}
            disabled={selected.size === 0 || adopt.isPending}
            testID="haushalt-uebernehmen"
          >
            {tr('haushalt.kinder.uebernehmen', { count: selected.size, year: taxYear })}
          </Button>
        </View>
      ) : null}

      {present.length > 0 ? (
        <View style={styles.block}>
          {present.map((p, index) => (
            <View key={p.personId} style={styles.present} testID={`haushalt-dabei-${index}`}>
              <Text style={styles.text}>{label(p)}</Text>
              {!p.updatedBySelf ? (
                <Text style={styles.hint} testID={`haushalt-geaendert-${index}`}>
                  {tr('haushalt.geaendertVonPartner', { date: isoToGerman(p.updatedAt.slice(0, 10)) })}
                </Text>
              ) : null}
              {p.asksForEducation ? <Text style={styles.hint}>{tr('haushalt.kinder.ausbildungHinweis')}</Text> : null}
              <View style={styles.row}>
                <Pressable accessibilityRole="button" onPress={() => void run(() => leave.mutateAsync({ jahr: taxYear, personId: p.personId }))} testID={`haushalt-nicht-mehr-dabei-${index}`}>
                  <Text style={styles.link}>{tr('haushalt.nichtMehrDabei', { year: taxYear })}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(p.personId)} testID={`haushalt-loeschen-${index}`}>
                  <Text style={styles.danger}>{tr('haushalt.loeschen')}</Text>
                </Pressable>
              </View>
              {confirmDelete === p.personId ? (
                <View style={styles.warning} accessibilityRole="alert" testID="haushalt-loeschen-warnung">
                  <Text style={styles.text}>{tr('haushalt.loeschenWarnung', { name: p.firstName })}</Text>
                  <View style={styles.row}>
                    <Button
                      variant="nacht"
                      onPress={() => {
                        setConfirmDelete(null)
                        void run(() => remove.mutateAsync({ jahr: taxYear, personId: p.personId }))
                      }}
                      style={styles.button}
                      testID="haushalt-loeschen-bestaetigen"
                    >
                      {tr('haushalt.loeschenBestaetigen')}
                    </Button>
                    <Button variant="ghost" onPress={() => setConfirmDelete(null)} style={styles.button} testID="haushalt-loeschen-abbrechen">
                      {tr('haushalt.abbrechen')}
                    </Button>
                  </View>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {failed ? (
        <Text style={styles.danger} role="alert" testID="haushalt-fehler">
          {tr('haushalt.fehler')}
        </Text>
      ) : null}
    </Card>
  )
}

function makeStyles(t: UiTheme) {
  return {
    card: { marginBottom: t.space.s4, padding: t.space.s4, gap: t.space.s3 } as ViewStyle,
    title: { ...t.type.cardTitle, color: t.color.tinte } as TextStyle,
    block: { gap: t.space.s2 } as ViewStyle,
    question: { gap: t.space.s2, padding: t.space.s3, borderRadius: t.radius.m, backgroundColor: t.color.kiWeich } as ViewStyle,
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s3, alignItems: 'center' } as ViewStyle,
    choice: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.s2, paddingVertical: t.space.s1 } as ViewStyle,
    check: { ...t.type.emphasis, color: t.color.tinte } as TextStyle,
    present: { gap: t.space.s1, paddingVertical: t.space.s2, borderTopWidth: 1, borderTopColor: t.color.linieWeich } as ViewStyle,
    warning: { gap: t.space.s2, padding: t.space.s3, borderRadius: t.radius.m, backgroundColor: t.color.fehlerWeich } as ViewStyle,
    button: { width: 'auto', flexGrow: 1 } as ViewStyle,
    text: { ...t.type.body, color: t.color.tinte, flexShrink: 1 } as TextStyle,
    hint: { ...t.type.caption, color: t.color.tinte2 } as TextStyle,
    link: { ...t.type.small, color: t.color.kiTinte, textDecorationLine: 'underline' } as TextStyle,
    danger: { ...t.type.small, color: t.color.fehler } as TextStyle,
  }
}
