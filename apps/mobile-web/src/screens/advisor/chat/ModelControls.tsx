// ADR-0096: at the input the user picks the chat model of the conversation and, for one message,
// Max instead of Gründlich. Each choice says what it costs and how long the first word takes,
// relative to the standard model, as measured from the owl's own answers.
import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import type { AdvisorChatModelRefDto, AdvisorDepthProfileDto, AdvisorModelOptionDto, AdvisorModelsDto } from '@steuereule/api-client'
import { APP_NS } from '../../../i18n/resources'
import { pillStyles } from './pillStyles'

const sameModel = (a: AdvisorChatModelRefDto | null | undefined, b: AdvisorChatModelRefDto | null | undefined) =>
  a != null && b != null && a.provider === b.provider && a.model === b.model

/** The model the conversation answers with: the picked one while it is offered, else the standard. */
export function activeModel(models: AdvisorModelsDto | null | undefined, picked: AdvisorChatModelRefDto | null | undefined): AdvisorModelOptionDto | undefined {
  if (!models) return undefined
  return models.models.find((m) => sameModel(m, picked)) ?? models.models.find((m) => sameModel(m, models.standard))
}

/** What a depth costs and how long it takes, in words; „noch nicht gemessen“ while there are too few answers. */
export function depthCostText(profile: AdvisorDepthProfileDto | undefined, tr: TFunction<typeof APP_NS>, language: string): string {
  const factor = profile?.costFactor
  const seconds = profile?.firstWordSeconds
  if (factor === undefined && seconds === undefined) return tr('advisor.chat.model.notMeasured')
  const cost = factor === undefined ? tr('advisor.chat.model.costUnknown') : tr('advisor.chat.model.cost', { factor: factor.toLocaleString(language, { maximumFractionDigits: 1 }) })
  return seconds === undefined ? cost : `${cost} · ${tr('advisor.chat.model.wait', { seconds })}`
}

export interface ModelPickerProps {
  readonly models: AdvisorModelsDto
  readonly picked: AdvisorChatModelRefDto | null | undefined
  readonly onPick: (model: AdvisorChatModelRefDto | null) => void
  readonly disabled?: boolean | undefined
}

/** The model of the conversation: a pill with its name, a list with every model and what it costs. */
export function ModelPicker({ models, picked, onPick, disabled = false }: ModelPickerProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr, i18n } = useTranslation(APP_NS)
  const [open, setOpen] = useState(false)
  const current = activeModel(models, picked)
  if (models.models.length < 2 || current === undefined) return null
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('advisor.chat.model.aria', { model: current.label })}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => setOpen(!open)}
        style={[styles.pill, open && styles.pillOn]}
        testID="advisor-model-picker"
      >
        <Text style={[styles.label, open && styles.labelOn]} numberOfLines={1}>{`${current.label} ▾`}</Text>
      </Pressable>
      {open ? (
        <View style={styles.menu} accessibilityRole="menu" testID="advisor-model-menu">
          {models.models.map((m) => {
            const chosen = sameModel(m, current)
            const isStandard = sameModel(m, models.standard)
            return (
              <Pressable
                key={`${m.provider}:${m.model}`}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: chosen }}
                onPress={() => {
                  setOpen(false)
                  onPick(isStandard ? null : { provider: m.provider, model: m.model })
                }}
                style={[styles.option, chosen && styles.optionOn]}
                testID={`advisor-model-option-${m.provider}:${m.model}`}
              >
                <Text style={styles.optionTitle}>{isStandard ? tr('advisor.chat.model.standard', { model: m.label }) : m.label}</Text>
                <Text style={styles.optionCost}>
                  {isStandard ? tr('advisor.chat.model.reference') : depthCostText(m.depths.find((d) => d.depth === 'gruendlich'), tr, i18n.language)}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}

export interface MaxToggleProps {
  readonly model: AdvisorModelOptionDto | undefined
  readonly on: boolean
  readonly onChange: (next: boolean) => void
  readonly disabled?: boolean | undefined
}

/** Max for the next message: only where the model thinks deeper than Gründlich, with its cost said. */
export function MaxToggle({ model, on, onChange, disabled = false }: MaxToggleProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr, i18n } = useTranslation(APP_NS)
  const max = model?.depths.find((d) => d.depth === 'max')
  if (max === undefined) return null
  const cost = depthCostText(max, tr, i18n.language)
  return (
    <View style={styles.maxRow}>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: on, disabled }}
        accessibilityLabel={tr('advisor.chat.depth.aria')}
        accessibilityHint={`${tr(on ? 'advisor.chat.depth.hintOn' : 'advisor.chat.depth.hintOff')} ${cost}`}
        aria-checked={on}
        disabled={disabled}
        onPress={() => onChange(!on)}
        style={[styles.pill, on && styles.pillOn]}
        testID="advisor-depth-max"
      >
        <Text style={[styles.label, on && styles.labelOn]}>{tr('advisor.chat.depth.label')}</Text>
      </Pressable>
      {on ? (
        <Text style={styles.hint} testID="advisor-depth-hint">
          {cost}
        </Text>
      ) : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    ...pillStyles(t),
    maxRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, flexShrink: 1 } as ViewStyle,
    hint: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, flexShrink: 1 } as TextStyle,
    menu: {
      marginTop: t.space.s1,
      borderWidth: 1,
      borderColor: t.color.linie,
      borderRadius: t.radius.m,
      backgroundColor: t.color.karte,
      paddingVertical: t.space.s1,
      minWidth: 240,
    } as ViewStyle,
    option: { paddingVertical: t.space.s2, paddingHorizontal: t.space.s3, minHeight: 44, justifyContent: 'center' } as ViewStyle,
    optionOn: { backgroundColor: t.color.funkeWeich } as ViewStyle,
    optionTitle: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.s, color: t.color.tinte } as TextStyle,
    optionCost: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2 } as TextStyle,
  }
}
