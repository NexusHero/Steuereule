/**
 * The maximum width a screen's content column may grow to on wider viewports.
 *
 * Why 960: React-Native-Web stretches every screen to 100% of the window, so on a
 * desktop monitor a form would otherwise run the full 1440px+ and blow past the
 * typographic readability limit (~75 characters per line). At the app's 16px base
 * text size, capping the column at 960px keeps line length inside that limit while
 * still feeling like a deliberate desktop layout rather than a stretched phone.
 *
 * ADR-0014: this is the single source of truth for that cap — screens import it
 * instead of repeating the number, so widening the content column is one edit.
 */
export const WIDE_CONTENT_MAX_WIDTH = 960
