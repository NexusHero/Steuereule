import type { TextStyle, ViewStyle } from 'react-native'
import { theme as tokens } from '@steuereule/tokens'
import { WIDE_CONTENT_MAX_WIDTH, FLOW_CONTENT_MAX_WIDTH, NARROW_CONTENT_MAX_WIDTH } from '../responsive/contentWidth'

/**
 * Text roles — the ONE place that decides family, size, weight and leading for every kind of
 * text in the app ("Funke ruhig", #funke-layout). Screens spread a role (`...t.type.title`) and
 * add only what is theirs: colour, margins, alignment. Changing the hierarchy means changing this
 * table, not 50 screens. The adherence check forbids `fontFamily`/`fontSize`/`fontWeight` in
 * screen styles outside the Eule.
 */
export type TypeRole =
  // Display (Bricolage Grotesque) — titles and figures
  | 'hero' // the refund figure
  | 'title' // the screen's own title, one per screen
  | 'headline' // a section heading inside a screen
  | 'subhead' // a smaller heading, e.g. a result block
  | 'cardTitle' // a card's or tile's title
  | 'itemTitle' // a small display label in a list
  // Text (Schibsted Grotesk) — reading and controls
  | 'emphasis' // a highlighted larger line
  | 'body'
  | 'bodyStrong'
  | 'button' // label weight for pressable text
  | 'small'
  | 'label' // field labels
  | 'labelStrong'
  | 'caption'
  | 'captionStrong'
  // Mono (Space Mono) — metadata and tabular figures
  | 'meta' // uppercase kicker / metadata
  | 'metaLarge'
  | 'figure' // a mono value inside running layout
  | 'figureStrong'
  | 'code' // a code to read out (device code)

const { font, size, weight } = tokens

/** Display lines get their own leading so wrapped titles never collide or clip. */
const displayLeading = (px: number): number => Math.round(px * 1.15)

export const TYPE: Readonly<Record<TypeRole, TextStyle>> = {
  hero: { fontFamily: font.display, fontWeight: weight.schwer, fontSize: size.held, lineHeight: displayLeading(size.held) },
  title: { fontFamily: font.display, fontWeight: weight.schwer, fontSize: size['3xl'], lineHeight: displayLeading(size['3xl']) },
  headline: { fontFamily: font.display, fontWeight: weight.schwer, fontSize: size['2xl'], lineHeight: displayLeading(size['2xl']) },
  subhead: { fontFamily: font.display, fontWeight: weight.schwer, fontSize: size.xl, lineHeight: displayLeading(size.xl) },
  cardTitle: { fontFamily: font.display, fontWeight: weight.schwer, fontSize: size.l },
  itemTitle: { fontFamily: font.display, fontWeight: weight.fett, fontSize: size.m },

  emphasis: { fontFamily: font.text, fontWeight: weight.schwer, fontSize: size.l },
  body: { fontFamily: font.text, fontSize: size.m },
  bodyStrong: { fontFamily: font.text, fontWeight: weight.fett, fontSize: size.m },
  button: { fontFamily: font.text, fontWeight: weight.schwer, fontSize: size.m },
  small: { fontFamily: font.text, fontSize: size.s },
  label: { fontFamily: font.text, fontWeight: weight.fett, fontSize: size.s },
  labelStrong: { fontFamily: font.text, fontWeight: weight.schwer, fontSize: size.s },
  caption: { fontFamily: font.text, fontSize: size.xs },
  captionStrong: { fontFamily: font.text, fontWeight: weight.fett, fontSize: size.xs },

  meta: { fontFamily: font.mono, fontSize: size.xs },
  metaLarge: { fontFamily: font.mono, fontSize: size.s },
  figure: { fontFamily: font.mono, fontSize: size.m },
  figureStrong: { fontFamily: font.mono, fontWeight: weight.schwer, fontSize: size.l },
  code: { fontFamily: font.mono, fontWeight: weight.schwer, fontSize: size['3xl'] },
}

/**
 * Screen layout — the ONE place that decides how a screen sits on phone, tablet and desktop.
 *
 * - `flow`: questions, masks, sign-in and settings — a calm centred reading column. On a phone it
 *   is the full width; from tablet up it stays at FLOW_CONTENT_MAX_WIDTH so a question never
 *   stretches into a 900 px form row.
 * - `overview`: Cockpit, Belege, Profil — content that benefits from width (tiles, lists).
 *
 * `narrow` is the phone column, `wide` the tablet/desktop column. Screens pick
 * `bp === 's' ? t.layout.flow.narrow : t.layout.flow.wide` (or `overview`) and add only their own
 * extras (a larger bottom padding, a centred content block).
 */
export interface ScreenLayout {
  readonly narrow: ViewStyle
  readonly wide: ViewStyle
}

export interface LayoutRoles {
  readonly flow: ScreenLayout
  readonly overview: ScreenLayout
}

function screen(maxWide: number): ScreenLayout {
  const narrow: ViewStyle = {
    paddingHorizontal: tokens.space.s5,
    paddingVertical: tokens.space.s6,
    minHeight: '100%',
    maxWidth: NARROW_CONTENT_MAX_WIDTH,
    width: '100%',
    alignSelf: 'center',
  }
  return { narrow, wide: { ...narrow, maxWidth: maxWide } }
}

export const LAYOUT_BASE: LayoutRoles = {
  flow: screen(FLOW_CONTENT_MAX_WIDTH),
  overview: screen(WIDE_CONTENT_MAX_WIDTH),
}

/** Binds the layout to a colour mode (the screen ground follows the theme). */
export function layoutFor(grund: string): LayoutRoles {
  const paint = (l: ScreenLayout): ScreenLayout => ({
    narrow: { ...l.narrow, backgroundColor: grund },
    wide: { ...l.wide, backgroundColor: grund },
  })
  return { flow: paint(LAYOUT_BASE.flow), overview: paint(LAYOUT_BASE.overview) }
}
