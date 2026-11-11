import { View, Text, ActivityIndicator } from 'react-native'
import { Button, Card, Feld, Input, useTheme } from '@steuereule/ui'
import { makePrivacyStyles } from './styles'

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
  const styles = makePrivacyStyles(t)

  return (
    <Card>
      <Text style={styles.sectionTitle}>{tr('datenschutz.delete.title')}</Text>
      <Text style={styles.sectionBody}>{tr('datenschutz.delete.subtitle')}</Text>

      {flow.kind === 'closed' ? (
        <View style={styles.buttonSpacer}>
          <Button variant="ghost" onPress={onOpen} testID="konto-loeschen-oeffnen">
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
            <Button variant="leise" onPress={onExportFirst} testID="konto-loeschen-erst-exportieren">
              {tr('datenschutz.delete.offer.exportFirstButton')}
            </Button>
          </View>
          {flow.exported ? <Text style={styles.successNote}>{tr('datenschutz.delete.offer.exportedNote')}</Text> : null}
          <View style={styles.buttonSpacer}>
            <Button variant="ghost" onPress={onContinueWithoutExport} testID="konto-loeschen-ohne-export">
              {tr('datenschutz.delete.offer.continueButton')}
            </Button>
          </View>
          <View style={styles.buttonSpacer}>
            <Button variant="ghost" onPress={onCancel} testID="konto-loeschen-abbrechen-angebot">
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
            <Button variant="ghost" onPress={onConfirmDelete} testID="konto-loeschen-bestaetigen">
              <Text style={styles.dangerLabel}>{tr('datenschutz.delete.confirm.confirmButton')}</Text>
            </Button>
          </View>
          <View style={styles.buttonSpacer}>
            <Button variant="ghost" onPress={onCancel} testID="konto-loeschen-abbrechen-bestaetigung">
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
            <Input type="password" value={password} onChange={onPasswordChange} accessibilityLabel={tr('datenschutz.delete.password.label')} autoComplete="current-password" testID="konto-loeschen-passwort" />
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
            <Button variant="ghost" onPress={onSubmitPassword} disabled={password.trim() === ''} testID="konto-loeschen-endgueltig">
              <Text style={styles.dangerLabel}>{tr('datenschutz.delete.password.submitButton')}</Text>
            </Button>
          </View>
          <View style={styles.buttonSpacer}>
            <Button variant="ghost" onPress={onCancel} testID="konto-loeschen-abbrechen-passwort">
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
