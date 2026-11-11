import { describe, expect, it, vi } from 'vitest'
import {
  binarize,
  estimateSkewDegrees,
  normalizeIllumination,
  recognizePhoto,
  rotateGray,
  textAxis,
  textQuality,
  type GrayImage,
  type RgbaImage,
} from './imagePreprocess'

/** White page with dark horizontal "text lines" (bars with gaps), optionally tilted by `degrees`. */
function linesPage(width: number, height: number, degrees = 0): GrayImage {
  const data = new Uint8Array(width * height).fill(255)
  const tan = Math.tan((degrees * Math.PI) / 180)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const yy = y - (x - width / 2) * tan
      const inLine = ((yy % 20) + 20) % 20 < 6
      const inWord = x % 14 < 10 && x > width * 0.1 && x < width * 0.9
      if (inLine && inWord && yy > 10 && yy < height - 10) data[y * width + x] = 20
    }
  }
  return { data, width, height }
}

function transpose(img: GrayImage): GrayImage {
  const data = new Uint8Array(img.width * img.height)
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) data[x * img.height + y] = img.data[y * img.width + x]!
  return { data, width: img.height, height: img.width }
}

describe('imagePreprocess (#450 D3: photos of an LStB)', () => {
  it('flattens a shadow: the background becomes white everywhere, the ink stays dark', () => {
    const page = linesPage(300, 200)
    // A shadow falling from left (bright) to right (dark), as in the corpus variant "schatten".
    const shaded = new Uint8Array(page.data.length)
    for (let y = 0; y < page.height; y++) {
      for (let x = 0; x < page.width; x++) shaded[y * page.width + x] = Math.round(page.data[y * page.width + x]! * (1 - 0.7 * (x / page.width)))
    }
    const out = normalizeIllumination({ data: shaded, width: page.width, height: page.height })
    // A gap between lines on the dark side and on the bright side: both read as paper.
    const paperRight = out.data[3 * page.width + 280]!
    const paperLeft = out.data[3 * page.width + 20]!
    expect(paperRight).toBeGreaterThan(230)
    expect(paperLeft).toBeGreaterThan(230)
    // Ink on the dark side stays clearly darker than the paper next to it.
    const inkRight = out.data[22 * page.width + 260]!
    expect(page.data[22 * page.width + 260]).toBe(20)
    expect(inkRight).toBeLessThan(120)
  })

  it('tells horizontal text lines from a page turned by 90°', () => {
    const page = linesPage(240, 160)
    expect(textAxis(page)).toBe('horizontal')
    expect(textAxis(transpose(page))).toBe('vertical')
    // A tilted page is still horizontal: tilted lines smear the plain row profile, so the axis is
    // judged along the best tilt (the corpus variant "schief" was read three times before).
    const tilted = linesPage(600, 200, 3)
    expect(textAxis(tilted)).toBe('horizontal')
    expect(textAxis(transpose(tilted))).toBe('vertical')
  })

  it('binarises the flattened page: ink black, paper white', () => {
    const out = binarize({ data: new Uint8Array([0, 90, 139, 140, 200, 255]), width: 6, height: 1 })
    expect(Array.from(out.data)).toEqual([0, 0, 0, 255, 255, 255])
  })

  it('measures a small tilt of the text lines', () => {
    expect(Math.abs(estimateSkewDegrees(linesPage(400, 300, 0)))).toBeLessThanOrEqual(0.25)
    expect(estimateSkewDegrees(linesPage(400, 300, 3))).toBeCloseTo(3, 0)
    expect(estimateSkewDegrees(linesPage(400, 300, -2))).toBeCloseTo(-2, 0)
  })

  it('rotates by quarter turns and by small angles', () => {
    const img: GrayImage = { data: new Uint8Array([1, 2, 3, 4, 5, 6]), width: 3, height: 2 }
    const cw = rotateGray(img, 90)
    expect([cw.width, cw.height]).toEqual([2, 3])
    expect(Array.from(cw.data)).toEqual([4, 1, 5, 2, 6, 3])
    const half = rotateGray(img, 180)
    expect(Array.from(half.data)).toEqual([6, 5, 4, 3, 2, 1])
    // Straightening a tilted page brings the measured tilt back to about zero.
    const straightened = rotateGray(linesPage(400, 300, 3), -3)
    expect(Math.abs(estimateSkewDegrees(straightened))).toBeLessThanOrEqual(0.5)
  })

  it('scores OCR text by the LStB lines it contains', () => {
    expect(textQuality('ʞɔǝʇs ǝpɐɯ')).toBe(0)
    expect(textQuality('3. Bruttoarbeitslohn 54.320,00\n4. Einbehaltene Lohnsteuer 9.810,00')).toBeGreaterThan(
      textQuality('3. Bruttoarbeitslohn 54.320,00'),
    )
  })

  it('reads an upright photo with one OCR pass', async () => {
    const page = linesPage(200, 120)
    const rgba = toRgba(page)
    const recognize = vi.fn().mockResolvedValue('3. Bruttoarbeitslohn 54.320,00\n4. Einbehaltene Lohnsteuer 9.810,00\n25. Krankenversicherung 3.100,80')
    const text = await recognizePhoto(rgba, recognize)
    expect(text).toContain('Bruttoarbeitslohn')
    expect(recognize).toHaveBeenCalledTimes(1)
  })

  it('turns a page that reads upside down and keeps the better reading', async () => {
    const rgba = toRgba(linesPage(200, 120))
    const recognize = vi
      .fn()
      .mockResolvedValueOnce('ʞɔǝʇs ǝpɐɯ 00,0ᄅƐ.ㄣ5')
      .mockResolvedValueOnce('3. Bruttoarbeitslohn 54.320,00\n4. Einbehaltene Lohnsteuer 9.810,00\n25. Krankenversicherung 3.100,80')
    const text = await recognizePhoto(rgba, recognize)
    expect(text).toContain('Lohnsteuer')
    expect(recognize).toHaveBeenCalledTimes(2)
    // The second pass got the same page turned by 180°.
    const [first, second] = recognize.mock.calls.map((c) => c[0] as GrayImage)
    expect(second!.width).toBe(first!.width)
    expect(second!.data[0]).toBe(first!.data[first!.data.length - 1])
  })
})

function toRgba(img: GrayImage): RgbaImage {
  const data = new Uint8ClampedArray(img.width * img.height * 4)
  for (let i = 0; i < img.data.length; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = img.data[i]!
    data[i * 4 + 3] = 255
  }
  return { data, width: img.width, height: img.height }
}
