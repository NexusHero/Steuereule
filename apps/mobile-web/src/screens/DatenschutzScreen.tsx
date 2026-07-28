// Datenschutz (DSGVO) — REQ-011 (ADR-0013), reached from Profil (see ProfilScreen's "Deine
// Daten" row), never a top-level tab (TAB_ORDNUNG groups it with Profil in the DS reference).
// Built from finanzo-funke-design-system/project/ui_kits/app/datenschutz.html + Datenschutz.jsx
// for the appbar/hero shell, but the "Deine Rechte" section is rebuilt as two real, wired
// actions (export + delete) rather than the DS demo's tap-shows-a-toast placeholders — this
// screen *is* the user-facing half of REQ-011, not a page that points back to Profil for it
// (see steuereule#152's task framing).
//
// Deliberate scope cuts from the DS reference (noted, not silently dropped):
//   - The SCHUTZ marketing cards ("Server in Deutschland", "Nie verkauft, nie beworben", "KI
//     ohne Gedächtnis") are unverified product/infra claims this slice has no evidence for —
//     porting them would risk exactly the kind of overstatement ADR-0013 §8 calls out.
//     Omitted rather than guessed at; a question for the stakeholder if they're wanted.
//   - The "Ehrlich: was wir sehen" card's "Im Gast-Modus verlässt nichts dein Gerät" line is
//     flatly false since guest profiles started persisting server-side, encrypted (ADR-0008,
//     REQ-003) — the same correction LoginScreen's guestNote already made. Dropped rather than
//     re-introduced here.
//   - Berichtigung (Art. 16) and Übertragbarkeit (Art. 20) aren't separate tappable rows: Art.
//     16 is already live via Profil's own edit flow (REQ-013) and Art. 20 is satisfied by the
//     same JSON export as Art. 15 — a second row pointing at the same action would be a dead
//     duplicate, not an honest affordance.
//
// Honesty correction (ADR-0013 §8, the point of this slice): the DS delete-Sheet copy ("Alle
// Belege … auch auf unseren Servern … nicht rückgängig") and export label ("PDF-Bericht +
// Belege (ZIP)") are corrected, not ported. See the `datenschutz` i18n keys in resources.ts for
// the exact wording — profile + account are genuinely erased; the access-log record is
// anonymised and *retained* (Art. 30), never deleted; Löschschutz-held data is retained under
// legal obligation; export offers JSON + PDF only (no receipts model exists yet).
import { useState } from 'react'
import { ActivityIndicator, ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Feld, Input, Pill, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { useAccountDeletionControllerDeleteAccount } from '@steuereule/api-client'
import { APP_NS } from '../i18n/resources'
import { useAuthClient } from '../auth/AuthClientProvider'
import { downloadAccountExport, type ExportFormat } from './datenschutz/exportDownload'

export interface DatenschutzScreenProps {
  readonly onZurueck: () => void
  /** Fires once DELETE /v1/account genuinely succeeded (200) — the caller must return the app
   *  to a signed-out state (ADR-0013's frozen contract: the server already cleared the session
   *  cookie), never leave the user sitting on a screen for an account that no longer exists. */
  readonly onAccountDeleted: () => void
}

type ExportButtonState = 'idle' | 'loading' | 'success' | 'error'

type DeleteFlow =
  | { readonly kind: 'closed' }
  | { readonly kind: 'offer'; readonly exported: boolean }
  | { readonly kind: 'confirm'; readonly error?: 'generic' }
  | { readonly kind: 'password'; readonly error?: 'wrong' | 'rateLimited' | 'generic' }
  | { readonly kind: 'deleting' }
  | { readonly kind: 'guestBlocked' }

export function DatenschutzScreen({ onZurueck, onAccountDeleted }: DatenschutzScreenProps) {
  const bp = useBreakpoint()
  const { t } = useTranslation(APP_NS)
  // A plain `(key: string) => string` adapter, not `t` itself: i18next's `TFunction` overload
  // set (interpolation options, arrays of keys, …) is wider than every sub-component below
  // needs, and threading the real `TFunction` type through each of their props would drag that
  // whole overload set along for no benefit — every call site here passes a single string key.
  const tr = (key: string): string => t(key)
  const authClient = useAuthClient()
  const queryClient = useQueryClient()
  const deleteAccountMutation = useAccountDeletionControllerDeleteAccount()

  // The one honest source for "does this session have a real account, or just a guest cookie":
  // better-auth's own session read, the exact same call UserContextGuard/fresh-auth.ts make
  // server-side. Never guessed at client-side (e.g. "did onboarding run") — that could drift
  // from what the server would actually answer on GET/DELETE.
  const { data: sessionData, isPending: sessionPending, refetch: refetchSession } = authClient.useSession()

  const [exportState, setExportState] = useState<Record<ExportFormat, ExportButtonState>>({ json: 'idle', pdf: 'idle' })
  const [deleteFlow, setDeleteFlow] = useState<DeleteFlow>({ kind: 'closed' })
  const [password, setPassword] = useState('')

  async function runExport(format: ExportFormat) {
    setExportState((s) => ({ ...s, [format]: 'loading' }))
    try {
      const result = await downloadAccountExport(format)
      setExportState((s) => ({ ...s, [format]: result.ok ? 'success' : 'error' }))
      return result.ok
    } catch {
      setExportState((s) => ({ ...s, [format]: 'error' }))
      return false
    }
  }

  async function submitDelete(withPassword: string | undefined) {
    setDeleteFlow({ kind: 'deleting' })
    try {
      const result = await deleteAccountMutation.mutateAsync({
        data: withPassword ? { confirm: true, password: withPassword } : { confirm: true },
      })
      switch (result.status) {
        case 200:
          // Clear every cached query (profile/cockpit/…) before handing back to the caller —
          // the next session (a fresh guest, or a different account) must never see this
          // account's data flash from a stale cache (Slice-1-retro-class honesty bug).
          queryClient.clear()
          // ...and refetch better-auth's own session read right next to it (Musti's T1, F2):
          // `authClient.useSession()` is backed by better-auth's nanostores atom, which
          // `queryClient.clear()` never touches. Without this, "signed out" only held by
          // accident of this component unmounting — a re-mount (App.tsx keeps the auth
          // client alive across the stage change back to Login) would read the stale,
          // still-signed-in atom and render actions for an account that no longer exists.
          await refetchSession()
          setPassword('')
          onAccountDeleted()
          return
        case 400:
          setDeleteFlow({ kind: 'password' })
          return
        case 401:
          setDeleteFlow({ kind: 'password', error: 'wrong' })
          return
        case 429:
          setDeleteFlow({ kind: 'password', error: 'rateLimited' })
          return
        case 403:
          setDeleteFlow({ kind: 'guestBlocked' })
          return
        default: {
          // Musti's T1, F1: the generated union types `.status` as exactly the five cases
          // above, but `httpClient` never throws on a non-2xx and genuinely reachable server
          // errors (ADR-0013 §3 rollback) parse fine — so a real 500 reached this switch with
          // no matching case, `deleteFlow` never left `'deleting'`, and the user sat on a
          // spinner forever with no error and no way to cancel. Fall back to a usable state
          // instead of silently hanging, and force any future status addition to be handled
          // explicitly: if the generated union ever grows a new literal, `result` is no longer
          // `never` here and this line fails to compile.
          const exhaustiveCheck: never = result
          setDeleteFlow({ kind: withPassword !== undefined ? 'password' : 'confirm', error: 'generic' })
          return exhaustiveCheck
        }
      }
    } catch {
      setDeleteFlow({ kind: withPassword !== undefined ? 'password' : 'confirm', error: 'generic' })
    }
  }

  const styles = makeStyles(useTheme())

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} data-testid="screen-container">
      <Appbar tr={tr} onZurueck={onZurueck} />
      <Hero tr={tr} />

      {sessionPending ? (
        <SessionChecking tr={tr} />
      ) : sessionData === null ? (
        <GuestNotice tr={tr} />
      ) : (
        <>
          <ExportSection tr={tr} state={exportState} onExport={runExport} />
          <DeleteSection
            tr={tr}
            flow={deleteFlow}
            password={password}
            onPasswordChange={setPassword}
            onOpen={() => setDeleteFlow({ kind: 'offer', exported: false })}
            onExportFirst={async () => {
              const ok = await runExport('json')
              if (ok) setDeleteFlow({ kind: 'offer', exported: true })
            }}
            onContinueWithoutExport={() => setDeleteFlow({ kind: 'confirm' })}
            onCancel={() => { setDeleteFlow({ kind: 'closed' }); setPassword('') }}
            onConfirmDelete={() => void submitDelete(undefined)}
            onSubmitPassword={() => void submitDelete(password)}
          />
        </>
      )}
    </ScrollView>
  )
}

function Appbar({ tr, onZurueck }: { readonly tr: (key: string) => string; readonly onZurueck: () => void }) {
  const t = useTheme()
  const styles = makeStyles(t)
  return (
    <View style={styles.appbar}>
      <Pressable accessibilityRole="button" accessibilityLabel={tr('datenschutz.back')} onPress={onZurueck} style={styles.backButton}>
        <Text style={styles.backGlyph}>←</Text>
      </Pressable>
      <Text style={styles.appbarTitle}>{tr('datenschutz.title')}</Text>
      <Pill>{tr('datenschutz.badge')}</Pill>
    </View>
  )
}

function Hero({ tr }: { readonly tr: (key: string) => string } ) {
  const t = useTheme()
  const styles = makeStyles(t)
  return (
    <Card variant="nacht">
      <Text style={styles.heroKicker}>{tr('datenschutz.hero.kicker')}</Text>
      <Text style={styles.heroHeading}>{tr('datenschutz.hero.heading')}</Text>
      <Text style={styles.heroBody}>{tr('datenschutz.hero.body')}</Text>
    </Card>
  )
}

function SessionChecking({ tr }: { readonly tr: (key: string) => string }) {
  const t = useTheme()
  const styles = makeStyles(t)
  return (
    <View style={styles.centerBlock}>
      <ActivityIndicator size="large" color={t.color.tinte} accessibilityLabel={tr('datenschutz.sessionChecking')} />
      <Text style={styles.help}>{tr('datenschutz.sessionChecking')}</Text>
    </View>
  )
}

function GuestNotice({ tr }: { readonly tr: (key: string) => string }) {
  const t = useTheme()
  const styles = makeStyles(t)
  return (
    <Card>
      <Text style={styles.sectionTitle}>{tr('datenschutz.guest.heading')}</Text>
      <Text style={styles.sectionBody}>{tr('datenschutz.guest.body')}</Text>
    </Card>
  )
}

interface ExportSectionProps {
  readonly tr: (key: string) => string
  readonly state: Record<ExportFormat, ExportButtonState>
  readonly onExport: (format: ExportFormat) => void
}

function ExportSection({ tr, state, onExport }: ExportSectionProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  return (
    <Card>
      <Text style={styles.sectionTitle}>{tr('datenschutz.export.title')}</Text>
      <Text style={styles.sectionBody}>{tr('datenschutz.export.subtitle')}</Text>

      <ExportFormatRow
        tr={tr}
        format="json"
        label={tr('datenschutz.export.jsonButton')}
        hint={tr('datenschutz.export.jsonHint')}
        state={state.json}
        onPress={() => onExport('json')}
      />
      <ExportFormatRow
        tr={tr}
        format="pdf"
        label={tr('datenschutz.export.pdfButton')}
        hint={tr('datenschutz.export.pdfHint')}
        state={state.pdf}
        onPress={() => onExport('pdf')}
      />
    </Card>
  )
}

interface ExportFormatRowProps {
  readonly tr: (key: string) => string
  readonly format: ExportFormat
  readonly label: string
  readonly hint: string
  readonly state: ExportButtonState
  readonly onPress: () => void
}

function ExportFormatRow({ tr, label, hint, state, onPress }: ExportFormatRowProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  return (
    <View style={styles.exportRow}>
      <Button variante="ghost" onPress={onPress} disabled={state === 'loading'}>
        {state === 'loading' ? tr('datenschutz.export.preparing') : label}
      </Button>
      <Text style={styles.hint}>{hint}</Text>
      {state === 'success' ? <Text style={styles.successNote}>{tr('datenschutz.export.success')}</Text> : null}
      {state === 'error' ? (
        <Text style={styles.errorNote} accessibilityRole="alert">
          {tr('datenschutz.export.error')}
        </Text>
      ) : null}
    </View>
  )
}

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

function DeleteSection({
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
  const styles = makeStyles(t)

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

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = {
    backgroundColor: t.color.grund,
    paddingHorizontal: t.space.s5,
    paddingVertical: t.space.s6,
    minHeight: '100%',
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  }
  const wideScreen: ViewStyle = { ...screen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
  const appbar: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, paddingBottom: t.space.s4 }
  const backButton: ViewStyle = {
    width: 44,
    height: 44,
    borderRadius: t.radius.pille,
    borderWidth: 2,
    borderColor: t.color.tinte,
    backgroundColor: t.color.karte,
    alignItems: 'center',
    justifyContent: 'center',
    ...t.shadow.hartS,
  }
  const backGlyph: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.l, color: t.color.tinte }
  const appbarTitle: TextStyle = { fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['2xl'], color: t.color.tinte, flex: 1 }
  const heroKicker: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.xs, color: t.color.funkeHell, textTransform: 'uppercase', letterSpacing: 0.08 * t.size.xs }
  const heroHeading: TextStyle = { fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['2xl'], color: t.color.nachtText, marginTop: t.space.s2, marginBottom: t.space.s2, lineHeight: t.size['2xl'] * 1.1 }
  const heroBody: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.nachtText, opacity: 0.85 }
  const centerBlock: ViewStyle = { alignItems: 'center', justifyContent: 'center', paddingVertical: t.space.s6, gap: t.space.s3 }
  const help: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, textAlign: 'center' }
  const sectionTitle: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.l, color: t.color.tinte, marginBottom: t.space.s2 }
  const sectionBody: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, marginBottom: t.space.s4 }
  const exportRow: ViewStyle = { marginBottom: t.space.s4 }
  const hint: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2, marginTop: t.space.s2 }
  const successNote: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte, marginTop: t.space.s2 }
  const errorNote: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.fehler, marginTop: t.space.s2 }
  const dangerLabel: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.fehler }
  const offerHeading: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte, marginTop: t.space.s2, marginBottom: t.space.s2 }
  const warningBody: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, marginBottom: t.space.s3 }
  const buttonSpacer: ViewStyle = { marginTop: t.space.s3 }

  return {
    screen,
    wideScreen,
    appbar,
    backButton,
    backGlyph,
    appbarTitle,
    heroKicker,
    heroHeading,
    heroBody,
    centerBlock,
    help,
    sectionTitle,
    sectionBody,
    exportRow,
    hint,
    successNote,
    errorNote,
    dangerLabel,
    offerHeading,
    warningBody,
    buttonSpacer,
  }
}
