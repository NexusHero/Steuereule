import { Platform, Text } from 'react-native'
import { useTheme } from '@steuereule/ui'

export interface PickerOption {
  readonly key: string
  readonly label: string
}

/**
 * One choice out of a long catalogue (23 Katalogberufe, 42 asset kinds): a native select on the web, where
 * a list of chips would fill the screen. The empty option is „nothing chosen“.
 */
export function CatalogPicker({
  value,
  options,
  emptyLabel,
  accessibilityLabel,
  onChange,
  testID,
}: {
  readonly value: string | null
  readonly options: readonly PickerOption[]
  readonly emptyLabel: string
  readonly accessibilityLabel: string
  readonly onChange: (key: string | null) => void
  readonly testID: string
}) {
  const t = useTheme()
  if (Platform.OS !== 'web') {
    return <Text style={{ ...t.type.body, color: t.color.tinte }}>{options.find((o) => o.key === value)?.label ?? emptyLabel}</Text>
  }
  return (
    <select
      value={value ?? ''}
      aria-label={accessibilityLabel}
      data-testid={testID}
      onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      style={{
        width: '100%',
        minHeight: 48,
        padding: t.space.s3,
        borderRadius: t.radius.s,
        border: `${t.space.kontur}px solid ${t.color.tinte2}`,
        backgroundColor: t.color.karte,
        color: t.color.tinte,
        ...(t.type.body as Record<string, string | number>),
      }}
    >
      <option value="">{emptyLabel}</option>
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
