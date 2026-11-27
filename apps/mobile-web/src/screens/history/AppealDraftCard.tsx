import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme, controlLine } from '@steuereule/ui'
import { appealDraft, type AppealDraftPosition } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { copyToClipboard } from '../advisor/chat/clipboard'
import { triggerBrowserDownload } from '../privacy/exportDownload'

export interface AppealDraftCardProps {
  readonly taxYear: number
  readonly assessmentDate: string
  /** What the Bescheid recognised to the user's disadvantage. */
  readonly positions: readonly AppealDraftPosition[]
  readonly testID: string
}

/**
 * „Einspruch-Entwurf“ under the Abgleich: the letter with the differing positions filled in, to copy
 * or to take along as a text file. A template: name, addresses, tax number and the reasons are the
 * user's to add, and so is the decision to object.
 */
export function AppealDraftCard({ taxYear, assessmentDate, positions, testID }: AppealDraftCardProps) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<boolean | null>(null)
  if (positions.length === 0) return null
  const letter = appealDraft({ taxYear, assessmentDate, today: new Date().toISOString().slice(0, 10), positions })
  return (
    <View style={s.box} testID={testID}>
      <Pressable accessibilityRole="button" aria-expanded={open} onPress={() => setOpen((v) => !v)} style={s.toggle} testID={`${testID}-umschalten`}>
        <Text style={s.toggleText}>{tr('verlauf.einspruchEntwurf.titel')}</Text>
        <Text style={s.toggleText}>{open ? '–' : '+'}</Text>
      </Pressable>
      {open ? (
        <>
          <Text style={s.note}>{tr('verlauf.einspruchEntwurf.hinweis')}</Text>
          <Text style={s.letter} selectable testID={`${testID}-text`}>
            {letter}
          </Text>
          <View style={s.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void copyToClipboard(letter).then(setCopied)}
              style={s.action}
              testID={`${testID}-kopieren`}
            >
              <Text style={s.actionText}>{tr(copied === true ? 'verlauf.einspruchEntwurf.kopiert' : 'verlauf.einspruchEntwurf.kopieren')}</Text>
            </Pressable>
            {typeof document === 'undefined' ? null : (
              <Pressable
                accessibilityRole="button"
                onPress={() => triggerBrowserDownload(new Blob([letter], { type: 'text/plain;charset=utf-8' }), `einspruch-${taxYear}.txt`)}
                style={s.action}
                testID={`${testID}-datei`}
              >
                <Text style={s.actionText}>{tr('verlauf.einspruchEntwurf.datei')}</Text>
              </Pressable>
            )}
          </View>
          {copied === false ? (
            <Text style={s.note} accessibilityRole="alert">
              {tr('verlauf.einspruchEntwurf.kopierFehler')}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    box: { marginTop: t.space.s3, borderTopWidth: 1, borderTopColor: t.color.linie, paddingTop: t.space.s2, gap: t.space.s2 } as ViewStyle,
    toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 } as ViewStyle,
    toggleText: { ...t.type.label, color: t.color.tinte } as TextStyle,
    note: { ...t.type.small, color: t.color.tinte2 } as TextStyle,
    letter: { ...t.type.metaLarge, lineHeight: 20, color: t.color.tinte, backgroundColor: t.color.warnWeich, borderRadius: t.radius.s, padding: t.space.s3 } as TextStyle,
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 } as ViewStyle,
    action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: t.space.s3, borderRadius: t.radius.m, borderWidth: 1, borderColor: controlLine(t) } as ViewStyle,
    actionText: { ...t.type.label, color: t.color.tinte } as TextStyle,
  }
}
