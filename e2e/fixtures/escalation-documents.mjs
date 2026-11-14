// The escalation case's documents (scenario 25, family Sommer, 2025): both spouses change from a German
// employer to a Swiss one at mid-year, three children in care, a dentist's bill and a cosmetic operation.
// Laid out like the real documents the readers learned from; every name, number and amount is invented.
const eur = (n) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const lstb = ({ name, employer, gross, wageTax, rv, kv, pv, av }) => [
  'Ausdruck der elektronischen Lohnsteuerbescheinigung für 2025',
  `Arbeitgeber: ${employer}`, name, 'Steuerklasse: IV',
  '1. Dauer des Dienstverhältnisses   01.01.-30.06.',
  `3. Bruttoarbeitslohn einschl. Sachbezüge ohne 9. und 10.    ${eur(gross)}`,
  `4. Einbehaltene Lohnsteuer von 3.                           ${eur(wageTax)}`,
  '5. Einbehaltener Solidaritätszuschlag                         0,00',
  `22a Arbeitgeberanteil zur gesetzlichen Rentenversicherung   ${eur(rv)}`,
  `23a Arbeitnehmeranteil zur gesetzlichen Rentenversicherung  ${eur(rv)}`,
  `25. Arbeitnehmerbeiträge zur gesetzlichen Krankenversicherung ${eur(kv)}`,
  `26. Arbeitnehmerbeiträge zur sozialen Pflegeversicherung       ${eur(pv)}`,
  `27. Arbeitnehmerbeiträge zur Arbeitslosenversicherung          ${eur(av)}`,
].join('\n')
const chf = (n) => n.toLocaleString('de-CH').replace(/’|'/g, '.')
export const lohnausweis = ({ last, first, street, ahv, born, employer, lohn, brutto, ahvSum, bvg, netto, qst }) => [
  'A     X          Lohnausweis - Certificat de salaire - Certificato di salario',
  'B                Rentenbescheinigung - Attestation de rentes - Attestazione delle rendite',
  'C                                                                                                             F                Unentgeltiche Beförderung zwischen Wohn- und Arbeitsort',
  `      ${ahv}                                 ${born}                                                              Transport gratuit entre le domicile et le lieu de travail`,
  '    AHV-Nr. - No AVS - N. AVS                       Geburtsdatum - Date de naissance - Data do nascita                         Trasporto gratuito dal domicilio al luogo di lavoro',
  'D     2025                          E      01.07.2025                 31.12.2025                              G                Repas à la cantine / chèques-repas',
  '    Jahr - Année - Anno                  von - du - dal             bis - au - al                                              Pasti alla mensa / buoni pasto',
  '', 'H', '          - PERSÖNLICH -', `          ${last} ${first}`, `          ${street}`, '          79999 MUSTERDORF', '          DEUTSCHLAND', '',
  ' 1. Lohn soweit nicht unter Ziffer 2-7 aufzuführen                   / Rente                                                                                                               CHF',
  '    Salaire qui ne concerne pas les chiffres 2 à 7 ci-dessous        / Rente',
  `    Salario se non da indicare sotto cifre da 2 a 7 più sotto        / Rendita                                                                                                  ${chf(lohn)}`,
  ' 2. Gehaltsnebenleistungen            2.1 Verpflegung, Unterkunft - Pension, logement - Vitto, alloggio                                                      +',
  ' 3. Unregelmässige Leistungen - Prestations non périodiques - Prestazioni aperiodiche                             Art - Genre - Genere',
  ' 7. Andere Leistungen - Autres prestations - Altre prestazioni                                                  Art - Genre - Genere           +',
  '',
  ` 8 Bruttolohn total / Rente - Salaire brut total / Rente - Salario lordo totale / Rendita                                                             =                  ${chf(brutto)}`,
  ` 9. Beiträge AHV/IV/EO/ALV/NBUV - Cotisations AVS/AI/APG/AC/AANP - Contributi AVS/AI/IPG/AD/AINP                                                      -                      ${chf(ahvSum)}`,
  `10 Berufliche Vorsorge        2. Säule 10.1 Ordentliche Beiträge - Cotisations ordinaries - Contributi ordinari                                              -                      ${chf(bvg)}`,
  '   Prévoyance professionnelle 2epilier', '',
  `11. Nettolohn / Rente - Salaire net / Rente - Salario netto / Rendita                                                                                 =                   ${chf(netto)}`,
  '    In die Steuererklärung übertragen - A reporter sur la déclaration d\'impôt - Da riportare nella dichiarazione d\'imposta', '',
  `12. Quellensteuerabzug - Retenue de I'impôt à la source - Ritenuta d'imposta alla fonte                                                                                             ${chf(qst)}`,
  '15. Bemerkungen         Kinderzulagen im Lohn enthalten', '',
  `I   Ort und Datum - Lieu et date - Luogo e data                  Die Richtigkeit und Vollständigkeit bestätigt                           ${employer}`,
].join('\n')
export const pensionRows = ({ title, name, spar, risiko, sparObl, risikoObl }) => [
  'Pensionskasse Beispiel                                      Musterweg 1, CH-8000 Zürich',
  'Nachweis obligatorischer und überobligatorischer Beiträge                    ausgestellt am 10.02.2026',
  'Versicherungs-Nr.                          654321',
  `AHV-Nummer                     756’9999’0000’11                  ${title}`,
  `Geburtsdatum                           01.01.1988                ${name}`,
  'Wunschgemäss bestätigen wir Ihnen folgende Arbeitgeber- und Arbeitnehmerbeiträge für das Jahr 2025.',
  'Beiträge                                                                           Arbeitnehmer       Arbeitgeber',
  `Sparbeitrag                                                                         ${spar}          ${spar}`,
  `Risikobeitrag                                                                         ${risiko}            ${risiko}`,
  'Davon Beiträge BVG',
  `Sparbeitrag BVG (obligatorischer Anteil)                                           ${sparObl}          ${sparObl}`,
  `Risikobeitrag BVG (obligatorischer Anteil)                                            ${risikoObl}            ${risikoObl}`,
  'alle Beträge in CHF',
].join('\n')
export const premiumLetter = ({ name, ktg, nbu }) => [
  'Beispiel AG - Postfach - CH-8000 Zürich', name,
  'Bestätigung Krankentaggeld- und Nichtberufsunfallversicherung 2025',
  'Wir bestätigen Ihnen hiermit, dass die Firma folgende Prämien zur Krankentaggeld- und',
  'Nichtberufsunfallversicherung im Jahr 2025 für Sie geleistet hat:',
  `Krankentaggeld:                      ${ktg} CHF`, `Nichtberufsunfall:                   ${nbu} CHF`,
].join('\n')
export const familyHealth = (members) => [
  'SWICA GESUNDHEITSORGANISATION', 'ZUSAMMENSTELLUNG FÜR IHRE STEUERERKLÄRUNG 2025', 'FAMILIENÜBERSICHT DER KOSTENZUSAMMENSTELLUNG FÜR 2025',
  ...members.map((m) => `${m.name}                ${m.own}              ${m.premium}`),
  ...members.flatMap((m, i) => [
    m.name.toUpperCase(), `VERSICHERTEN-NR. 200000${i + 1}`, 'KOSTENZUSAMMENSTELLUNG FÜR 2025',
    `Prämien Grundversicherung/Prämienverbilligung                    ${m.premium}               0.00         ${m.premium}`,
    `Total Ihres Kostenanteils für 2025                                                                       ${m.own}`,
    `Prämientotal 2025                                                                                    ${m.premium}`,
  ]),
].join('\n')
export const kita = ({ child, provider, monthly, from }) =>
  `${provider}\nJahresbescheinigung Elternbeiträge\nBetreuung für das Kind ${child} Sommer\nDer Elternbeitrag beträgt ab ${from} monatlich ${eur(monthly)} EUR.\nGesamt 2025: ${eur(monthly * 12)} EUR`
export const dentist = 'Zahnarztpraxis Dr. Beispiel\nRechnung Nr. 2025-0815 vom 14.05.2025\nPatient: Elias Sommer\nZahnärztliche Behandlung, Füllungstherapie und Implantat nach GOZ\nEigenanteil nach Erstattung der Krankenkasse\nRechnungsbetrag: 1.700,00 EUR'
export const cosmetic = 'Klinik für Ästhetische Chirurgie Beispiel\nRechnung vom 02.10.2025\nPatientin: Nora Sommer\nSchönheitsoperation (ästhetische Lidstraffung), keine medizinische Indikation\nRechnungsbetrag: 3.800,00 EUR'
export const donation = 'Bestätigung über Geldzuwendungen im Sinne des § 10b EStG\nan eine gemeinnützige Körperschaft\nKinderhilfe Beispiel e.V.\nName des Zuwendenden: Elias Sommer\nBetrag der Zuwendung: 300,00 EUR\nTag der Zuwendung: 01.12.2025'
