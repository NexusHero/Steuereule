// How wide a text prints on the official forms: Helvetica at 10 pt, as the printout renders them
// (apps/api/src/printout/form-renderer.ts). Lets a mask stop a text that would not fit its box before
// the printout refuses it after payment (real case 2024/2025, ADR-0090).

/** Helvetica advance widths in 1/1000 em (Adobe AFM), for the characters a German form uses. */
const HELVETICA: Readonly<Record<string, number>> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584,
  ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833,
  n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  '{': 334, '|': 260, '}': 334, '~': 584,
  Ä: 667, Ö: 778, Ü: 722, ä: 556, ö: 556, ü: 556, ß: 611, é: 556, è: 556, á: 556, à: 556, ç: 500,
  '–': 556, '—': 1000, '„': 333, '“': 333, '”': 333, '‘': 222, '’': 222, '€': 556, '§': 556, '°': 400,
}

/** The font size the printout uses on every form. */
export const PRINT_FONT_SIZE_PT = 10

/**
 * The width a text takes on the forms, in points. Kerning is left out, so this is never less than the
 * printout measures; unknown characters count as wide (an em), never narrow.
 */
export function printedWidthPt(text: string, sizePt: number = PRINT_FONT_SIZE_PT): number {
  let units = 0
  for (const char of text) units += HELVETICA[char] ?? 1000
  return (units * sizePt) / 1000
}

/**
 * Anlage Kind Z. 67, „Art der Dienstleistung, Name und Anschrift“ of the childcare: the narrower box of
 * the 2024 (238.4 pt) and 2025 (239.1 pt) forms, less the 3 pt the printout keeps from its left edge.
 */
export const CHILDCARE_PROVIDER_WIDTH_PT = 238.4 - 3

/**
 * Anlage N / N-Gre „Arbeitsort“ (first and second way to work): the narrowest box over the printable
 * years (240.2 pt, 2023-2025), less the 3 pt the printout keeps from its left edge.
 */
export const WORKPLACE_WIDTH_PT = 240.2 - 3

/**
 * The longest beginning of a text that fits a box of this width, for a text pasted too long: cut, never
 * dropped. Leading blanks are kept (the caller trims on save), a trailing blank does not count.
 */
export function cutToPrintBox(text: string, widthPt: number): string {
  let kept = ''
  for (const char of text) {
    if (!fitsPrintBox(`${kept}${char}`.trim(), widthPt)) break
    kept += char
  }
  return kept
}

/** Whether a text fits a box of this width on the forms. */
export function fitsPrintBox(text: string, widthPt: number): boolean {
  return printedWidthPt(text) <= widthPt
}
