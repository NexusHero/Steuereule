// DatenschutzScreen's account-deletion section (Art. 17) — the closed → offer → confirm →
// password → deleting state machine, plus the guest-blocked terminal. Extracted from
// DatenschutzScreen.tsx so that file stays a screen; this file owns the destructive flow's UI
// only. The DELETE call and the honest status mapping (400/401/403/429/500) stay with the host
// screen, which owns the query client it must clear on success.
import { View, Text, ActivityIndicator } from 'react-native'
import { Button, Card, Feld, Input, useTheme } from '@steuereule/ui'
import { makeDatenschutzStyles } from './styles'

export type DeleteFlow =
  | { readonly kind: 'closed' }
  | { readonly kind: 'offer'; readonly exported: boolean }
  | { readonly kind: 'confirm'; readonly error?: 'generic' }
  | { readonly kind: 'password'; readonly error?: 'wrong' | 'rateLimited' | 'generic' }
  | { readonly kind: 'deleting' }
  | { readonly kind: 'guestBlocked' }

interface DeleteSectionProps {
  readonly tr: (key: string) => string
  readonly flow: DeleteFlow
  readonly password: string
  readonly onPasswordChange: (value: string) => void
  readonly onOpen: () => void
  readonly onExportFirst: () => void
  readonly onContinueWithoutExport: () => void
  readonly onCancel: () => void
  readonly onConfirmDelete: () => void
  readonly onSubmitPassword: () => void
}

export function DeleteSection({
  tr,
  flow,
  password,
  onPasswordChange,
  onOpen,
  onExportFirst,
  onContinueWithoutExport,
  onCancel,
  onConfirmDelete,
  onSubmitPassword,
}: DeleteSectionProps) {
  const t = useTheme()
  const styles = makeDatenschutzStyles(t)

  return (
    <Card>
      <Text style={styles.sectionTitle}>{tr('datenschutz.delete.title')}</Text>
      <Text style={styles.sectionBody}>{tr('datenschutz.delete.subtitle')}</Text>

      {flow.kind === 'closed' ? (
        <View style={styles.buttonSpacer}>
          <Button variante="ghost" onPress={onOpen}>
            <Text style={styles.dangerLabel}>{tr('datenschutz.delete.openButton')}</Text>
          </Button>
        </View>
      ) : null}

      {flow.kind === 'offer' ? (
        <View>
          <Text style={styles.offerHeading}>{tr('datenschutz.delete.offer.heading')}</Text>
          <Text style={styles.warningBody}>{tr('datenschutz.delete.offer.warning1')}</Text>
          <Text style={styles.warningBody}>{tr('datenschutz.delete.offer.warning2')}</Text>
          <View style={styles.buttonSpacer}>
            <Button variante="leise" onPress={onExportFirst}>
              {tr('datenschutz.delete.offer.exportFirstButton')}
            </Button>
          </View>
          {flow.exported ? <Text style={styles.successNote}>{tr('datenschutz.delete.offer.exportedNote')}</Text> : null}
          <View style={styles.buttonSpacer}>
            <Button variante="ghost" onPress={onContinueWithoutExport}>
              {tr('datenschutz.delete.offer.continueButton')}
            </Button>
          </View>
          <View style={styles.buttonSpacer}>
            <Button variante="ghost" onPress={onCancel}>
              {tr('datenschutz.delete.offer.cancelButton')}
            </Button>
          </View>
        </View>
      ) : null}

      {flow.kind === 'confirm' ? (
        <View>
          <Text style={styles.offerHeading}>{tr('datenschutz.delete.confirm.heading')}</Text>
          <Text style={styles.warningBody}>{tr('datenschutz.delete.confirm.warning')}</Text>
          {flow.error === 'generic' ? (
            <Text style={styles.errorNote} accessibilityRole="alert">
              {tr('datenschutz.delete.confirm.genericError')}
            </Text>
          ) : null}
          <View style={styles.buttonSpacer}>
            <Button variante="ghost" onPress={onConfirmDelete}>
              <Text style={styles.dangerLabel}>{tr('datenschutz.delete.confirm.confirmButton')}</Text>
            </Button>
          </View>
          <View style={styles.buttonSpacer}>
            <Button variante="ghost" onPress={onCancel}>
              {tr('datenschutz.delete.confirm.cancelButton')}
            </Button>
          </View>
        </View>
      ) : null}

      {flow.kind === 'password' ? (
        <View>
          <Text style={styles.offerHeading}>{tr('datenschutz.delete.password.heading')}</Text>
          <Text style={styles.warningBody}>{tr('datenschutz.delete.password.explain')}</Text>
          <Feld label={tr('datenschutz.delete.password.label')}>
            <Input type="password" value={password} onChange={onPasswordChange} accessibilityLabel={tr('datenschutz.delete.password.label')} />
          </Feld>
          {flow.error === 'wrong' ? (
            <Text style={styles.errorNote} accessibilityRole="alert">
              {tr('datenschutz.delete.password.wrongPasswordError')}
            </Text>
          ) : null}
          {flow.error === 'rateLimited' ? (
            <Text style={styles.errorNote} accessibilityRole="alert">
              {tr('datenschutz.delete.password.rateLimitedError')}
            </Text>
          ) : null}
          {flow.error === 'generic' ? (
            <Text style={styles.errorNote} accessibilityRole="alert">
              {tr('datenschutz.delete.password.genericError')}
            </Text>
          ) : null}
          <View style={styles.buttonSpacer}>
            <Button variante="ghost" onPress={onSubmitPassword} disabled={password.trim() === ''}>
              <Text style={styles.dangerLabel}>{tr('datenschutz.delete.password.submitButton')}</Text>
            </Button>
          </View>
          <View style={styles.buttonSpacer}>
            <Button variante="ghost" onPress={onCancel}>
              {tr('datenschutz.delete.password.cancelButton')}
            </Button>
          </View>
        </View>
      ) : null}

      {flow.kind === 'deleting' ? (
        <View style={styles.centerBlock}>
          <ActivityIndicator size="small" color={t.color.tinte} accessibilityLabel={tr('datenschutz.delete.deleting')} />
          <Text style={styles.help}>{tr('datenschutz.delete.deleting')}</Text>
        </View>
      ) : null}

      {flow.kind === 'guestBlocked' ? (
        <Text style={styles.errorNote} accessibilityRole="alert">
          {tr('datenschutz.delete.guestBlocked')}
        </Text>
      ) : null}
    </Card>
  )
}
