/**
 * Freiberuf (§ 18 EStG, Anlage S) or Gewerbe (§ 15 EStG, Anlage G). The app only suggests: the
 * user confirms, and a prior assessment of the tax office wins because the office will keep to it
 * until the facts change (ADR-0101 decision 2).
 */

/** § 18 Abs. 1 Nr. 1 Satz 2 EStG, the Katalogberufe as the act lists them. */
export const CATALOG_PROFESSIONS = [
  'arzt',
  'zahnarzt',
  'tierarzt',
  'rechtsanwalt',
  'notar',
  'patentanwalt',
  'vermessungsingenieur',
  'ingenieur',
  'architekt',
  'handelschemiker',
  'wirtschaftspruefer',
  'steuerberater',
  'beratender_volks_betriebswirt',
  'vereidigter_buchpruefer',
  'steuerbevollmaechtigter',
  'heilpraktiker',
  'dentist',
  'krankengymnast',
  'journalist',
  'bildberichterstatter',
  'dolmetscher',
  'uebersetzer',
  'lotse',
] as const

export type CatalogProfession = (typeof CATALOG_PROFESSIONS)[number]

/** § 18 Abs. 1 Nr. 1 Satz 2 EStG, first half: the activities that are free by their nature. */
export const FREE_ACTIVITIES = ['wissenschaftlich', 'kuenstlerisch', 'schriftstellerisch', 'unterrichtend', 'erzieherisch'] as const

export type FreeActivity = (typeof FREE_ACTIVITIES)[number]

export type ProfessionKind = 'freiberuf' | 'gewerbe'

export interface ProfessionAnswers {
  /** What the last income tax assessment said (Anlage S or G); null when there is none. */
  readonly priorAssessment?: ProfessionKind | null | undefined
  readonly catalogProfession?: CatalogProfession | null | undefined
  /** The user says the work is comparable to a Katalogberuf in training and in what is done. */
  readonly similarToCatalogProfession?: boolean | undefined
  readonly freeActivity?: FreeActivity | null | undefined
  /** The work rests on the person's own expert knowledge, not on running a business. */
  readonly ownExpertWork: boolean
  readonly employsQualifiedStaff: boolean
  /** Leads the staff personally and answers for each job (leitend und eigenverantwortlich). */
  readonly leadsPersonally: boolean
  /** Buys and sells goods, or runs a shop or commerce beside the profession. */
  readonly tradesGoods: boolean
}

export interface ProfessionSuggestion {
  readonly suggestion: ProfessionKind | 'unklar'
  /** Short German reasons the app shows next to the suggestion. */
  readonly reasons: readonly string[]
  /** The rules the suggestion rests on. */
  readonly basis: readonly string[]
}

export const PROFESSION_LABELS: Readonly<Record<CatalogProfession, string>> = {
  arzt: 'Ärztin/Arzt',
  zahnarzt: 'Zahnärztin/Zahnarzt',
  tierarzt: 'Tierärztin/Tierarzt',
  rechtsanwalt: 'Rechtsanwältin/Rechtsanwalt',
  notar: 'Notarin/Notar',
  patentanwalt: 'Patentanwältin/Patentanwalt',
  vermessungsingenieur: 'Vermessungsingenieurin/-ingenieur',
  ingenieur: 'Ingenieurin/Ingenieur',
  architekt: 'Architektin/Architekt',
  handelschemiker: 'Handelschemikerin/Handelschemiker',
  wirtschaftspruefer: 'Wirtschaftsprüferin/Wirtschaftsprüfer',
  steuerberater: 'Steuerberaterin/Steuerberater',
  beratender_volks_betriebswirt: 'Beratende Volks- oder Betriebswirtin/-wirt',
  vereidigter_buchpruefer: 'Vereidigte Buchprüferin/Buchprüfer',
  steuerbevollmaechtigter: 'Steuerbevollmächtigte/r',
  heilpraktiker: 'Heilpraktikerin/Heilpraktiker',
  dentist: 'Dentistin/Dentist',
  krankengymnast: 'Krankengymnastin/Krankengymnast',
  journalist: 'Journalistin/Journalist',
  bildberichterstatter: 'Bildberichterstatterin/-erstatter',
  dolmetscher: 'Dolmetscherin/Dolmetscher',
  uebersetzer: 'Übersetzerin/Übersetzer',
  lotse: 'Lotsin/Lotse',
}

export const FREE_ACTIVITY_LABELS: Readonly<Record<FreeActivity, string>> = {
  wissenschaftlich: 'wissenschaftliche',
  kuenstlerisch: 'künstlerische',
  schriftstellerisch: 'schriftstellerische',
  unterrichtend: 'unterrichtende',
  erzieherisch: 'erzieherische',
}

export function suggestProfessionKind(answers: ProfessionAnswers): ProfessionSuggestion {
  if (answers.priorAssessment) {
    return {
      suggestion: answers.priorAssessment,
      reasons: [
        answers.priorAssessment === 'freiberuf'
          ? 'Das Finanzamt hat Ihre Einkünfte bisher als freiberuflich (Anlage S) festgesetzt.'
          : 'Das Finanzamt hat Ihre Einkünfte bisher als gewerblich (Anlage G) festgesetzt.',
        'Solange sich Ihre Tätigkeit nicht ändert, bleibt es dabei.',
      ],
      basis: ['letzter Einkommensteuerbescheid'],
    }
  }

  const freeGround = answers.catalogProfession
    ? `Ihr Beruf (${PROFESSION_LABELS[answers.catalogProfession]}) steht im Katalog des § 18 EStG.`
    : answers.freeActivity
      ? `Eine ${FREE_ACTIVITY_LABELS[answers.freeActivity]} Tätigkeit ist nach § 18 EStG freiberuflich.`
      : null

  if (answers.tradesGoods) {
    if (freeGround || answers.similarToCatalogProfession) {
      return {
        suggestion: 'unklar',
        reasons: [
          freeGround ?? 'Ihr Beruf ähnelt einem Katalogberuf.',
          'Der Handel mit Waren ist aber gewerblich.',
          'Meist sind das zwei Betriebe: der freie Beruf in Anlage S, der Handel in Anlage G.',
        ],
        basis: ['§ 15 Abs. 2 EStG', '§ 18 Abs. 1 Nr. 1 EStG'],
      }
    }
    return {
      suggestion: 'gewerbe',
      reasons: ['Wer Waren kauft und verkauft, betreibt ein Gewerbe.'],
      basis: ['§ 15 Abs. 2 EStG'],
    }
  }

  if (!freeGround && !answers.similarToCatalogProfession) {
    return {
      suggestion: 'gewerbe',
      reasons: ['Ihre Tätigkeit gehört weder zu den Katalogberufen noch zu den freien Tätigkeiten des § 18 EStG.', 'Eine selbstständige Tätigkeit ohne diese Merkmale ist ein Gewerbe.'],
      basis: ['§ 15 Abs. 2 EStG', '§ 18 Abs. 1 Nr. 1 EStG'],
    }
  }

  if (!answers.ownExpertWork) {
    return {
      suggestion: 'gewerbe',
      reasons: [freeGround ?? 'Ihr Beruf ähnelt einem Katalogberuf.', 'Die Arbeit ruht aber nicht auf Ihrer eigenen Fachkenntnis; das spricht für ein Gewerbe.'],
      basis: ['§ 18 Abs. 1 Nr. 1 Satz 3 EStG', '§ 15 Abs. 2 EStG'],
    }
  }

  // The Vervielfältigungstheorie: staff may help, but each job must still bear the owner's own stamp.
  if (answers.employsQualifiedStaff && !answers.leadsPersonally) {
    return {
      suggestion: 'gewerbe',
      reasons: [
        freeGround ?? 'Ihr Beruf ähnelt einem Katalogberuf.',
        'Mit fachlich vorgebildeten Mitarbeitern bleibt der Beruf nur frei, wenn Sie selbst leitend und eigenverantwortlich tätig sind.',
      ],
      basis: ['§ 18 Abs. 1 Nr. 1 Satz 3 EStG'],
    }
  }

  const staffReason = answers.employsQualifiedStaff ? ['Ihre Mitarbeiter ändern daran nichts, weil Sie selbst leiten und verantworten.'] : []

  if (!freeGround) {
    // Courts read „ähnlicher Beruf“ narrowly: comparable training and comparable work (H 15.6 EStH).
    return {
      suggestion: 'unklar',
      reasons: [
        'Ein ähnlicher Beruf zählt nur, wenn Ausbildung und Tätigkeit einem Katalogberuf wirklich gleichen.',
        'Das prüft das Finanzamt streng; im Zweifel lohnt eine Rückfrage beim Finanzamt.',
        ...staffReason,
      ],
      basis: ['§ 18 Abs. 1 Nr. 1 Satz 2 EStG', 'H 15.6 EStH'],
    }
  }

  return {
    suggestion: 'freiberuf',
    reasons: [freeGround, ...staffReason],
    basis: ['§ 18 Abs. 1 Nr. 1 EStG'],
  }
}
