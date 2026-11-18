import { describe, expect, it } from 'vitest'
import { nextYearRepeat, shortAssessmentReason } from './assessment-short-reason'

// ADR-0098 §8 — the receipt's one muted line under a changed position: a few words taken from the
// Finanzamt's Erläuterung by fixed patterns, no free text. The first two sentences are the ones of the
// seed and the fixtures (the mock's 2024); the others are variants as Bescheide print them.

describe('shortAssessmentReason', () => {
  it.each([
    ['homeofficeA', 'Die Tätigkeit in der häuslichen Wohnung wurde an 180 statt 210 Tagen berücksichtigt.', 1260, 1080, '180 statt 210 Tage'],
    ['arbeitsmittelA', 'Aufwendungen für das Mobiltelefon wurden wegen privater Mitbenutzung zu 50 % anerkannt.', 380, 260, 'Handy nur zu 50 %'],
    ['homeofficeB', 'Die Tagespauschale wurde für 150 statt 210 Homeoffice-Tage gewährt.', 1260, 900, '150 statt 210 Tage'],
    ['fahrtwegA', 'Die Entfernung zwischen Wohnung und erster Tätigkeitsstätte wurde mit 18 km statt 25 km angesetzt (kürzeste Straßenverbindung).', 1650, 1188, '18 statt 25 km'],
    ['fahrtwegA', 'Die Entfernungspauschale wurde für 15 statt 20 Entfernungskilometer berechnet.', 1320, 990, '15 statt 20 km'],
    ['arbeitsmittelA', 'Die Kosten für den Laptop wurden nur zu 60 % als Werbungskosten berücksichtigt.', 1200, 720, 'Computer nur zu 60 %'],
    ['sonstigeWerbungskostenA', 'Die Kontoführungsgebühren wurden zu 50 % anerkannt.', 32, 16, 'nur zu 50 % anerkannt'],
    ['sonstigeWerbungskostenA', 'Die Fortbildungskosten wurden nicht anerkannt, da sie nicht nachgewiesen wurden.', 480, 0, 'ohne Nachweis gestrichen'],
    ['sonderausgaben', 'Die Spende an den Sportverein wurde mangels Zuwendungsbestätigung nicht berücksichtigt.', 372, 72, 'ohne Nachweis gekürzt'],
    ['arbeitsmittelA', 'Arbeitsmittel ohne Nachweis wurden nur bis 110 € anerkannt.', 380, 110, 'ohne Nachweis gekürzt'],
    ['vorsorgeaufwand', 'Die sonstigen Vorsorgeaufwendungen wurden auf den Höchstbetrag von 1.900 € begrenzt.', 21_400, 19_870, 'auf Höchstbetrag gekürzt'],
    ['aussergewoehnlicheBelastungen', 'Die Krankheitskosten wirken sich wegen der zumutbaren Belastung nicht aus.', 1_400, 0, 'zumutbare Belastung abgezogen'],
  ])('%s: „%s“ → %s', (position, explanation, declared, assessed, reason) => {
    expect(shortAssessmentReason(position, explanation, declared, assessed)).toBe(reason)
  })

  it('says nothing it cannot read: no explanation, or one without a known pattern', () => {
    expect(shortAssessmentReason('homeofficeA', null, 1260, 1080)).toBeNull()
    expect(shortAssessmentReason('homeofficeA', '   ', 1260, 1080)).toBeNull()
    expect(shortAssessmentReason('fahrtwegA', 'Die Berechnung wurde von Amts wegen geändert.', 1320, 990)).toBeNull()
  })

  it('stays short: never more than five words', () => {
    const reasons = [
      shortAssessmentReason('homeofficeA', 'Die Tätigkeit in der häuslichen Wohnung wurde an 180 statt 210 Tagen berücksichtigt.', 1260, 1080),
      shortAssessmentReason('arbeitsmittelA', 'Aufwendungen für das Mobiltelefon wurden wegen privater Mitbenutzung zu 50 % anerkannt.', 380, 260),
      shortAssessmentReason('vorsorgeaufwand', 'Auf den Höchstbetrag gekürzt.', 1, 0),
    ]
    for (const r of reasons) expect(r!.split(/\s+/).length).toBeLessThanOrEqual(5)
  })
})

describe('nextYearRepeat', () => {
  const again = (declared: number | null, above: boolean | null = true) => ({ year: 2025, declared, declaredAboveRecognised: above })

  it('counts the days of a day-based position at the next year’s daily rate', () => {
    expect(nextYearRepeat('homeofficeA', again(1260))).toEqual({ year: 2025, days: 210 })
    expect(nextYearRepeat('homeofficeB', again(900))).toEqual({ year: 2025, days: 150 })
  })

  it('names the amount where days are not derivable', () => {
    expect(nextYearRepeat('homeofficeA', again(1261))).toEqual({ year: 2025, amount: 1261 })
    expect(nextYearRepeat('arbeitsmittelA', again(520))).toEqual({ year: 2025, amount: 520 })
    expect(nextYearRepeat('homeofficeA', { year: 2019, declared: 600, declaredAboveRecognised: true })).toEqual({ year: 2019, amount: 600 })
  })

  it('is silent unless the next year declares more than was recognised', () => {
    expect(nextYearRepeat('homeofficeA', null)).toBeNull()
    expect(nextYearRepeat('homeofficeA', again(null, null))).toBeNull()
    expect(nextYearRepeat('homeofficeA', again(1080, false))).toBeNull()
  })
})
