// Sections of children, capital, rental and pension: Anlage Kind, Anlage KAP, Anlage V, Anlage R.
import { formatEuro } from '@steuereule/core'
import type { KapitalResponseDto, ChildrenResponseDto, PensionResponseDto, RentalResponseDto } from '@steuereule/api-client'
import type { GlassFormRow, GlassFormSection, GlassRowContext } from './glassFormTypes'

/** 5. Anlage Kind */
export function kindSection(kinderData: ChildrenResponseDto | null, { isJoint, prov }: GlassRowContext): GlassFormSection | null {
  if (!(kinderData && kinderData.kinder.length > 0)) return null
  const kindRows: GlassFormRow[] = kinderData.kinder.flatMap((k, idx) => {
    const name = [k.firstName, k.lastName].filter(Boolean).join(' ') || `Kind ${idx + 1}`
    const claimNum = Number(k.childBenefitClaimEur ?? 0)
    const childcareNum = Number(k.childcareEur ?? 0)
    const rows: GlassFormRow[] = [
      {
        id: `kind-${k.id}-stamm`,
        line: `Kind ${idx + 1} · Z. 4–10`,
        label: `${name}${k.geburtsdatum ? ` (*${k.geburtsdatum})` : ''}`,
        value: `Kindergeld: ${formatEuro(Number.isFinite(claimNum) ? claimNum : 0)}`,
        person: isJoint ? 'gemeinsam' : 'A',
        provenanceLabel: prov('kind', 'firstName'),
        screen: 'kind',
        field: 'firstName',
      },
    ]
    // Z. 27/28 (Kz 66/67) as the printout fills them; a foreign insurer goes into Kz 89, KV and PV together.
    const amountOf = (value: string | null | undefined): number => (Number.isFinite(Number(value ?? 0)) ? Number(value ?? 0) : 0)
    const healthRow = (suffix: string, line: string, label: string, value: number): GlassFormRow => ({
      id: `kind-${k.id}-${suffix}`,
      line: `Kind ${idx + 1} · ${line}`,
      label: `${label} (${name})`,
      value: formatEuro(value),
      person: isJoint ? 'gemeinsam' : 'A',
      provenanceLabel: prov('kind', 'healthBasicEur'),
      screen: 'kind',
      field: 'healthBasicEur',
    })
    const healthNum = amountOf(k.healthBasicEur)
    const careNum = amountOf(k.careEur)
    if (k.healthInsuranceAbroad === true) {
      if (healthNum + careNum > 0) rows.push(healthRow('ausland', 'Z. 37 (Kz 89)', 'Kranken- und Pflegeversicherung im Ausland', healthNum + careNum))
    } else {
      if (healthNum > 0) rows.push(healthRow('kv', 'Z. 27 (Kz 66)', 'Krankenversicherung (Basis)', healthNum))
      if (careNum > 0) rows.push(healthRow('pv', 'Z. 28 (Kz 67)', 'Pflegeversicherung', careNum))
    }
    if (Number.isFinite(childcareNum) && childcareNum > 0) {
      rows.push({
        id: `kind-${k.id}-betreuung`,
        line: `Kind ${idx + 1} · Z. 67 (Kz 51)`,
        label: `Kinderbetreuungskosten (${name})`,
        value: formatEuro(childcareNum),
        person: isJoint ? 'gemeinsam' : 'A',
        provenanceLabel: prov('kind', 'childcareEur'),
        screen: 'kind',
        field: 'childcareEur',
      })
    }
    return rows
  })
  return {
    formId: 'anlageKind',
    title: `Anlage Kind (${kinderData.kinder.length}×)`,
    subtitle: 'Kinderfreibeträge, Kindergeld, Differenzkindergeld & Betreuung',
    rows: kindRows,
  }
}

/** 6. Anlage KAP */
export function kapSection(cap: KapitalResponseDto | null, { isJoint, prov }: GlassRowContext): GlassFormSection | null {
  const capRows: GlassFormRow[] = []
  if (cap?.kapitalertraege.kind === 'erfasst' && cap.kapitalertraege.value !== undefined) {
    capRows.push({
      id: 'kap-ertraege',
      line: 'Zeile 7 / 19',
      label: 'Kapitalerträge (Zinsen, Dividenden, Fonds)',
      value: formatEuro(cap.kapitalertraege.value),
      person: cap.inhaber ?? (isJoint ? 'gemeinsam' : 'A'),
      provenanceLabel: prov('kapital', 'kapitalertraege'),
      screen: 'kapital',
      field: 'kapitalertraege',
    })
  }
  if (cap?.sparerPauschbetrag.kind === 'erfasst' && cap.sparerPauschbetrag.value !== undefined) {
    capRows.push({
      id: 'kap-pauschbetrag',
      line: 'Zeile 16',
      label: 'In Anspruch genommener Sparer-Pauschbetrag',
      value: formatEuro(cap.sparerPauschbetrag.value),
      person: cap.inhaber ?? (isJoint ? 'gemeinsam' : 'A'),
      provenanceLabel: prov('kapital', 'sparerPauschbetrag'),
      screen: 'kapital',
      field: 'sparerPauschbetrag',
    })
  }
  if (cap?.kapitalertragsteuer.kind === 'erfasst' && cap.kapitalertragsteuer.value !== undefined) {
    capRows.push({
      id: 'kap-kest',
      line: 'Zeile 47',
      label: 'Einbehaltene Kapitalertragsteuer (Abgeltungsteuer)',
      value: formatEuro(cap.kapitalertragsteuer.value),
      person: cap.inhaber ?? (isJoint ? 'gemeinsam' : 'A'),
      provenanceLabel: prov('kapital', 'kapitalertragsteuer'),
      screen: 'kapital',
      field: 'kapitalertragsteuer',
    })
  }
  if (capRows.length === 0) return null
  return {
    formId: 'anlageKap',
    title: 'Anlage KAP',
    subtitle: 'Einkünfte aus Kapitalvermögen & Günstigerprüfung',
    rows: capRows,
  }
}

/** 7. Anlage V (Vermietung) */
export function rentalSection(rental: RentalResponseDto | null, { isJoint, prov }: GlassRowContext): GlassFormSection | null {
  if (!(rental && rental.properties.length > 0)) return null
  const rentalRows: GlassFormRow[] = rental.properties.flatMap((obj, idx) => {
    const rows: GlassFormRow[] = []
    const title = [obj.strasse, obj.hausnummer, obj.city].filter(Boolean).join(' ') || `Objekt ${idx + 1}`
    if (obj.mieteinnahmen.kind === 'erfasst' && obj.mieteinnahmen.value !== undefined) {
      rows.push({
        id: `v-${obj.id}-miete`,
        line: `Objekt ${idx + 1} · Z. 9`,
        label: `Kaltmieteinnahmen (${title})`,
        value: formatEuro(obj.mieteinnahmen.value),
        person: isJoint ? 'gemeinsam' : 'A',
        provenanceLabel: prov('vermietung', 'mieteinnahmen'),
        screen: 'vermietung',
        field: 'mieteinnahmen',
      })
    }
    if (obj.werbungskosten.kind === 'erfasst' && obj.werbungskosten.value !== undefined) {
      rows.push({
        id: `v-${obj.id}-wk`,
        line: `Objekt ${idx + 1} · Z. 46–50`,
        label: `Laufende Werbungskosten (${title})`,
        value: formatEuro(obj.werbungskosten.value),
        person: isJoint ? 'gemeinsam' : 'A',
        provenanceLabel: prov('vermietung', 'werbungskosten'),
        screen: 'vermietung',
        field: 'werbungskosten',
      })
    }
    if (obj.anteilA) {
      rows.push({
        id: `v-${obj.id}-anteil`,
        line: `Objekt ${idx + 1} · Z. 86`,
        label: `Miteigentumsanteil Ehegatten (${title})`,
        value: `${obj.anteilA} % / ${100 - Number(obj.anteilA)} %`,
        person: 'gemeinsam',
        provenanceLabel: prov('vermietung', 'anteilA'),
        screen: 'vermietung',
        field: 'anteilA',
      })
    }
    return rows
  })
  if (rentalRows.length === 0) return null
  return {
    formId: 'anlageV',
    title: `Anlage V (${rental.properties.length}×)`,
    subtitle: 'Einkünfte aus Vermietung und Verpachtung',
    rows: rentalRows,
  }
}

/** 8. Anlage R (Rente) */
export function renteSection(
  pension: PensionResponseDto | null,
  pensionB: PensionResponseDto | null,
  { isJoint, partnerName, prov }: GlassRowContext,
): GlassFormSection | null {
  const renteRows: GlassFormRow[] = []
  if (pension?.jahresbetrag.kind === 'erfasst' && pension.jahresbetrag.value !== undefined) {
    renteRows.push({
      id: 'rente-a',
      line: 'Zeilen 4–10',
      label: 'Jahresbetrag Rente (Person A)',
      value: formatEuro(pension.jahresbetrag.value),
      person: 'A',
      provenanceLabel: prov('rente', 'jahresbetrag'),
      screen: 'rente',
      field: 'jahresbetrag',
    })
  }
  if (isJoint && pensionB?.jahresbetrag.kind === 'erfasst' && pensionB.jahresbetrag.value !== undefined) {
    renteRows.push({
      id: 'rente-b',
      line: 'Zeilen 4–10 (Person B)',
      label: `Jahresbetrag Rente (${partnerName})`,
      value: formatEuro(pensionB.jahresbetrag.value),
      person: 'B',
      provenanceLabel: prov('rente', 'jahresbetrag'),
      screen: 'rente',
      field: 'jahresbetrag',
    })
  }
  if (renteRows.length === 0) return null
  return {
    formId: 'anlageR',
    title: 'Anlage R',
    subtitle: 'Renten und andere Leistungen',
    rows: renteRows,
  }
}
