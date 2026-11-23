// Sections of employment income: Anlage N (Werbungskosten included) and Anlage N-Gre (Grenzgänger Schweiz).
import { amountFromAnswer, formatEuro, type Answers } from '@steuereule/core'
import type { ChSalaryCertificateResponseDto, CommuteResponseDto, LstbResponseDto } from '@steuereule/api-client'
import { anlageNWorkRows, copyOf, nGreRows as nGreRowsOf } from './liveFormRows'
import { liveRowContextOf, type GlassFormRow, type GlassFormSection, type GlassLiveValues, type GlassRowContext } from './glassFormTypes'

/** Every way behind the year's allowance: after a change of job the first one alone would mislead („0 km“). */
export const waysKm = (inputs: { oneWayKm?: number | null; secondOneWayKm?: number | null }): string =>
  [inputs.oneWayKm, inputs.secondOneWayKm].filter((km): km is number => km != null).map((km) => `${km} km`).join(' + ')

/** 2. Anlage N (Angestellte & Werbungskosten) */
export function anlageNSection(
  data: {
    readonly lstb: LstbResponseDto | null
    readonly lstbB: LstbResponseDto | null
    readonly commute: CommuteResponseDto | null
    readonly commuteB: CommuteResponseDto | null
    readonly answers: Answers
  },
  live: GlassLiveValues,
  ctx: GlassRowContext,
): GlassFormSection | null {
  const { lstb, lstbB, commute, commuteB, answers } = data
  const { isJoint, partnerName, prov } = ctx
  const persons: readonly ('A' | 'B')[] = isJoint ? ['A', 'B'] : ['A']
  const anlageNRows: GlassFormRow[] = []

  if (lstb?.bruttoarbeitslohn.kind === 'erfasst' && lstb.bruttoarbeitslohn.value !== undefined) {
    anlageNRows.push({
      id: 'anlageN-brutto-a',
      line: 'Zeile 6 (Kz 110)',
      label: 'Bruttoarbeitslohn (laut LStB Zeile 3)',
      value: formatEuro(lstb.bruttoarbeitslohn.value),
      person: 'A',
      provenanceLabel: prov('lstb', 'bruttoarbeitslohn'),
      screen: 'lstb',
      field: 'bruttoarbeitslohn',
    })
  }
  if (lstb?.lohnsteuer.kind === 'erfasst' && lstb.lohnsteuer.value !== undefined) {
    anlageNRows.push({
      id: 'anlageN-lst-a',
      line: 'Zeile 7 (Kz 140)',
      label: 'Einbehaltene Lohnsteuer (laut LStB Zeile 4)',
      value: formatEuro(lstb.lohnsteuer.value),
      person: 'A',
      provenanceLabel: prov('lstb', 'lohnsteuer'),
      screen: 'lstb',
      field: 'lohnsteuer',
    })
  }
  if (isJoint && lstbB?.bruttoarbeitslohn.kind === 'erfasst' && lstbB.bruttoarbeitslohn.value !== undefined) {
    anlageNRows.push({
      id: 'anlageN-brutto-b',
      line: 'Zeile 6 (Person B)',
      label: `Bruttoarbeitslohn (${partnerName})`,
      value: formatEuro(lstbB.bruttoarbeitslohn.value),
      person: 'B',
      provenanceLabel: prov('lstb', 'bruttoarbeitslohn'),
      screen: 'lstb',
      field: 'bruttoarbeitslohn',
    })
  }
  if (isJoint && lstbB?.lohnsteuer.kind === 'erfasst' && lstbB.lohnsteuer.value !== undefined) {
    anlageNRows.push({
      id: 'anlageN-lst-b',
      line: 'Zeile 7 (Person B)',
      label: `Einbehaltene Lohnsteuer (${partnerName})`,
      value: formatEuro(lstbB.lohnsteuer.value),
      person: 'B',
      provenanceLabel: prov('lstb', 'lohnsteuer'),
      screen: 'lstb',
      field: 'lohnsteuer',
    })
  }
  // The ways and the further Werbungskosten stand on the form the printout puts them on (Anlage N or
  // N-Gre); only without printed values are they named from the commute mask, under Anlage N.
  const commuteFromMask = live.settled && !live.hasLive
  if (live.hasLive) {
    for (const person of persons) {
      const copy = copyOf(live.forms, 'anlage-n', person)
      if (copy) anlageNRows.push(...anlageNWorkRows(copy, liveRowContextOf(ctx, person)))
    }
  }
  if (commuteFromMask && commute?.inputs && commute.commuterAllowance != null && commute.commuterAllowance > 0) {
    anlageNRows.push({
      id: 'anlageN-weg-a',
      line: 'Zeilen 31–39',
      label: `Entfernungspauschale (${waysKm(commute.inputs)} · ${commute.workdays?.commuteDays ?? 0} Tage)`,
      value: formatEuro(commute.commuterAllowance),
      person: 'A',
      provenanceLabel: prov('commute', 'oneWayKm'),
      screen: 'commute',
      field: 'oneWayKm',
    })
  }
  if (commute?.inputs && commute.inputs.homeOfficeDays > 0) {
    const hoDays = Math.min(commute.inputs.homeOfficeDays, 210)
    anlageNRows.push({
      id: 'anlageN-ho-a',
      line: 'Zeile 45 (Kz 335)',
      label: `Homeoffice-Pauschale (${commute.inputs.homeOfficeDays} Tage)`,
      value: formatEuro(hoDays * 6),
      person: 'A',
      provenanceLabel: prov('commute', 'homeOfficeDays'),
      screen: 'commute',
      field: 'homeOfficeDays',
    })
  }
  if (commuteFromMask && commute?.inputs?.workEquipmentEur && commute.inputs.workEquipmentEur > 0) {
    anlageNRows.push({
      id: 'anlageN-arbeitsmittel-a',
      line: 'Zeilen 42–43',
      label: 'Aufwendungen für Arbeitsmittel',
      value: formatEuro(commute.inputs.workEquipmentEur),
      person: 'A',
      provenanceLabel: prov('commute', 'workEquipmentEur'),
      screen: 'commute',
      field: 'workEquipmentEur',
    })
  }
  if (commuteFromMask && isJoint && commuteB?.inputs && commuteB.commuterAllowance != null && commuteB.commuterAllowance > 0) {
    anlageNRows.push({
      id: 'anlageN-weg-b',
      line: 'Zeilen 31–39 (Person B)',
      label: `Entfernungspauschale (${partnerName}, ${waysKm(commuteB.inputs)})`,
      value: formatEuro(commuteB.commuterAllowance),
      person: 'B',
      provenanceLabel: prov('commute', 'oneWayKm'),
      screen: 'commute',
      field: 'oneWayKm',
    })
  }
  const fortbildung = amountFromAnswer(answers['fortbildung-kosten'])
  if (!live.hasLive && fortbildung !== null && fortbildung > 0) {
    anlageNRows.push({
      id: 'anlageN-fortbildung',
      line: 'Zeile 46',
      label: 'Berufliche Fortbildungskosten',
      value: formatEuro(fortbildung),
      person: 'A',
      provenanceLabel: prov('interview', 'fortbildung-kosten'),
      screen: 'interview',
      field: 'fortbildung-kosten',
    })
  }
  const umzug = amountFromAnswer(answers['umzug-kosten'])
  if (!live.hasLive && umzug !== null && umzug > 0) {
    anlageNRows.push({
      id: 'anlageN-umzug',
      line: 'Zeile 48',
      label: 'Beruflich veranlasste Umzugskosten',
      value: formatEuro(umzug),
      person: 'A',
      provenanceLabel: prov('interview', 'umzug-kosten'),
      screen: 'interview',
      field: 'umzug-kosten',
    })
  }
  const dhfMiete = amountFromAnswer(answers['dhf-miete'])
  if (dhfMiete !== null && dhfMiete > 0) {
    anlageNRows.push({
      id: 'anlageN-dhf',
      line: 'Anlage N-DHF',
      label: 'Doppelte Haushaltsführung (Monatsmiete am Arbeitsort)',
      value: `${formatEuro(dhfMiete)} / Monat`,
      person: 'A',
      provenanceLabel: prov('interview', 'dhf-miete'),
      screen: 'interview',
      field: 'dhf-miete',
    })
  }
  if (anlageNRows.length === 0) return null
  return {
    formId: 'anlageN',
    title: 'Anlage N',
    subtitle: 'Einkünfte aus nichtselbständiger Arbeit & Werbungskosten',
    rows: anlageNRows,
  }
}

/** 3. Anlage N-Gre (Grenzgänger Schweiz) */
export function nGreSection(
  ch: ChSalaryCertificateResponseDto | null,
  chB: ChSalaryCertificateResponseDto | null,
  live: GlassLiveValues,
  ctx: GlassRowContext,
): GlassFormSection | null {
  const { isJoint, partnerName, prov } = ctx
  const nGreRows: GlassFormRow[] = []
  // The printed Anlage N-Gre of each person; while the printout has none for a person (the Lohnausweis is
  // incomplete, or there are no printed values at all), the figures recorded from the Lohnausweis stand in.
  const nGreCopyA = copyOf(live.forms, 'anlage-n-gre', 'A')
  const nGreCopyB = isJoint ? copyOf(live.forms, 'anlage-n-gre', 'B') : null
  if (nGreCopyA) nGreRows.push(...nGreRowsOf(nGreCopyA, liveRowContextOf(ctx, 'A')))
  if (nGreCopyB) nGreRows.push(...nGreRowsOf(nGreCopyB, liveRowContextOf(ctx, 'B')))
  const chGrossA = nGreCopyA ? undefined : ch?.fields.find((f) => f.id === 'bruttolohn-total')
  const chQstA = nGreCopyA ? undefined : ch?.fields.find((f) => f.id === 'quellensteuer')
  const chAhvA = nGreCopyA ? undefined : ch?.fields.find((f) => f.id === 'ahv-beitraege')

  if (chGrossA?.kind === 'erfasst' && chGrossA.value !== undefined) {
    nGreRows.push({
      id: 'ngre-brutto-a',
      line: 'Zeile 6',
      label: `Schweizer Bruttolohn (Lohnausweis Ziff. 8${ch?.exchangeRate ? ` · Kurs ${ch.exchangeRate.rate}` : ''})`,
      value: `${chGrossA.value.toLocaleString('de-DE')} CHF`,
      person: 'A',
      provenanceLabel: prov('chLohnausweis', 'grossWageChf'),
      screen: 'chLohnausweis',
      field: 'grossWageChf',
    })
  }
  if (chQstA?.kind === 'erfasst' && chQstA.value !== undefined) {
    nGreRows.push({
      id: 'ngre-qst-a',
      line: 'Zeile 24 (Kz 169)',
      label: 'Schweizer Quellensteuer (Anrechnung bis 4,5 %)',
      value: `${chQstA.value.toLocaleString('de-DE')} CHF`,
      person: 'A',
      provenanceLabel: prov('chLohnausweis', 'withholdingTaxChf'),
      screen: 'chLohnausweis',
      field: 'withholdingTaxChf',
    })
  }
  if (chAhvA?.kind === 'erfasst' && chAhvA.value !== undefined) {
    nGreRows.push({
      id: 'ngre-ahv-a',
      line: 'Zeilen 81–93',
      label: 'AHV / IV / EO / ALV Beiträge (Lohnausweis Ziff. 9)',
      value: `${chAhvA.value.toLocaleString('de-DE')} CHF`,
      person: 'A',
      provenanceLabel: prov('chLohnausweis', 'ahvContributionsChf'),
      screen: 'chLohnausweis',
      field: 'ahvContributionsChf',
    })
  }
  if (isJoint && chB && !nGreCopyB) {
    const chGrossB = chB.fields.find((f) => f.id === 'bruttolohn-total')
    const chQstB = chB.fields.find((f) => f.id === 'quellensteuer')
    if (chGrossB?.kind === 'erfasst' && chGrossB.value !== undefined) {
      nGreRows.push({
        id: 'ngre-brutto-b',
        line: 'Zeile 6 (Person B)',
        label: `Schweizer Bruttolohn (${partnerName})`,
        value: `${chGrossB.value.toLocaleString('de-DE')} CHF`,
        person: 'B',
        provenanceLabel: prov('chLohnausweis', 'grossWageChf'),
        screen: 'chLohnausweis',
        field: 'grossWageChf',
      })
    }
    if (chQstB?.kind === 'erfasst' && chQstB.value !== undefined) {
      nGreRows.push({
        id: 'ngre-qst-b',
        line: 'Zeile 24 (Person B)',
        label: `Schweizer Quellensteuer (${partnerName})`,
        value: `${chQstB.value.toLocaleString('de-DE')} CHF`,
        person: 'B',
        provenanceLabel: prov('chLohnausweis', 'withholdingTaxChf'),
        screen: 'chLohnausweis',
        field: 'withholdingTaxChf',
      })
    }
  }
  if (nGreRows.length === 0) return null
  return {
    formId: 'anlageNGre',
    title: 'Anlage N-Gre',
    subtitle: 'Grenzgänger Schweiz (DBA-Schweiz Art. 15a)',
    rows: nGreRows,
  }
}
