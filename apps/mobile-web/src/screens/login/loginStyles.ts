// The Login screen's remaining styles — the screen/column scaffolding and the single shared
// outage banner — after the QR column's, header's, social slot's and verification banner's own
// styles moved into their respective files. Kept as a plain factory so the screen's render
// stays about what it renders, not about how many style keys it carries.
import { type ViewStyle, type TextStyle } from 'react-native'
import { WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'

export function makeLoginStyles(t: UiTheme) {
  const screen: ViewStyle = {
    backgroundColor: t.color.grund,
    paddingHorizontal: t.space.s5,
    paddingVertical: t.space.s6,
    justifyContent: 'center',
    minHeight: '100%',
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  }
  const wideScreen: ViewStyle = {
    ...screen,
    maxWidth: WIDE_CONTENT_MAX_WIDTH,
  }
  // Two columns, `m`/`l` only (LoginScreen's single `useBreakpoint` call above already gates
  // this) — the form keeps its own established width via `formColumn`, the QR column takes the
  // rest up to the same `WIDE_CONTENT_MAX_WIDTH` every other wide layout in this app uses.
  const wideRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.space.s6,
    justifyContent: 'center',
    width: '100%',
  }
  const formColumn: ViewStyle = { width: '100%', maxWidth: 460, flexShrink: 1 }
  const linksRow: ViewStyle = { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: t.space.s3 }
  const link: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte }
  const guestNote: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2, textAlign: 'center', marginTop: t.space.s2 }
  const submittingRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const submittingLabel: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte }
  const cta: ViewStyle = { marginTop: t.space.s5 }
  // AC-A's single shared alert — a failure, not a caution or a positive confirmation.
  const outageBanner: ViewStyle = {
    backgroundColor: t.color.fehlerWeich,
    borderWidth: 2,
    borderColor: t.color.fehler,
    borderRadius: t.radius.s,
    padding: t.space.s4,
    marginBottom: t.space.s4,
  }
  const outageHeading: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte, marginBottom: t.space.s1 }
  const outageBody: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2 }

  return {
    screen,
    wideScreen,
    wideRow,
    formColumn,
    linksRow,
    link,
    guestNote,
    submittingRow,
    submittingLabel,
    cta,
    outageBanner,
    outageHeading,
    outageBody,
  }
}
