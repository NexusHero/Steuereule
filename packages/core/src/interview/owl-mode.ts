import { createHash } from 'node:crypto'
import { isSupportedIncomeTaxYear } from '../math/tarif'
import { getTaxYearParameters } from '../math/tax-parameters'
import type { HOME_OFFICE_VALUES, Profession } from './interview'
import { professionTipsFor } from './profession-tips'

export type OwlTriggerKind = 'musterluecke' | 'vorjahresvergleich' | 'rechtsaenderung' | 'lebenslage_hinweis'
export type OwlCardCategory = 'cockpit_proaktiv' | 'abruf_frage' | 'archiv_einspruch'
export type OwlSourceId =
  | 'estg-4-5-6c'
  | 'estg-9-1'
  | 'estg-9-1-4a'
  | 'estg-9-1-6'
  | 'estg-9-4a'
  | 'estg-9-6'
  | 'estg-10b'
  | 'estg-10-1-5'
  | 'estg-35a'
  | 'estg-10-1-3'
  | 'estg-33'
  | 'ao-355'

export interface OwlRecommendationPath {
  readonly name: string
  readonly amountEur: number
  readonly description: string
  readonly risk: 'sicher' | 'risiko'
}

export interface OwlCard {
  readonly id: string
  readonly fingerprint: string
  readonly trigger: OwlTriggerKind
  readonly category: OwlCardCategory
  readonly title: string
  readonly message: string
  readonly reason: string
  readonly amountEur: number | null
  readonly legalStatusDate: string
  readonly sourceId: OwlSourceId
  readonly sourceTranslated: string
  readonly sourceUrl?: string | undefined
  readonly paths?: readonly [OwlRecommendationPath, OwlRecommendationPath] | undefined
  readonly appealDeadline?: string | undefined
}

export type OwlCardsDisplay = Omit<OwlCard, 'sourceId'>

export interface OwlArchiveYear {
  readonly taxYear: number
  readonly assessmentDate: string
  readonly appealPossibleUntil: string
  readonly homeOfficeDays: number
}

export interface OwlInputFacts {
  readonly taxYear: number
  readonly hasTraining?: boolean
  /** The occupation group from the interview (`beruf`) — drives the profession tips. */
  readonly profession?: Profession | undefined
  readonly homeOfficeDays?: number | null
  readonly lastYearFacts?: { readonly donationsEur?: number | null } | null
  readonly childrenPerInterview?: boolean
  readonly hasChildrenRecorded?: boolean
  readonly archiveYears?: readonly OwlArchiveYear[]
  readonly dismissedFingerprints?: readonly string[]
}

export function calculateOwlCardFingerprint(trigger: OwlTriggerKind, keyContext: string): string {
  return createHash('sha256').update(`${trigger}::${keyContext}`).digest('hex').slice(0, 16)
}

export const LEGAL_STATUS_DATE = '01.01.2025'

const HOME_OFFICE_DAILY_RATE_EUR = 6
const HOME_OFFICE_MAX_DAYS = 210
const ASSUMED_WORKDAYS = 220

type HomeOfficeAnswer = (typeof HOME_OFFICE_VALUES)[number]

const HOME_OFFICE_SHARE: Record<HomeOfficeAnswer, number> = {
  Nie: 0,
  '1–2 Tage pro Woche': 0.3,
  'Fast immer': 1,
}

export function homeOfficeDaysFromInterview(answers: Readonly<Record<string, string>>): number | null {
  const share = HOME_OFFICE_SHARE[answers['homeoffice'] as HomeOfficeAnswer]
  if (share === undefined) return null
  const days = answers['tage']
  const workdays = days && /^\d+$/.test(days) ? Number(days) : ASSUMED_WORKDAYS
  return Math.min(Math.round(workdays * share), HOME_OFFICE_MAX_DAYS)
}

function homeOfficeAllowanceEur(days: number, taxYear?: number): number {
  const params =
    taxYear !== undefined && isSupportedIncomeTaxYear(taxYear)
      ? getTaxYearParameters(taxYear).homeOffice
      : null
  const maxDays = params ? params.maxDays : HOME_OFFICE_MAX_DAYS
  const rate = params ? params.dailyRateEur : HOME_OFFICE_DAILY_RATE_EUR
  return Math.min(days, maxDays) * rate
}

export function generateOwlCards(facts: OwlInputFacts): readonly OwlCard[] {
  const cards: OwlCard[] = []
  const dismissed = new Set(facts.dismissedFingerprints ?? [])

  if (facts.hasTraining) {
    const fp = calculateOwlCardFingerprint('musterluecke', `fortbildung_ohne_fahrt_${facts.taxYear}`)
    if (!dismissed.has(fp)) {
      cards.push({
        id: `eule-ml-fortbildung-${facts.taxYear}`,
        fingerprint: fp,
        trigger: 'musterluecke',
        category: 'abruf_frage',
        title: 'Fahrtkosten zur Fortbildung',
        message: 'Mir fällt auf: Du hast Fortbildungskosten angegeben, aber keine Fahrtkosten. Bist du geflogen?',
        reason: 'weil Fahrten zu Fortbildungsstätten als Werbungskosten mit 0,30 € pro gefahrenem Kilometer ansetzbar sind.',
        amountEur: null,
        legalStatusDate: LEGAL_STATUS_DATE,
        sourceId: 'estg-9-1-4a',
        sourceTranslated: 'Fahrtkosten bei Auswärtstätigkeiten (§ 9 Abs. 1 Satz 3 Nr. 4a EStG).',
        sourceUrl: 'https://www.gesetze-im-internet.de/estg/__9.html',
      })
    }
  }

  // Tips that fit the user's work — the owl advises from the job, not only from gaps in the data.
  for (const tip of professionTipsFor(facts.profession, facts.hasTraining ?? false)) {
    const fp = calculateOwlCardFingerprint('lebenslage_hinweis', `beruf_${tip.key}_${facts.taxYear}`)
    if (dismissed.has(fp)) continue
    cards.push({
      id: `eule-beruf-${tip.key}-${facts.taxYear}`,
      fingerprint: fp,
      trigger: 'lebenslage_hinweis',
      category: 'abruf_frage',
      title: tip.title,
      message: tip.message,
      reason: tip.reason,
      amountEur: null,
      legalStatusDate: LEGAL_STATUS_DATE,
      sourceId: tip.sourceId,
      sourceTranslated: tip.sourceTranslated,
      sourceUrl: tip.sourceUrl,
    })
  }

  if (
    facts.lastYearFacts?.donationsEur &&
    facts.lastYearFacts.donationsEur > 0
  ) {
    const fp = calculateOwlCardFingerprint('vorjahresvergleich', `spenden_vorjahr_${facts.taxYear}`)
    if (!dismissed.has(fp)) {
      cards.push({
        id: `eule-vj-spenden-${facts.taxYear}`,
        fingerprint: fp,
        trigger: 'vorjahresvergleich',
        category: 'abruf_frage',
        title: 'Spenden wie im Vorjahr?',
        message: `Im Vorjahr hattest du ${facts.lastYearFacts.donationsEur} € Spenden abgesetzt. Gab es dieses Jahr auch Zuwendungen?`,
        reason: 'weil regelmäßige Spenden an gemeinnützige Organisationen jedes Jahr das zu versteuernde Einkommen mindern.',
        amountEur: Math.round(facts.lastYearFacts.donationsEur * 0.3),
        legalStatusDate: LEGAL_STATUS_DATE,
        sourceId: 'estg-10b',
        sourceTranslated: 'Sonderausgabenabzug für Zuwendungen nach § 10b EStG.',
        sourceUrl: 'https://www.gesetze-im-internet.de/estg/__10b.html',
      })
    }
  }

  if (facts.homeOfficeDays && facts.homeOfficeDays >= 10) {
    const amount = homeOfficeAllowanceEur(facts.homeOfficeDays, facts.taxYear)
    const hoParams = isSupportedIncomeTaxYear(facts.taxYear) ? getTaxYearParameters(facts.taxYear).homeOffice : null
    const hoAnnualMax = hoParams ? hoParams.maxAnnualEur : 1260
    if (amount >= 50) {
      const fp = calculateOwlCardFingerprint('rechtsaenderung', `homeoffice_pauschale_${facts.taxYear}_${amount}`)
      if (!dismissed.has(fp)) {
        cards.push({
          id: `eule-ra-homeoffice-${facts.taxYear}`,
          fingerprint: fp,
          trigger: 'rechtsaenderung',
          category: 'cockpit_proaktiv',
          title: 'Homeoffice-Tagespauschale 6 €',
          message: `Du hast ${facts.homeOfficeDays} Tage im Homeoffice gearbeitet. Nach aktueller Rechtslage kannst du 6 € pro Tag geltend machen!`,
          reason: 'weil der Gesetzgeber die Homeoffice-Pauschale dauerhaft auf 6 € pro Tag (max. 1.260 € / 210 Tage) angehoben hat.',
          amountEur: amount,
          legalStatusDate: LEGAL_STATUS_DATE,
          sourceId: 'estg-4-5-6c',
          sourceTranslated: 'Homeoffice-Tagespauschale (§ 4 Abs. 5 Satz 1 Nr. 6c EStG).',
          sourceUrl: 'https://www.gesetze-im-internet.de/estg/__4.html',
          paths: [
            {
              name: 'Tagespauschale ansetzen',
              amountEur: amount,
              description: 'Einfacher Nachweis der Arbeitstage ohne separates Arbeitszimmer',
              risk: 'sicher',
            },
            {
              name: 'Häusliches Arbeitszimmer prüfen',
              amountEur: hoAnnualMax,
              description: 'Höherer Abzug möglich, wenn das Arbeitszimmer der Mittelpunkt der gesamten Tätigkeit ist',
              risk: 'risiko',
            },
          ],
        })
      }
    }
  }

  if (facts.childrenPerInterview && !facts.hasChildrenRecorded) {
    const fp = calculateOwlCardFingerprint('lebenslage_hinweis', `kinder_nicht_erfasst_${facts.taxYear}`)
    if (!dismissed.has(fp)) {
      cards.push({
        id: `eule-lh-kinder-${facts.taxYear}`,
        fingerprint: fp,
        trigger: 'lebenslage_hinweis',
        category: 'abruf_frage',
        title: 'Kinder noch nicht erfasst',
        message: 'Du hast im Interview Kinder angegeben, aber noch kein Kind erfasst.',
        reason: 'weil zum Beispiel Kinderbetreuungskosten zu 80 % (bis 4.800 € je Kind) als Sonderausgaben abziehbar sind.',
        amountEur: null,
        legalStatusDate: LEGAL_STATUS_DATE,
        sourceId: 'estg-10-1-5',
        sourceTranslated: 'Kinderbetreuungskosten nach § 10 Abs. 1 Nr. 5 EStG.',
        sourceUrl: 'https://www.gesetze-im-internet.de/estg/__10.html',
      })
    }
  }

  if (facts.archiveYears && facts.archiveYears.length > 0) {
    for (const archive of facts.archiveYears) {
      if (archive.homeOfficeDays > 0) {
        const fp = calculateOwlCardFingerprint('rechtsaenderung', `archiv_einspruch_${archive.taxYear}`)
        if (!dismissed.has(fp)) {
          cards.push({
            id: `eule-archiv-${archive.taxYear}`,
            fingerprint: fp,
            trigger: 'rechtsaenderung',
            category: 'archiv_einspruch',
            title: `Einspruchsfrist Steuerjahr ${archive.taxYear}`,
            message: `Für deinen Steuerbescheid ${archive.taxYear} läuft die Einspruchsfrist bis ${archive.appealPossibleUntil}. Prüf, ob die Homeoffice-Pauschale darin steckt.`,
            reason: 'weil du für dieses Jahr Homeoffice-Tage angegeben hast — fehlt die Pauschale im Bescheid, kannst du bis Fristende Einspruch einlegen.',
            amountEur: homeOfficeAllowanceEur(archive.homeOfficeDays),
            legalStatusDate: LEGAL_STATUS_DATE,
            sourceId: 'ao-355',
            sourceTranslated: 'Einspruchsfrist von einem Monat (§ 355 Abs. 1 AO).',
            sourceUrl: 'https://www.gesetze-im-internet.de/ao_1977/__355.html',
            appealDeadline: archive.appealPossibleUntil,
          })
        }
      }
    }
  }

  return cards.sort((a, b) => {
    if (a.category === 'cockpit_proaktiv' && b.category !== 'cockpit_proaktiv') return -1
    if (a.category !== 'cockpit_proaktiv' && b.category === 'cockpit_proaktiv') return 1
    return (b.amountEur ?? 0) - (a.amountEur ?? 0)
  })
}
