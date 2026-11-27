import type { ReactNode } from 'react'
import { inkOnFunke, useTheme } from '@steuereule/ui'
import { Icon, type IconName } from '../../icons/Icon'

/**
 * Icons for answers that are things one recognises at a glance (where the money came from). Yes/No
 * and tax terms get none: there is no picture everyone reads the same way.
 */
const OPTION_ICONS: Readonly<Record<string, Readonly<Record<string, IconName>>>> = {
  job: { Angestellt: 'briefcase', 'Selbstständig': 'laptop', Beides: 'layers', Rente: 'clock' },
}

function OptionIcon({ name, selected }: { readonly name: IconName; readonly selected: boolean }) {
  const t = useTheme()
  // A chosen option sits on lime: its icon takes the ink that reads there, in both modes.
  return <Icon name={name} size={22} color={selected ? inkOnFunke(t) : t.color.tinte} />
}

/** The icon of an interview answer, or `undefined` where the answer has none. */
export function interviewOptionIcon(questionId: string, value: string, selected: boolean): ReactNode {
  const name = OPTION_ICONS[questionId]?.[value]
  return name === undefined ? undefined : <OptionIcon name={name} selected={selected} />
}
