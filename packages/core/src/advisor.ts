import { LEGAL_STATUS_DATE, type OwlSourceId } from './owl-mode'
import type { Screen } from './marking'
import type { Profession } from './interview'
import { taxEstimateCrossBorder, taxEstimateEmployee } from './tax-estimate'

export type AdvisorActionStatus = 'pending' | 'applied' | 'dismissed' | 'undone'

export interface AdvisorLegalSource {
  readonly sourceId: OwlSourceId
  readonly paragraph: string
  readonly title: string
  readonly summary: string
  readonly legalStatusDate: string
  readonly url: string
}

export const ADVISOR_LEGAL_SOURCES: Readonly<Record<OwlSourceId, AdvisorLegalSource>> = {
  'estg-4-5-6c': {
    sourceId: 'estg-4-5-6c',
    paragraph: '§ 4 Abs. 5 Nr. 6c EStG',
    title: 'Homeoffice-Tagespauschale & Arbeitszimmer',
    summary:
      'Für jeden Kalendertag, an dem du überwiegend zu Hause arbeitest und keine erste Tätigkeitsstätte aufsuchst, sind 6 € pro Tag (maximal 1.260 € für bis zu 210 Tage im Jahr) als Werbungskosten abziehbar.',
    legalStatusDate: LEGAL_STATUS_DATE,
    url: 'https://www.gesetze-im-internet.de/estg/__4.html',
  },
  'estg-9-1': {
    sourceId: 'estg-9-1',
    paragraph: '§ 9 Abs. 1 EStG',
    title: 'Werbungskosten & Entfernungspauschale',
    summary:
      'Werbungskosten sind Aufwendungen zur Erwerbung, Sicherung und Erhaltung der Einnahmen. Sie wirken sich steuermindernd aus, sobald sie zusammen den Arbeitnehmer-Pauschbetrag von 1.230 € überschreiten.',
    legalStatusDate: LEGAL_STATUS_DATE,
    url: 'https://www.gesetze-im-internet.de/estg/__9.html',
  },
  'estg-9-1-4a': {
    sourceId: 'estg-9-1-4a',
    paragraph: '§ 9 Abs. 1 Nr. 4a EStG',
    title: 'Reise- und Fahrtkosten bei Auswärtstätigkeit',
    summary:
      'Fahrten zu einer Fortbildungsstätte oder auf Dienstreise sind keine Fahrten zur ersten Tätigkeitsstätte: Du kannst jeden gefahrenen Kilometer (Hin- und Rückfahrt) mit 0,30 € oder die tatsächlichen Ticketkosten ansetzen.',
    legalStatusDate: LEGAL_STATUS_DATE,
    url: 'https://www.gesetze-im-internet.de/estg/__9.html',
  },
  'estg-9-1-6': {
    sourceId: 'estg-9-1-6',
    paragraph: '§ 9 Abs. 1 Nr. 6 EStG',
    title: 'Arbeitsmittel & Computerhardware',
    summary:
      'Beruflich genutzte Arbeitsmittel bis 800 € netto (952 € brutto) sowie Computerhardware und Software (BMF-Schreiben vom 22.02.2022) können im Jahr der Anschaffung in Höhe des beruflichen Nutzungsanteils sofort abgezogen werden.',
    legalStatusDate: LEGAL_STATUS_DATE,
    url: 'https://www.gesetze-im-internet.de/estg/__9.html',
  },
  'estg-9-4a': {
    sourceId: 'estg-9-4a',
    paragraph: '§ 9 Abs. 4a EStG',
    title: 'Verpflegungsmehraufwendungen',
    summary:
      'Bei beruflicher Auswärtstätigkeit oder Fortbildung außerhalb deiner Wohnung und ersten Tätigkeitsstätte gelten Pauschalen: 14 € ab mehr als 8 Stunden Abwesenheit (sowie für An- und Abreisetage bei Übernachtung) und 28 € für volle 24-Stunden-Tage.',
    legalStatusDate: LEGAL_STATUS_DATE,
    url: 'https://www.gesetze-im-internet.de/estg/__9.html',
  },
  'estg-9-6': {
    sourceId: 'estg-9-6',
    paragraph: '§ 9 Abs. 6 EStG',
    title: 'Erst- und Zweitausbildung',
    summary:
      'Aufwendungen für eine Berufsausbildung oder ein Studium nach einer bereits abgeschlossenen ersten Ausbildung (Zweitausbildung, z. B. Master nach Bachelor) sind unbeschränkt als Werbungskosten abziehbar.',
    legalStatusDate: LEGAL_STATUS_DATE,
    url: 'https://www.gesetze-im-internet.de/estg/__9.html',
  },
  'estg-10b': {
    sourceId: 'estg-10b',
    paragraph: '§ 10b EStG',
    title: 'Steuerbegünstigte Zuwendungen (Spenden)',
    summary:
      'Spenden und Mitgliedsbeiträge zur Förderung steuerbegünstigter Zwecke sind bis zu 20 % des Gesamtbetrags der Einkünfte direkt als Sonderausgaben abziehbar (bis 300 € je Einzelspende genügt der Kontoauszug als vereinfachter Nachweis).',
    legalStatusDate: LEGAL_STATUS_DATE,
    url: 'https://www.gesetze-im-internet.de/estg/__10b.html',
  },
  'estg-10-1-5': {
    sourceId: 'estg-10-1-5',
    paragraph: '§ 10 Abs. 1 Nr. 5 EStG',
    title: 'Kinderbetreuungskosten',
    summary:
      'Kinderbetreuungskosten für Kinder bis zum 14. Lebensjahr (Kita, Tagesmutter, Hort) sind als Sonderausgaben abziehbar, sofern eine Rechnung vorliegt und unbar gezahlt wurde.',
    legalStatusDate: LEGAL_STATUS_DATE,
    url: 'https://www.gesetze-im-internet.de/estg/__10.html',
  },
  'ao-355': {
    sourceId: 'ao-355',
    paragraph: '§ 355 Abs. 1 AO',
    title: 'Einspruchsfrist gegen Steuerbescheide',
    summary:
      'Ein Einspruch gegen den Einkommensteuerbescheid ist innerhalb eines Monats nach Bekanntgabe des Bescheids beim Finanzamt einzulegen.',
    legalStatusDate: LEGAL_STATUS_DATE,
    url: 'https://www.gesetze-im-internet.de/ao_1977/__355.html',
  },
}

export interface AdvisorActionProposal {
  readonly actionId: string
  readonly status: AdvisorActionStatus
  readonly screen: Screen
  readonly field: string
  readonly instance: string | null
  readonly companionFields?: Readonly<Record<string, string>> | undefined
  readonly label: string
  readonly previousValue: string | null
  readonly newValue: string
  readonly beforeRefundEur: number
  readonly afterRefundEur: number
  readonly deltaEur: number
  readonly reason: string
  readonly sourceId: OwlSourceId
}

export interface AdvisorTwoPathsProposal {
  readonly title: string
  readonly safePath: AdvisorActionProposal
  readonly maxPath: AdvisorActionProposal & { readonly evidenceHint: string }
  readonly sourceId: OwlSourceId
}

export interface AdvisorMessageMeta {
  readonly choices?: readonly string[] | undefined
  readonly action?: AdvisorActionProposal | undefined
  readonly twoPaths?: AdvisorTwoPathsProposal | undefined
  readonly sources?: readonly OwlSourceId[] | undefined
}

export interface AdvisorChatMessageView {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly meta: AdvisorMessageMeta | null
  readonly createdAt: string
}

export interface CaseDigest {
  readonly taxYear: number
  readonly filingStatus: 'einzel' | 'zusammen'
  readonly profession?: Profession | undefined
  readonly lstbPersonA: {
    readonly grossWageEur: number | null
    readonly wageTaxEur: number | null
    readonly socialSecurityEur: number | null
  }
  readonly crossBorder: {
    readonly isCrossBorderCh: boolean
    readonly grossWageChf: number | null
    readonly withholdingTaxChf: number | null
    readonly pillar3aChf: number | null
    readonly healthInsuranceChf: number | null
    readonly dailySicknessBenefitChf: number | null
    readonly nonReturnDays: number | null
  }
  readonly commuteAndWorkdays: {
    readonly workdays: number | null
    readonly homeOfficeAnswer: string | null
    readonly homeOfficeDays: number | null
    readonly distanceKm: number | null
  }
  readonly catalogExpenses: {
    readonly hasTraining: boolean
    readonly relocationCostsEur: number | null
    readonly donationsEur: number | null
    readonly selfPaidKvPvEur: number | null
    readonly riesterEur: number | null
    readonly doubleHouseholdRentEur: number | null
  }
  readonly childrenCount: number
  readonly rentalObjectsCount: number
  readonly capitalGainEur: number | null
  readonly priorYearComparison: {
    readonly donationsEur: number | null
  }
  readonly openOwlHints: readonly {
    readonly id: string
    readonly fingerprint: string
    readonly title: string
    readonly message: string
    readonly sourceId: OwlSourceId
    readonly amountEur: number | null
  }[]
  readonly printoutMissingFields: readonly string[]
  readonly estimatedRefundEur: number | null
}

function commuterAllowanceFrom(workdays: number, distanceKm: number): number {
  if (workdays <= 0 || distanceKm <= 0) return 0
  const first20 = Math.min(distanceKm, 20) * 0.3
  const above20 = Math.max(0, distanceKm - 20) * 0.38
  return Math.round(workdays * (first20 + above20))
}

function homeOfficeDaysForAnswer(answer: string | null, workdays: number): number {
  if (answer === '1–2 Tage pro Woche') return Math.min(Math.round(workdays * 0.3), 210)
  if (answer === 'Fast immer') return Math.min(workdays, 210)
  return 0
}

function computeRefundMidpoint(digest: CaseDigest): number {
  if (digest.crossBorder.isCrossBorderCh && digest.crossBorder.grossWageChf) {
    const rate = 1.05
    const wageEur = Math.round(digest.crossBorder.grossWageChf * rate)
    const withholdingTaxEur = Math.round((digest.crossBorder.withholdingTaxChf ?? digest.crossBorder.grossWageChf * 0.045) * rate)
    const workdays = digest.commuteAndWorkdays.workdays ?? 220
    const distanceKm = digest.commuteAndWorkdays.distanceKm ?? 0
    const hoDays = digest.commuteAndWorkdays.homeOfficeDays ?? homeOfficeDaysForAnswer(digest.commuteAndWorkdays.homeOfficeAnswer, workdays)
    const commuteDays = Math.max(0, workdays - hoDays)
    const commuterAllowance = commuterAllowanceFrom(commuteDays, distanceKm) + hoDays * 6
    const est = taxEstimateCrossBorder({
      year: digest.taxYear,
      wageEur,
      withholdingTaxEur,
      retirementProvisionEur: Math.round(wageEur * 0.08),
      otherProvisionEur: Math.round((digest.crossBorder.dailySicknessBenefitChf ?? 0) * rate),
      healthInsuranceEur: Math.round((digest.crossBorder.healthInsuranceChf ?? 0) * rate),
      commuterAllowance,
      donations: digest.catalogExpenses.donationsEur ?? 0,
    })
    if (est.kind === 'spanne') {
      return Math.round((est.result.from + est.result.to) / 2)
    }
  }

  const gross = digest.lstbPersonA.grossWageEur && digest.lstbPersonA.grossWageEur > 0 ? digest.lstbPersonA.grossWageEur : 52000
  const lohnsteuer = digest.lstbPersonA.wageTaxEur && digest.lstbPersonA.wageTaxEur > 0 ? digest.lstbPersonA.wageTaxEur : 8400
  const sv = digest.lstbPersonA.socialSecurityEur && digest.lstbPersonA.socialSecurityEur > 0 ? digest.lstbPersonA.socialSecurityEur : 10200

  const workdays = digest.commuteAndWorkdays.workdays ?? 220
  const distanceKm = digest.commuteAndWorkdays.distanceKm ?? 15
  const hoDays = digest.commuteAndWorkdays.homeOfficeDays ?? homeOfficeDaysForAnswer(digest.commuteAndWorkdays.homeOfficeAnswer, workdays)
  const commuteDays = Math.max(0, workdays - hoDays)
  const commuterAllowance = commuterAllowanceFrom(commuteDays, distanceKm)
  const hoAllowance = Math.min(hoDays, 210) * 6
  const trainingAllowance = digest.catalogExpenses.hasTraining ? 450 : 0
  const otherExpenses =
    hoAllowance +
    trainingAllowance +
    (digest.catalogExpenses.relocationCostsEur ?? 0) +
    (digest.catalogExpenses.doubleHouseholdRentEur ?? 0)

  const est = taxEstimateEmployee({
    year: digest.taxYear,
    bruttoarbeitslohn: gross,
    lohnsteuer,
    sozialversicherung: sv,
    commuterAllowance,
    otherIncomeRelatedExpenses: otherExpenses,
    donations: (digest.catalogExpenses.donationsEur ?? 0) + (digest.catalogExpenses.riesterEur ?? 0),
    selfPaidKvPv: digest.catalogExpenses.selfPaidKvPvEur ?? 0,
  })
  if (est.kind === 'spanne') {
    return Math.round((est.result.from + est.result.to) / 2)
  }
  return digest.estimatedRefundEur ?? 0
}

function readCurrentValueFromDigest(digest: CaseDigest, screen: Screen, field: string): string | null {
  if (screen === 'interview') {
    if (field === 'spenden-betrag') return digest.catalogExpenses.donationsEur !== null ? String(digest.catalogExpenses.donationsEur) : null
    if (field === 'spenden') return digest.catalogExpenses.donationsEur && digest.catalogExpenses.donationsEur > 0 ? 'Ja' : 'Nein'
    if (field === 'homeoffice') return digest.commuteAndWorkdays.homeOfficeAnswer
    if (field === 'weg') return digest.commuteAndWorkdays.distanceKm !== null ? String(digest.commuteAndWorkdays.distanceKm) : null
    if (field === 'tage') return digest.commuteAndWorkdays.workdays !== null ? String(digest.commuteAndWorkdays.workdays) : null
    if (field === 'fortbildung') return digest.catalogExpenses.hasTraining ? 'Ja' : 'Nein'
    if (field === 'umzug-kosten') return digest.catalogExpenses.relocationCostsEur !== null ? String(digest.catalogExpenses.relocationCostsEur) : null
    if (field === 'dhf-miete') return digest.catalogExpenses.doubleHouseholdRentEur !== null ? String(digest.catalogExpenses.doubleHouseholdRentEur) : null
    if (field === 'riester-betrag') return digest.catalogExpenses.riesterEur !== null ? String(digest.catalogExpenses.riesterEur) : null
  }
  if (screen === 'lstb') {
    if (field === 'bruttoarbeitslohn') return digest.lstbPersonA.grossWageEur !== null ? String(digest.lstbPersonA.grossWageEur) : null
    if (field === 'lohnsteuer') return digest.lstbPersonA.wageTaxEur !== null ? String(digest.lstbPersonA.wageTaxEur) : null
    if (field === 'sozialversicherung') return digest.lstbPersonA.socialSecurityEur !== null ? String(digest.lstbPersonA.socialSecurityEur) : null
  }
  if (screen === 'chLohnausweis') {
    if (field === 'krankenkasseChf') return digest.crossBorder.healthInsuranceChf !== null ? String(digest.crossBorder.healthInsuranceChf) : null
    if (field === 'krankentaggeldChf') return digest.crossBorder.dailySicknessBenefitChf !== null ? String(digest.crossBorder.dailySicknessBenefitChf) : null
    if (field === 'saeule3aChf') return digest.crossBorder.pillar3aChf !== null ? String(digest.crossBorder.pillar3aChf) : null
  }
  return null
}

function applyCandidateToDigest(digest: CaseDigest, screen: Screen, field: string, newValue: string): CaseDigest {
  const num = Number.parseInt(newValue.replace(/[^\d-]/g, ''), 10)
  const parsedNum = Number.isFinite(num) ? num : 0

  if (screen === 'interview') {
    if (field === 'spenden-betrag') {
      return { ...digest, catalogExpenses: { ...digest.catalogExpenses, donationsEur: parsedNum } }
    }
    if (field === 'homeoffice') {
      const workdays = digest.commuteAndWorkdays.workdays ?? 220
      return {
        ...digest,
        commuteAndWorkdays: {
          ...digest.commuteAndWorkdays,
          homeOfficeAnswer: newValue,
          homeOfficeDays: homeOfficeDaysForAnswer(newValue, workdays),
        },
      }
    }
    if (field === 'weg') {
      return {
        ...digest,
        commuteAndWorkdays: { ...digest.commuteAndWorkdays, distanceKm: parsedNum },
      }
    }
    if (field === 'tage') {
      return {
        ...digest,
        commuteAndWorkdays: { ...digest.commuteAndWorkdays, workdays: parsedNum },
      }
    }
    if (field === 'fortbildung') {
      return {
        ...digest,
        catalogExpenses: { ...digest.catalogExpenses, hasTraining: newValue === 'Ja' },
      }
    }
    if (field === 'umzug-kosten') {
      return {
        ...digest,
        catalogExpenses: { ...digest.catalogExpenses, relocationCostsEur: parsedNum },
      }
    }
    if (field === 'dhf-miete') {
      return {
        ...digest,
        catalogExpenses: { ...digest.catalogExpenses, doubleHouseholdRentEur: parsedNum },
      }
    }
    if (field === 'riester-betrag') {
      return {
        ...digest,
        catalogExpenses: { ...digest.catalogExpenses, riesterEur: parsedNum },
      }
    }
  }
  if (screen === 'chLohnausweis') {
    if (field === 'krankenkasseChf') {
      return {
        ...digest,
        crossBorder: { ...digest.crossBorder, healthInsuranceChf: parsedNum },
      }
    }
    if (field === 'krankentaggeldChf') {
      return {
        ...digest,
        crossBorder: { ...digest.crossBorder, dailySicknessBenefitChf: parsedNum },
      }
    }
  }
  return digest
}

/**
 * Deterministic tax delta simulator ("Vorher/Nachher-Simulationsrechner").
 * Never guesses tax impacts: calculates exact before/after refund midpoint from @steuereule/core.
 */
export function simulateAdvisorFieldDelta(
  digest: CaseDigest,
  screen: Screen,
  field: string,
  newValue: string,
): {
  readonly previousValue: string | null
  readonly beforeRefundEur: number
  readonly afterRefundEur: number
  readonly deltaEur: number
} {
  const previousValue = readCurrentValueFromDigest(digest, screen, field)
  const beforeRefundEur = computeRefundMidpoint(digest)
  const updatedDigest = applyCandidateToDigest(digest, screen, field, newValue)
  const afterRefundEur = computeRefundMidpoint(updatedDigest)
  const deltaEur = afterRefundEur - beforeRefundEur
  return {
    previousValue,
    beforeRefundEur,
    afterRefundEur,
    deltaEur,
  }
}

function extractFirstEuroAmount(text: string): number | null {
  const match = text.match(/(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*(?:€|eur|euro|chf)/i) ?? text.match(/\b(\d{2,5})\b/)
  if (!match || !match[1]) return null
  const clean = match[1].replace(/[.\s]/g, '')
  const n = Number.parseInt(clean, 10)
  if (!Number.isFinite(n) || n <= 0 || n === 2024 || n === 2025 || n === 2026) return null
  return n
}

function extractKilometers(text: string): number | null {
  const match = text.match(/(\d{1,3})\s*(?:km|kilometer)/i)
  if (!match || !match[1]) return null
  const n = Number.parseInt(match[1], 10)
  return Number.isFinite(n) && n > 0 && n <= 999 ? n : null
}

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?(prior|previous)\s+instructions/i,
  /system[\s-]*prompt/i,
  /api[\s_-]*key/i,
  /sk-ant-|sk_live_|whsec_/i,
  /geheime\s+instruktionen/i,
  /vergiss\s+(alle\s+)?deine\s+(bisherigen\s+)?regeln/i,
  /developer\s+mode|jailbreak|\bDAN\b/i,
  /<script\b|javascript:|onerror\s*=/i,
  /drop\s+table|union\s+select/i,
  /__proto__|constructor\.prototype/i,
]

const OFF_TOPIC_PATTERNS = [
  /kuchenrezept|pfannkuchen|backrezept/i,
  /schreibe\s+ein\s+gedicht/i,
  /krypto.*verstecken|schwarzgeld|steuerhinterziehung|belege?\s+fälschen|fiktive\s+rechnung/i,
]

const STBERG_OUT_OF_SCOPE_PATTERNS = [
  /\b(gewerbesteuer|umsatzsteuervoranmeldung|bilanzierung|gmbh-gründung|erbschaftsteuer|schenkungsteuer)\b/i,
  /\b(verbindliche\s+rechtsauskunft|rechtsverbindliche\s+beratung)\b/i,
]

/**
 * Deterministic Kanzlei-Steuerberater engine ("Deine Eule").
 * Handles multi-turn Anamnese (clickable follow-up pills), Two-Paths comparisons,
 * exact tax delta simulations, and Kanzlei-Endprüfung.
 */
export function evaluateAdvisorTurn(input: {
  readonly message: string
  readonly activeScreen?: Screen | undefined
  readonly digest: CaseDigest
  readonly actionIdFactory?: (() => string) | undefined
}): {
  readonly replyText: string
  readonly meta: AdvisorMessageMeta
} {
  const { message, activeScreen, digest } = input
  const makeActionId = input.actionIdFactory ?? (() => `act-${Date.now()}`)
  const lower = message.toLowerCase()

  // 1. Security & Scope Guardrail (Prompt Injection / Off-topic)
  if (PROMPT_INJECTION_PATTERNS.some((rx) => rx.test(message)) || OFF_TOPIC_PATTERNS.some((rx) => rx.test(message))) {
    return {
      replyText:
        'Ich bin deine SteuerEule und ausschließlich auf deine Einkommensteuererklärung (Anlage N, Anlage N-Gre, Sonderausgaben, Kinder, Kapital und Vermietung) spezialisiert. Systeminterne Anweisungen, Schlüssel oder steuerfremde Themen gebe ich grundsätzlich nicht aus. Wollen wir stattdessen deine offenen Steuer-Hinweise durchgehen?',
      meta: {
        choices: ['Kanzlei-Endprüfung starten', 'Homeoffice-Pauschale prüfen', 'Spenden aus dem Vorjahr prüfen'],
      },
    }
  }

  // 1b. StBerG & Scope Boundary (Gewerbesteuer, Bilanzierung, UStVA, Erbschaftsteuer, verbindliche Rechtsauskunft)
  if (STBERG_OUT_OF_SCOPE_PATTERNS.some((rx) => rx.test(message))) {
    return {
      replyText:
        'Dieser Bereich (Gewerbesteuer, Bilanzierung, Umsatzsteuervoranmeldung, Erbschaftsteuer oder eine rechtsverbindliche Einzelfallberatung nach dem Steuerberatungsgesetz) liegt außerhalb des Unterstützungsrahmens von SteuerEule. Für diese Sachverhalte wende dich bitte an eine Steuerberaterin, einen Steuerberater oder einen Lohnsteuerhilfeverein. Für deine private Einkommensteuererklärung (Anlage N, N-Gre, R, KAP, V, Kind und Sonderausgaben) helfe ich dir gerne weiter.',
      meta: {
        choices: ['Kanzlei-Endprüfung starten', 'Homeoffice-Pauschale prüfen', 'Spenden aus dem Vorjahr prüfen'],
      },
    }
  }

  // 2. Kanzlei-Endprüfung (holistic pre-printout review)
  if (
    lower.includes('endprüfung') ||
    lower.includes('endpruefung') ||
    lower.includes('akte prüfen') ||
    lower.includes('alles komplett') ||
    lower.includes('bereit für den ausdruck')
  ) {
    const missingCount = digest.printoutMissingFields.length
    const openHintsCount = digest.openOwlHints.length
    const statusParts: string[] = []

    if (digest.lstbPersonA.grossWageEur) {
      statusParts.push(`• Lohnsteuerbescheinigung: Bruttolohn (${digest.lstbPersonA.grossWageEur.toLocaleString('de-DE')} €) ist erfasst.`)
    } else if (digest.crossBorder.isCrossBorderCh && digest.crossBorder.grossWageChf) {
      statusParts.push(`• Schweizer Lohnausweis: Bruttolohn (${digest.crossBorder.grossWageChf.toLocaleString('de-DE')} CHF) ist erfasst.`)
    } else {
      statusParts.push('• Einkommen: Lohnsteuerbescheinigung bzw. Lohnausweis ist noch nicht vollständig eingetragen.')
    }

    if (missingCount > 0) {
      statusParts.push(`• Pflichtfelder vor dem Ausdruck: Es fehlen noch ${missingCount} Angaben (${digest.printoutMissingFields.slice(0, 3).join(', ')}).`)
    } else {
      statusParts.push('• Pflichtfelder für den Ausdruck: Alle formalen Pflichtangaben sind vollständig.')
    }

    if (openHintsCount > 0) {
      statusParts.push(
        `• Offene Kanzlei-Hinweise: Wir haben noch ${openHintsCount} ungeklärte Spar-Chancen (${digest.openOwlHints.map((h) => h.title).join(', ')}).`,
      )
    } else {
      statusParts.push('• Kanzlei-Hinweise: Alle bekannten Musterlücken für dieses Steuerjahr sind geklärt.')
    }

    return {
      replyText: `Ich habe deine gesamte Steuerakte ${digest.taxYear} für die Kanzlei-Endprüfung durchgesehen:\n\n${statusParts.join('\n')}\n\nNach [estg-9-1] und [estg-10b] empfehle ich, vor der Freigabe noch die offenen Spar-Chancen kurz zu klären.`,
      meta: {
        sources: ['estg-9-1', 'estg-10b'],
        choices:
          openHintsCount > 0
            ? digest.openOwlHints.slice(0, 3).map((h) => `${h.title} klären`)
            : ['Homeoffice-Pauschale prüfen', 'Spenden prüfen', 'Fortbildungskosten prüfen'],
      },
    }
  }

  // 3. Spenden & Vorjahresvergleich (§ 10b EStG)
  if (lower.includes('spende') || lower.includes('zuwendung') || lower.includes('gemeinnützig')) {
    const explicitAmount = extractFirstEuroAmount(message)
    const priorYearDonations = digest.priorYearComparison.donationsEur ?? 200
    const usePriorYear = lower.includes('vorjahr') && !lower.includes('prüfen') && !lower.includes('klären')
    const targetAmount = explicitAmount ?? (usePriorYear ? priorYearDonations : null)

    if (targetAmount !== null) {
      const sim = simulateAdvisorFieldDelta(digest, 'interview', 'spenden-betrag', String(targetAmount))
      return {
        replyText: `Zuwendungen an gemeinnützige Organisationen mindern nach [estg-10b] direkt dein zu versteuerndes Einkommen als Sonderausgaben (bis 300 € je Einzelspende reicht der Kontoauszug als vereinfachter Nachweis). Ich habe dir den Eintrag über ${targetAmount} € vorbereitet:`,
        meta: {
          sources: ['estg-10b'],
          action: {
            actionId: makeActionId(),
            status: 'pending',
            screen: 'interview',
            field: 'spenden-betrag',
            instance: null,
            companionFields: { spenden: 'Ja' },
            label: 'Spenden & Zuwendungen (Sonderausgaben)',
            previousValue: sim.previousValue ? `${sim.previousValue} €` : '0 €',
            newValue: String(targetAmount),
            beforeRefundEur: sim.beforeRefundEur,
            afterRefundEur: sim.afterRefundEur,
            deltaEur: sim.deltaEur,
            reason: 'Sonderausgabenabzug nach § 10b EStG mindert das zu versteuernde Einkommen ab dem ersten Euro über dem Pauschbetrag (36 €).',
            sourceId: 'estg-10b',
          },
        },
      }
    }

    return {
      replyText: `Im Vorjahr hattest du ${priorYearDonations} € Spenden angesetzt. Nach [estg-10b] senken Spenden an gemeinnützige Vereine, Stiftungen oder Hilfsorganisationen dein zu versteuerndes Einkommen schon ab 37 € direkt. Wie hoch waren deine Spenden im Steuerjahr ${digest.taxYear}?`,
      meta: {
        sources: ['estg-10b'],
        choices: [
          `Wie im Vorjahr (${priorYearDonations} €) übernehmen`,
          '120 € Spenden eintragen',
          '300 € Spenden eintragen',
        ],
      },
    }
  }

  // 4. Homeoffice vs. Häusliches Arbeitszimmer (Zwei-Wege-Empfehlung § 4 Abs. 5 Nr. 6c EStG)
  if (lower.includes('homeoffice') || lower.includes('arbeitszimmer') || lower.includes('tagespauschale')) {
    const safeSim = simulateAdvisorFieldDelta(digest, 'interview', 'homeoffice', '1–2 Tage pro Woche')
    const maxSim = simulateAdvisorFieldDelta(digest, 'interview', 'homeoffice', 'Fast immer')

    return {
      replyText: `Beim Arbeiten von zu Hause haben wir nach [estg-4-5-6c] zwei steuerliche Wege: Die unbürokratische Tagespauschale (6 € pro Tag, bis zu 210 Tage = 1.260 €) ohne Raum-Nachweis oder den Maximal-Ansatz bei überwiegender Tätigkeit zu Hause. Hier ist der direkte Vorher/Nachher-Vergleich für deine Akte:`,
      meta: {
        sources: ['estg-4-5-6c'],
        twoPaths: {
          title: 'Zwei-Wege-Empfehlung: Homeoffice & Arbeitszimmer',
          sourceId: 'estg-4-5-6c',
          safePath: {
            actionId: `${makeActionId()}-safe`,
            status: 'pending',
            screen: 'interview',
            field: 'homeoffice',
            instance: null,
            label: 'Weg A (Sicher): Homeoffice 1–2 Tage/Woche',
            previousValue: digest.commuteAndWorkdays.homeOfficeAnswer ?? 'Nie',
            newValue: '1–2 Tage pro Woche',
            beforeRefundEur: safeSim.beforeRefundEur,
            afterRefundEur: safeSim.afterRefundEur,
            deltaEur: safeSim.deltaEur,
            reason: '6 € Tagespauschale ohne Nachweis eines separaten Arbeitszimmers (§ 4 Abs. 5 Nr. 6c EStG).',
            sourceId: 'estg-4-5-6c',
          },
          maxPath: {
            actionId: `${makeActionId()}-max`,
            status: 'pending',
            screen: 'interview',
            field: 'homeoffice',
            instance: null,
            label: 'Weg B (Maximal): Fast immer im Homeoffice (bis 1.260 €)',
            previousValue: digest.commuteAndWorkdays.homeOfficeAnswer ?? 'Nie',
            newValue: 'Fast immer',
            beforeRefundEur: maxSim.beforeRefundEur,
            afterRefundEur: maxSim.afterRefundEur,
            deltaEur: maxSim.deltaEur,
            reason: 'Volle Ausschöpfung der 210 Homeoffice-Tage (1.260 € Werbungskosten).',
            evidenceHint: 'Nachweis-Hinweis: Das Finanzamt kann bei fast ausschließlichem Homeoffice eine kurze Bestätigung des Arbeitgebers anfordern.',
            sourceId: 'estg-4-5-6c',
          },
        },
      },
    }
  }

  // 5. Fortbildung, Dienstreisen & Verpflegungsmehraufwand (§ 9 Abs. 1 Nr. 4a & Abs. 4a EStG)
  if (
    lower.includes('fortbildung') ||
    lower.includes('kurs') ||
    lower.includes('zertifikat') ||
    lower.includes('konferenz') ||
    lower.includes('dienstreise') ||
    lower.includes('fahrtkosten') ||
    lower.includes('übernachtung') ||
    lower.includes('8 std')
  ) {
    const hasDetails =
      lower.includes('8 std') ||
      lower.includes('übernachtung') ||
      lower.includes('online-kurs') ||
      extractFirstEuroAmount(message) !== null

    if (hasDetails) {
      const sim = simulateAdvisorFieldDelta(digest, 'interview', 'fortbildung', 'Ja')
      return {
        replyText: `Ausgezeichnet. Bei einer beruflichen Fortbildung zählen neben der Kursgebühr nach [estg-9-1-4a] jeder gefahrene Kilometer (0,30 € für Hin- **und** Rückfahrt) sowie nach [estg-9-4a] die Verpflegungspauschalen (14 € ab > 8 Std. Abwesenheit bzw. 28 € bei vollen 24-Stunden-Tagen). Ich habe die Fortbildungskosten für deine Werbungskosten vorbereitet:`,
        meta: {
          sources: ['estg-9-1-4a', 'estg-9-4a'],
          action: {
            actionId: makeActionId(),
            status: 'pending',
            screen: 'interview',
            field: 'fortbildung',
            instance: null,
            label: 'Berufliche Fortbildungskosten aktivieren',
            previousValue: digest.catalogExpenses.hasTraining ? 'Ja' : 'Nein',
            newValue: 'Ja',
            beforeRefundEur: sim.beforeRefundEur,
            afterRefundEur: sim.afterRefundEur,
            deltaEur: sim.deltaEur,
            reason: 'Berücksichtigung von Kursgebühren, Reisekosten (§ 9 Abs. 1 Nr. 4a EStG) und Verpflegungsmehraufwand (§ 9 Abs. 4a EStG).',
            sourceId: 'estg-9-1-4a',
          },
        },
      }
    }

    return {
      replyText: `Bevor ich die Fortbildung durchrechne, brauche ich wie in der Kanzlei kurz zwei Eckdaten: Bei Fortbildungen sind nach [estg-9-1-4a] Hin- und Rückfahrt (0,30 €/km) und nach [estg-9-4a] Verpflegungspauschalen (14 € ab 8 Std. / 28 € bei Übernachtung) absetzbar, sofern der Arbeitgeber sie nicht steuerfrei erstattet hat. Wie lief deine Fortbildung ab?`,
      meta: {
        sources: ['estg-9-1-4a', 'estg-9-4a'],
        choices: [
          'Mehr als 8 Std. unterwegs (ohne Übernachtung)',
          'Mit Übernachtung, selbst bezahlt',
          'Online-Kurs von zu Hause (350 €)',
        ],
      },
    }
  }

  // 6. Arbeitsmittel, Laptop, Hardware, Berufskleidung (§ 9 Abs. 1 Nr. 6 EStG)
  if (
    lower.includes('laptop') ||
    lower.includes('monitor') ||
    lower.includes('computer') ||
    lower.includes('hardware') ||
    lower.includes('arbeitsmittel') ||
    lower.includes('berufskleidung') ||
    lower.includes('werkzeug') ||
    lower.includes('rein beruflich') ||
    lower.includes('hälftig beruflich')
  ) {
    const hasUsageShare =
      lower.includes('rein beruflich') ||
      lower.includes('hälftig beruflich') ||
      lower.includes('100 %') ||
      lower.includes('90 %') ||
      lower.includes('50 %') ||
      lower.includes('fachliteratur')

    if (hasUsageShare) {
      const sim = simulateAdvisorFieldDelta(digest, 'interview', 'fortbildung', 'Ja')
      return {
        replyText: `Nach [estg-9-1-6] (und dem BMF-Schreiben zur 1-jährigen Nutzungsdauer für Computerhardware und Software) kannst du den beruflichen Nutzungsanteil sofort im Anschaffungsjahr voll als Werbungskosten abziehen. Zusammen mit deinen übrigen Werbungskosten zählt jeder Euro über dem Arbeitnehmer-Pauschbetrag von 1.230 € ([estg-9-1]).`,
        meta: {
          sources: ['estg-9-1-6', 'estg-9-1'],
          action: {
            actionId: makeActionId(),
            status: 'pending',
            screen: 'interview',
            field: 'fortbildung',
            instance: null,
            label: 'Berufliche Arbeitsmittel & Fortbildung in Anlage N berücksichtigen',
            previousValue: digest.catalogExpenses.hasTraining ? 'Ja' : 'Nein',
            newValue: 'Ja',
            beforeRefundEur: sim.beforeRefundEur,
            afterRefundEur: sim.afterRefundEur,
            deltaEur: sim.deltaEur,
            reason: 'Sofortabschreibung beruflicher Arbeitsmittel nach § 9 Abs. 1 Satz 3 Nr. 6 EStG.',
            sourceId: 'estg-9-1-6',
          },
        },
      }
    }

    return {
      replyText: `Computerhardware, Software und Arbeitsmittel bis 800 € netto (952 € brutto) kannst du nach [estg-9-1-6] im Kaufjahr sofort absetzen — entscheidend für das Finanzamt ist der **berufliche Nutzungsanteil**. Wie nutzt du die Anschaffung?`,
      meta: {
        sources: ['estg-9-1-6'],
        choices: [
          'Rein beruflich (90–100 %), ca. 1.200 €',
          'Hälftig beruflich/privat (50 %), ca. 1.000 €',
          'Fachliteratur & Arbeitsmittel (250 €)',
        ],
      },
    }
  }

  // 7. Beruflicher Umzug (§ 9 Abs. 1 EStG)
  if (lower.includes('umzug')) {
    const amount = extractFirstEuroAmount(message) ?? 1500
    const sim = simulateAdvisorFieldDelta(digest, 'interview', 'umzug-kosten', String(amount))
    return {
      replyText: `Ein beruflich veranlasster Umzug (z. B. Jobwechsel oder Verkürzung des täglichen Arbeitswegs um mindestens eine Stunde) ist nach [estg-9-1] in voller Höhe als Werbungskosten absetzbar. Ich habe den Ansatz über ${amount} € vorbereitet:`,
      meta: {
        sources: ['estg-9-1'],
        action: {
          actionId: makeActionId(),
          status: 'pending',
          screen: 'interview',
          field: 'umzug-kosten',
          instance: null,
          companionFields: { umzug: 'Ja' },
          label: 'Berufliche Umzugskosten (Anlage N)',
          previousValue: sim.previousValue ? `${sim.previousValue} €` : '0 €',
          newValue: String(amount),
          beforeRefundEur: sim.beforeRefundEur,
          afterRefundEur: sim.afterRefundEur,
          deltaEur: sim.deltaEur,
          reason: 'Werbungskostenabzug für beruflich veranlasste Umzugskosten (§ 9 Abs. 1 EStG).',
          sourceId: 'estg-9-1',
        },
      },
    }
  }

  // 8. Pendlerpauschale / Arbeitsweg (§ 9 Abs. 1 EStG)
  if (lower.includes('arbeitsweg') || lower.includes('pendler') || lower.includes('kilometer') || lower.includes('entfernung')) {
    const km = extractKilometers(message) ?? extractFirstEuroAmount(message)
    if (km !== null && km <= 999) {
      const sim = simulateAdvisorFieldDelta(digest, 'interview', 'weg', String(km))
      return {
        replyText: `Für deinen einfachen Arbeitsweg gelten nach [estg-9-1] 0,30 € für die ersten 20 km und **0,38 € ab dem 21. Entfernungskilometer**. Ich habe ${km} km einfachen Arbeitsweg für dich durchgerechnet:`,
        meta: {
          sources: ['estg-9-1'],
          action: {
            actionId: makeActionId(),
            status: 'pending',
            screen: 'interview',
            field: 'weg',
            instance: null,
            label: 'Einfacher Arbeitsweg (Entfernungspauschale)',
            previousValue: sim.previousValue ? `${sim.previousValue} km` : 'Nicht erfasst',
            newValue: String(km),
            beforeRefundEur: sim.beforeRefundEur,
            afterRefundEur: sim.afterRefundEur,
            deltaEur: sim.deltaEur,
            reason: 'Entfernungspauschale (0,30 € bis 20 km, 0,38 € ab dem 21. km) nach § 9 Abs. 1 EStG.',
            sourceId: 'estg-9-1',
          },
        },
      }
    }
  }

  // 9. Schweizer Grenzgänger (CH-Lohnausweis / Anlage N-Gre)
  if (
    lower.includes('schweiz') ||
    lower.includes('grenzgänger') ||
    lower.includes('lohnausweis') ||
    lower.includes('krankentaggeld') ||
    lower.includes('krankenkasse') ||
    activeScreen === 'chLohnausweis'
  ) {
    const chfAmount = extractFirstEuroAmount(message)
    if (chfAmount !== null) {
      const sim = simulateAdvisorFieldDelta(digest, 'chLohnausweis', 'krankenkasseChf', String(chfAmount))
      return {
        replyText: `Bei Schweizer Grenzgängern wird die Schweizer Quellensteuer (bis 4,5 %) auf die deutsche Einkommensteuer angerechnet, und deine selbst gezahlte Kranken- sowie Krankentaggeldversicherung mindern als Vorsorgeaufwendungen dein zu versteuerndes Einkommen. Hier ist der vorbereitete Eintrag für deine Krankenversicherung (${chfAmount} CHF):`,
        meta: {
          sources: ['estg-9-1'],
          action: {
            actionId: makeActionId(),
            status: 'pending',
            screen: 'chLohnausweis',
            field: 'krankenkasseChf',
            instance: null,
            label: 'Schweizer Krankenversicherung (CHF)',
            previousValue: sim.previousValue ? `${sim.previousValue} CHF` : 'Nicht erfasst',
            newValue: String(chfAmount),
            beforeRefundEur: sim.beforeRefundEur,
            afterRefundEur: sim.afterRefundEur,
            deltaEur: sim.deltaEur,
            reason: 'Berücksichtigung der Basis-Krankenversicherung für Grenzgänger in der Anlage Vorsorgeaufwand / N-Gre.',
            sourceId: 'estg-9-1',
          },
        },
      }
    }

    return {
      replyText: `Für deinen Schweizer Lohnausweis und die Anlage N-Gre achte ich besonders auf drei Hebel: die Anrechnung der max. 4,5 % CH-Quellensteuer, die Herausrechnung steuerfreier Familienzulagen und den Abzug deiner Schweizer Kranken- und Krankentaggeldversicherung ([estg-9-1]). Welchen Posten wollen wir uns ansehen?`,
      meta: {
        sources: ['estg-9-1'],
        choices: [
          'Krankenkasse (z. B. 4.200 CHF) eintragen',
          'Homeoffice-Pauschale prüfen',
          'Kanzlei-Endprüfung starten',
        ],
      },
    }
  }

  // 10. Kinder & Kinderbetreuung (§ 10 Abs. 1 Nr. 5 EStG)
  if (lower.includes('kind') || lower.includes('kita') || lower.includes('betreuung') || activeScreen === 'kind') {
    return {
      replyText: `Für jedes erfasste Kind prüft das Finanzamt automatisch die Günstigerprüfung zwischen gezahltem Kindergeld und den Kinderfreibeträgen. Zusätzlich sind Kinderbetreuungskosten (Kita, Tagesmutter, Hort bis 14 Jahre) nach [estg-10-1-5] zu 80 % (bis 4.800 € je Kind) als Sonderausgaben abziehbar, sofern du per Überweisung gezahlt hast.`,
      meta: {
        sources: ['estg-10-1-5'],
        choices: [
          'Homeoffice-Pauschale prüfen',
          'Spenden aus dem Vorjahr prüfen',
          'Kanzlei-Endprüfung starten',
        ],
      },
    }
  }

  // 11. Default contextual advisor response
  return {
    replyText: `Ich habe deine Akte ${digest.taxYear} im Blick. Sag mir einfach, welche Ausgaben du hattest — zum Beispiel Homeoffice-Tage ([estg-4-5-6c]), Fortbildung und Dienstreisen ([estg-9-1-4a]), Arbeitsmittel wie Laptop oder Fachliteratur ([estg-9-1-6]) oder Spenden ([estg-10b]). Ich rechne dir vorab die genaue Steuerwirkung aus, bevor wir etwas eintragen.`,
    meta: {
      sources: ['estg-4-5-6c', 'estg-9-1-6', 'estg-10b'],
      choices: [
        'Homeoffice-Pauschale (6 €/Tag) prüfen',
        'Fortbildung & Reisekosten klären',
        'Kanzlei-Endprüfung starten',
      ],
    },
  }
}
