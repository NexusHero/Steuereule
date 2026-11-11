// #450 D3 — preparing a phone photo of a Lohnsteuerbescheinigung for the on-device OCR.
//
// tesseract binarises with one global threshold and expects upright, level lines. A photo breaks
// both: a shadow or a dim room leaves no single threshold that separates ink from paper, and a
// page turned by 90° or tilted by a few degrees is read as noise. Before the OCR the photo is:
//   1. turned to grey and flattened (each pixel divided by its local paper brightness),
//   2. turned so that the text lines run horizontally (projection profile of the ink),
//   3. straightened by the measured tilt,
//   4. read; when the reading holds too few LStB lines, the other orientations are tried and the
//      best reading wins.
// Everything runs in the browser on plain arrays; no pixel leaves the device (ADR-0060).

export interface RgbaImage {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
}

export interface GrayImage {
  readonly data: Uint8Array
  readonly width: number
  readonly height: number
}

/** Longest side of the copy the geometry is measured on; enough for lines, cheap on a phone. */
const ANALYSIS_MAX_SIDE = 900
/** Tilts are searched in this range and step (degrees). */
const SKEW_RANGE_DEG = 8
const SKEW_STEP_DEG = 0.25
/** Below this tilt the page is left as it is (straightening only blurs it). */
const SKEW_MIN_DEG = 0.3
/** A reading with this many distinct LStB lines is taken without trying other orientations. */
const GOOD_READING = 3
const INK_THRESHOLD = 128
/** Ink/paper threshold on the flattened page (middle of the range that reads the whole corpus). */
const BINARY_THRESHOLD = 140

export function toGray(img: RgbaImage): GrayImage {
  const data = new Uint8Array(img.width * img.height)
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    data[i] = (img.data[p]! * 299 + img.data[p + 1]! * 587 + img.data[p + 2]! * 114) / 1000
  }
  return { data, width: img.width, height: img.height }
}

/** Sliding maximum along rows (axis 0) or columns (axis 1), window 2r+1. */
function slidingMax(src: Uint8Array, width: number, height: number, r: number, vertical: boolean): Uint8Array {
  const out = new Uint8Array(src.length)
  const lines = vertical ? width : height
  const len = vertical ? height : width
  const at = (line: number, i: number) => (vertical ? i * width + line : line * width + i)
  for (let line = 0; line < lines; line++) {
    for (let i = 0; i < len; i++) {
      let m = 0
      const from = Math.max(0, i - r)
      const to = Math.min(len - 1, i + r)
      for (let k = from; k <= to; k++) {
        const v = src[at(line, k)]!
        if (v > m) m = v
      }
      out[at(line, i)] = m
    }
  }
  return out
}

/** Box blur with radius r through an integral image. */
function boxBlur(src: Uint8Array, width: number, height: number, r: number): Uint8Array {
  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      row += src[y * width + x]!
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1]! + row
    }
  }
  const out = new Uint8Array(src.length)
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(height, y + r + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(width, x + r + 1)
      const sum =
        integral[y1 * (width + 1) + x1]! - integral[y0 * (width + 1) + x1]! - integral[y1 * (width + 1) + x0]! + integral[y0 * (width + 1) + x0]!
      out[y * width + x] = sum / ((x1 - x0) * (y1 - y0))
    }
  }
  return out
}

/**
 * Divides every pixel by the brightness of the paper around it. The paper is estimated by a
 * maximum filter wide enough to step over a character, then smoothed: under a shadow or in a dim
 * room the paper becomes white again and the ink keeps its contrast to it.
 */
export function normalizeIllumination(img: GrayImage): GrayImage {
  const { width, height } = img
  const r = Math.max(4, Math.round(Math.min(width, height) / 40))
  const paper = boxBlur(slidingMax(slidingMax(img.data, width, height, r, false), width, height, r, true), width, height, r)
  const data = new Uint8Array(img.data.length)
  for (let i = 0; i < data.length; i++) {
    const bg = Math.max(1, paper[i]!)
    data[i] = Math.min(255, Math.round((img.data[i]! * 255) / bg))
  }
  return { data, width, height }
}

/** A smaller copy (box average) for measuring; the OCR still gets the full image. */
export function downscale(img: GrayImage, maxSide = ANALYSIS_MAX_SIDE): GrayImage {
  const factor = Math.ceil(Math.max(img.width, img.height) / maxSide)
  if (factor <= 1) return img
  const width = Math.floor(img.width / factor)
  const height = Math.floor(img.height / factor)
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let dy = 0; dy < factor; dy++) for (let dx = 0; dx < factor; dx++) sum += img.data[(y * factor + dy) * img.width + x * factor + dx]!
      data[y * width + x] = sum / (factor * factor)
    }
  }
  return { data, width, height }
}

/** Coefficient of variation of a profile: high when it alternates between full and empty. */
function variation(profile: Float64Array): number {
  let mean = 0
  for (const v of profile) mean += v
  mean /= profile.length
  if (mean === 0) return 0
  let variance = 0
  for (const v of profile) variance += (v - mean) ** 2
  return Math.sqrt(variance / profile.length) / mean
}

/**
 * Projects the ink along every candidate tilt and keeps the sharpest projection (sum of squares):
 * the angle the text lines run along, and how sharply the ink then alternates between lines and
 * gaps (coefficient of variation over the inked span).
 */
function bestRowProjection(img: GrayImage): { readonly degrees: number; readonly sharpness: number } {
  const small = downscale(img)
  const xs: number[] = []
  const ys: number[] = []
  for (let y = 0; y < small.height; y++) {
    for (let x = 0; x < small.width; x++) {
      if (small.data[y * small.width + x]! < INK_THRESHOLD) {
        xs.push(x - small.width / 2)
        ys.push(y)
      }
    }
  }
  if (xs.length === 0) return { degrees: 0, sharpness: 0 }
  const margin = Math.ceil((small.width / 2) * Math.tan((SKEW_RANGE_DEG * Math.PI) / 180)) + 1
  const bins = new Float64Array(small.height + 2 * margin)
  const project = (deg: number) => {
    const tan = Math.tan((deg * Math.PI) / 180)
    bins.fill(0)
    for (let i = 0; i < xs.length; i++) {
      const bin = Math.round(ys[i]! - xs[i]! * tan) + margin
      bins[bin] = bins[bin]! + 1
    }
  }
  let best = 0
  let bestScore = -1
  const steps = Math.round(SKEW_RANGE_DEG / SKEW_STEP_DEG)
  for (let step = -steps; step <= steps; step++) {
    const deg = step * SKEW_STEP_DEG
    project(deg)
    let score = 0
    for (const b of bins) score += b * b
    // Ties go to the smaller tilt, so a level page stays at 0.
    if (score > bestScore || (score === bestScore && Math.abs(deg) < Math.abs(best))) {
      bestScore = score
      best = deg
    }
  }
  project(best)
  let first = 0
  let last = bins.length - 1
  while (first < last && bins[first] === 0) first++
  while (last > first && bins[last] === 0) last--
  return { degrees: best, sharpness: variation(bins.subarray(first, last + 1)) }
}

/**
 * Whether the text lines run horizontally or vertically. Text lines leave empty gaps between them,
 * so projected along the lines the ink alternates far more sharply than across them. Both
 * directions are judged along their best tilt: a tilted page smears the plain row profile.
 */
export function textAxis(img: GrayImage): 'horizontal' | 'vertical' {
  const small = downscale(img)
  const rows = bestRowProjection(small).sharpness
  const cols = bestRowProjection(rotateGray(small, 90)).sharpness
  return rows >= cols ? 'horizontal' : 'vertical'
}

/** The tilt of the text lines in degrees (positive: the lines fall to the right). */
export function estimateSkewDegrees(img: GrayImage): number {
  return bestRowProjection(img).degrees
}

/**
 * Hard black and white after flattening. The flattened paper sits near 255 everywhere, so one
 * threshold separates it from the ink; tesseract's own threshold on the grey image misread single
 * digits of dimmed photos (measured on the corpus: 130–150 read every field, 170 loses some).
 */
export function binarize(img: GrayImage, threshold = BINARY_THRESHOLD): GrayImage {
  const data = new Uint8Array(img.data.length)
  for (let i = 0; i < data.length; i++) data[i] = img.data[i]! < threshold ? 0 : 255
  return { data, width: img.width, height: img.height }
}

/**
 * Turns the image clockwise by `degrees`. Quarter turns are exact; any other angle keeps the size,
 * samples bilinearly and fills the uncovered corners with white paper.
 */
export function rotateGray(img: GrayImage, degrees: number): GrayImage {
  const { width: w, height: h, data: src } = img
  const quarter = (((Math.round(degrees) % 360) + 360) % 360) / 90
  if (Number.isInteger(degrees) && degrees % 90 === 0) {
    if (quarter === 0) return img
    if (quarter === 2) {
      const data = new Uint8Array(src.length)
      for (let i = 0; i < src.length; i++) data[i] = src[src.length - 1 - i]!
      return { data, width: w, height: h }
    }
    const data = new Uint8Array(src.length)
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < h; x++) {
        // Clockwise: out(x, y) = in(y, h-1-x); counter-clockwise: out(x, y) = in(w-1-y, x).
        data[y * h + x] = quarter === 1 ? src[(h - 1 - x) * w + y]! : src[x * w + (w - 1 - y)]!
      }
    }
    return { data, width: h, height: w }
  }
  const rad = (degrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  const data = new Uint8Array(src.length).fill(255)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx
      const dy = y - cy
      const sx = cx + dx * cos + dy * sin
      const sy = cy - dx * sin + dy * cos
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) continue
      const fx = sx - x0
      const fy = sy - y0
      const i = y0 * w + x0
      const top = src[i]! * (1 - fx) + src[i + 1]! * fx
      const bottom = src[i + w]! * (1 - fx) + src[i + w + 1]! * fx
      data[y * w + x] = Math.round(top * (1 - fy) + bottom * fy)
    }
  }
  return { data, width: w, height: h }
}

const LSTB_LABELS = [
  /brutto\s*arbeits\s*lohn/i,
  /lohn\s*steuer\b|lohnsteuer\s+von/i,
  /solidarit/i,
  /renten\s*versicherung/i,
  /kranken\s*versicherung/i,
  /pflege\s*versicherung/i,
  /arbeitslosen\s*versicherung/i,
  /kirchensteuer/i,
]
const AMOUNT = /\d{1,3}(?:\.\d{3})*,\d{2}/g

/** How much of an LStB a reading holds: distinct line labels, plus a little for amounts. */
export function textQuality(text: string): number {
  const labels = LSTB_LABELS.filter((re) => re.test(text)).length
  const amounts = Math.min(10, text.match(AMOUNT)?.length ?? 0)
  return labels + amounts / 100
}

/** Flattened, upright and level: the image the first OCR pass gets, for one quarter turn. */
function prepared(flat: GrayImage, quarterTurn: number): GrayImage {
  const turned = rotateGray(flat, quarterTurn)
  const skew = estimateSkewDegrees(turned)
  return binarize(Math.abs(skew) >= SKEW_MIN_DEG ? rotateGray(turned, -skew) : turned)
}

/**
 * Reads a photo: flattens it, finds the orientation of the text, straightens it and runs the OCR
 * (`recognize`). When a reading holds fewer than three LStB lines the page may be upside down or
 * turned the other way; those orientations are tried in turn and the best reading is returned.
 */
export async function recognizePhoto(photo: RgbaImage, recognize: (image: GrayImage) => Promise<string>): Promise<string> {
  const flat = normalizeIllumination(toGray(photo))
  const first = textAxis(flat) === 'horizontal' ? 0 : 270
  let best = ''
  let bestScore = -1
  for (const turn of [first, first + 180, first + 90, first + 270]) {
    const text = await recognize(prepared(flat, turn % 360))
    const score = textQuality(text)
    if (score > bestScore) {
      best = text
      bestScore = score
    }
    if (bestScore >= GOOD_READING) break
  }
  return best
}
