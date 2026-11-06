// Target values and reference figures for the 4 acceptance scenarios (Steuerjahr 2025).
//
// Sources:
// 1. Official BMF tax calculator 2025 (Bundesministerium der Finanzen, ESt-Berechnung nach § 32a EStG):
//    - Single tariff 2025 (Grundtarif)
//    - Married splitting tariff 2025 (Splittingverfahren, § 32a Abs. 5 EStG)
//    - Child allowance (Kinderfreibetrag 2025: 9.600 € per child for married couples / 4.800 € per parent)
// 2. Hand calculations documented in testlauf-2025/00-testpersonen.md and testlauf-2025/BERICHT.md:
//    - Pendlerpauschale (§ 9 Abs. 1 Satz 3 Nr. 4 EStG: 0,30 € for first 20 km, 0,38 € from km 21)
//    - Swiss Lohnausweis Grenzgänger deductions (§ 49b EStG, DBA Deutschland-Schweiz Art. 15a)
//    - Swiss family allowances priority over German Kindergeld (§ 65 EStG / VO (EG) 883/2004)
//    - Building depreciation (§ 7 Abs. 4 Nr. 2 Buchst. a EStG: 2% linear AfA for residential buildings)

export const SCENARIO_1_LENA = {
  id: 'persona-1-lena-hoffmann',
  name: 'Lena Hoffmann',
  email: 'du+lena@beispiel.de',
  password: 'Sicheres-Passwort-1!',
  year: 2025,
  profile: {
    firstName: 'Lena',
    lastName: 'Hoffmann',
    taxId: '31234567890',
    taxNumber: '0612345678',
  },
  masterData: {
    birthDate: '14.05.1991',
    religion: 'VD', // konfessionslos
    occupation: 'Ingenieurin',
    street: 'Kartäuserstraße',
    houseNumber: '12',
    postalCode: '79102',
    city: 'Freiburg',
    taxOffice: 'Freiburg-Stadt',
    iban: 'DE89370400440532013000',
    maritalStatus: 'ledig',
  },
  interview: {
    job: 'Angestellt',
    ausland: 'Nein',
    kinder: 'Nein',
    familienstand: 'Ledig',
  },
  lstb: {
    grossWage: 94999, // LStB Z. 3 (94.999 €)
    wageTax: 21797, // LStB Z. 4 (21.797 €)
    socialSecurity: 17314, // AN-Anteil Z. 23+25+26+27 (17.314 €)
  },
  specialExpenses: {
    donations: 300,
  },
  commute: {
    oneWayKm: 70,
    transport: 'pkw',
    workdays: [1, 2, 3, 4, 5],
    vacationDays: 30,
    sickDays: 4,
    homeOfficeDays: 0,
    region: 'BW',
    // 261 possible workdays - 11 public holidays (BW) - (30 vacation + 4 sick) = 216 commute days
    commuteDays: 216,
    // Hand calculation: 216 days * (20 km * 0.30 € + 50 km * 0.38 €) = 216 * 25.00 € = 5.400 €
    allowance: 5400,
    workplace: '76131 Karlsruhe, Durlacher Allee 50',
  },
  // Hand calculation 2025 (§ 32a EStG Grundtarif, zone 4: 0,42 · zvE − 10.911,92), with public holidays:
  // - Gross salary: 94.999 €
  // - Werbungskosten: Pendlerpauschale 216 × 25 € = 5.400 € (above the 1.230 € Pauschbetrag)
  // - Vorsorgeaufwendungen (RV, Basis-KV + PV, AV): 15.853 €
  // - Spenden: 300 €
  // - zvE: 94.999 − 5.400 − 15.853 − 300 = 73.446 €
  // - ESt: 0,42 · 73.446 − 10.911,92 = 19.935 € (Soli 0: below the 19.950 € Freigrenze)
  // - Refund: Lohnsteuer 21.797 € + Soli 219 € − 19.935 € = 2.081 €
  // The 2025 test run's 2.197 € (zvE 73.171 €) counted 227 commute days, before public holidays were
  // subtracted (finding F4); the same formula reproduces it, which checks the formula.
  expectedEstimate: {
    taxableIncome: 73446,
    incomeTax: 19935,
    soli: 0,
    churchTax: 0,
    targetRefund: 2081,
  },
  expectedPdfFields: {
    'est1a.name': 'Hoffmann',
    'est1a.vorname': 'Lena',
    'est1a.geburtsdatum': '14.05.1991',
    'est1a.idnr': '31234567890',
    'est1a.steuernummer': '0612345678',
    'anlN.kz110': '94999',
    'anlN.kz110Tage': '216',
    'anlN.kz111': '70',
    'anlSo.spenden': '300',
  },
}

export const SCENARIO_2_3_BRENNER = {
  id: 'persona-2-3-markus-julia-brenner',
  name: 'Markus & Julia Brenner',
  year: 2025,
  markus: {
    email: 'du+markus@beispiel.de',
    password: 'Sicheres-Passwort-1!',
    profile: {
      firstName: 'Markus',
      lastName: 'Brenner',
      taxId: '21234567890',
      taxNumber: '1234567890',
    },
    masterData: {
      birthDate: '03.02.1984',
      religion: 'RK', // römisch-katholisch
      occupation: 'Chemiker',
      street: 'Basler Straße',
      houseNumber: '40',
      postalCode: '79540',
      city: 'Lörrach',
      taxOffice: 'Lörrach',
      iban: 'DE89370400440532013000',
      maritalStatus: 'verheiratet',
      marriedSince: '12.06.2014',
    },
    interview: {
      job: 'Angestellt',
      ausland: 'Ja, in die Schweiz',
      kinder: '2 oder mehr',
      familienstand: 'Verheiratet',
    },
    crossBorder: {
      nonReturnDays: 0,
      exchangeRateMonth: '2025-12',
      exchangeRate: '1.0650',
      // Swiss Lohnausweis values (in CHF):
      wageChf: 126000, // Z. 1
      familyAllowancesChf: 5160, // Z. 7 (2 * 215 CHF * 12)
      grossWageChf: 131160, // Z. 8
      ahvAlvChf: 9968, // Z. 9
      pensionChf: 7860, // Z. 10.1 (total)
      pensionObligatoryChf: 4631,
      pensionEmployerChf: 8820,
      netWageChf: 113332, // Z. 11
      withholdingTaxChf: 5902, // Z. 12 (4,5 % Quellensteuer CH)
      dailySicknessAllowanceEur: 1200,
      dailySicknessEmployerPercent: 10,
      dailySicknessEmployeePercent: 90,
      healthCareEur: 5160, // 250 €/mo for Markus + 2 * 90 €/mo for 2 kids = 430 €/mo * 12 = 5.160 €
    },
    commute: {
      oneWayKm: 80,
      transport: 'pkw',
      workdays: [1, 2, 3, 4, 5],
      vacationDays: 30,
      sickDays: 5,
      homeOfficeDays: 0,
      region: 'BS',
      workplace: 'Rheinpharma AG, Grenzacherstrasse 100, 4058 Basel',
      // Hand calculation: 226 days * (20 * 0.30 + 60 * 0.38) = 226 * 28.80 € = 6.509 €
      allowance: 6509,
    },
    children: [
      {
        firstName: 'Mia',
        lastName: 'Brenner',
        birthDate: '14.03.2016',
        taxId: '41234567890',
        swissAllowanceEur: 2748, // 2.580 CHF / 1,0650 * ... ≈ 2.748 €
        childBenefitEur: 312, // Differenzkindergeld (3.060 € DE claim - 2.748 € CH) = 312 €
      },
      {
        firstName: 'Noah',
        lastName: 'Brenner',
        birthDate: '02.09.2019',
        taxId: '41234567891',
        swissAllowanceEur: 2748,
        childBenefitEur: 312,
      },
    ],
  },
  julia: {
    email: 'du+julia@beispiel.de',
    password: 'Sicheres-Passwort-1!',
    profile: {
      firstName: 'Julia',
      lastName: 'Brenner',
      taxId: '21234567891',
      taxNumber: '1234567890',
    },
    masterData: {
      birthDate: '21.07.1986',
      religion: 'RK',
      occupation: 'Treuhänderin',
      street: 'Basler Straße',
      houseNumber: '40',
      postalCode: '79540',
      city: 'Lörrach',
      maritalStatus: 'verheiratet',
    },
    interview: {
      job: 'Angestellt',
      ausland: 'Ja, in die Schweiz',
      kinder: '2 oder mehr',
      familienstand: 'Verheiratet',
    },
    crossBorder: {
      nonReturnDays: 0,
      exchangeRateMonth: '2025-12',
      exchangeRate: '1.0650',
      wageChf: 110000, // Z. 1 = Z. 8
      ahvAlvChf: 8360, // Z. 9
      pensionChf: 6600, // Z. 10.1
      pensionObligatoryChf: 4631,
      pensionEmployerChf: 7700,
      netWageChf: 95040, // Z. 11
      withholdingTaxChf: 4950, // Z. 12
      dailySicknessAllowanceEur: 790,
      dailySicknessEmployerPercent: 0,
      dailySicknessEmployeePercent: 100,
      healthCareEur: 3000, // 250 €/mo * 12 = 3.000 €
    },
    commute: {
      oneWayKm: 20,
      transport: 'pkw',
      workdays: [1, 2, 3, 4, 5],
      vacationDays: 30,
      sickDays: 3,
      homeOfficeDays: 0,
      region: 'BS',
      workplace: 'Basler Treuhand AG, Steinenberg 5, 4051 Basel',
      // Hand calculation: 228 days * 20 km * 0.30 € = 1.368 €
      allowance: 1368,
    },
  },
  expectedPdfFields: {
    'est1a.zusammenveranlagung': 'X',
    'est1a.name': 'Brenner',
    'est1a.vorname': 'Markus',
    'est1a.nameB': 'Brenner',
    'est1a.vornameB': 'Julia',
    'est1a.geburtsdatum': '03.02.1984',
    'est1a.geburtsdatumB': '21.07.1986',
    'est1a.verheiratetSeit': '12.06.2014',
    'anlNGre.personA': 'X',
    'anlNGre.kz117': '3',
    'anlNGre.name': 'Brenner',
    'anlNGre.vorname': 'Markus',
    'anlKind.vorname': 'Mia',
    'anlKind.idnr': '41234567890',
    'anlKind.vorname#2': 'Noah',
    'anlKind.idnr#2': '41234567891',
  },
}

export const SCENARIO_4_WEBER = {
  id: 'persona-4-thomas-sabine-weber',
  name: 'Thomas & Sabine Weber',
  email: 'du+thomas@beispiel.de',
  password: 'Sicheres-Passwort-1!',
  year: 2025,
  thomas: {
    profile: {
      firstName: 'Thomas',
      lastName: 'Weber',
      taxId: '51234567890',
      taxNumber: '9312345678',
    },
    masterData: {
      birthDate: '09.11.1972',
      religion: 'VD',
      occupation: 'Bauingenieur',
      street: 'Gänsheidestraße',
      houseNumber: '8',
      postalCode: '70184',
      city: 'Stuttgart',
      taxOffice: 'Stuttgart II',
      iban: 'DE89370400440532013000',
      maritalStatus: 'verheiratet',
      marriedSince: '15.05.1999',
    },
    interview: {
      job: 'Angestellt',
      ausland: 'Nein',
      kinder: 'Nein',
      familienstand: 'Verheiratet',
    },
    lstb: {
      grossWage: 82000, // StKl III: 82.000 €
      wageTax: 9890,
      socialSecurity: 15473,
    },
    commute: {
      oneWayKm: 15,
      transport: 'pkw',
      workdays: [1, 2, 3, 4, 5],
      vacationDays: 30,
      sickDays: 5,
      homeOfficeDays: 0,
      region: 'BW',
      workplace: 'Stuttgart Zentrum',
    },
  },
  sabine: {
    // Person B without separate account: entered by Thomas
    firstName: 'Sabine',
    lastName: 'Weber',
    taxId: '51234567891',
    birthDate: '30.04.1975',
    occupation: 'Architektin',
    religion: 'VD',
    lstb: {
      grossWage: 48000, // StKl V: 48.000 €
      wageTax: 10420,
      socialSecurity: 10008,
    },
    commute: {
      oneWayKm: 8,
      transport: 'pkw',
      workdays: [1, 2, 3, 4, 5],
      vacationDays: 30,
      sickDays: 4,
      homeOfficeDays: 0,
      region: 'BW',
      workplace: 'Stuttgart Ost',
    },
  },
  capital: {
    inhaber: 'gemeinsam',
    kapitalertraege: 50000, // 50.000 € über deutschen Broker
    sparerPauschbetrag: 2000, // 2.000 € Sparer-Pauschbetrag für Ehegatten
    kapitalertragsteuer: 12000,
    solidaritaetszuschlag: 660,
    kirchensteuer: 0,
  },
  rentals: [
    {
      // Property 1: ETW Stuttgart
      address: {
        street: 'Hölderlinstraße 3',
        postalCode: '70174',
        city: 'Stuttgart',
        livingArea: '85',
        units: '1',
      },
      grossRent: 14400,
      buildingCost: 280000,
      yearOfConstruction: 1995,
      advertisingCosts: 3200,
      depreciationAsLastYear: true,
      // Hand calculation: 2% linear AfA on 280.000 € = 5.600 € AfA
      // Surplus: 14.400 € rent - 5.600 € AfA - 3.200 € WK = 5.600 €
      expectedAfA: 5600,
      expectedSurplus: 5600,
    },
    {
      // Property 2: MFH Esslingen (3 Wohnungen)
      address: {
        street: 'Mühlstraße 21',
        postalCode: '73728',
        city: 'Esslingen',
        livingArea: '220',
        units: '3',
      },
      grossRent: 38400,
      buildingCost: 620000,
      yearOfConstruction: 1978,
      advertisingCosts: 9800,
      depreciationAsLastYear: true,
      // Hand calculation: 2% linear AfA on 620.000 € = 12.400 € AfA
      // Surplus: 38.400 € rent - 12.400 € AfA - 9.800 € WK = 16.200 €
      expectedAfA: 12400,
      expectedSurplus: 16200,
    },
    {
      // Property 3: ETW Ludwigsburg
      address: {
        street: 'Schorndorfer Straße 55',
        postalCode: '71638',
        city: 'Ludwigsburg',
        livingArea: '65',
        units: '1',
      },
      grossRent: 10200,
      buildingCost: 240000,
      yearOfConstruction: 2018,
      advertisingCosts: 2600,
      depreciationAsLastYear: true,
      // Hand calculation: 2% linear AfA on 240.000 € = 4.800 € AfA
      // Surplus: 10.200 € rent - 4.800 € AfA - 2.600 € WK = 2.800 €
      expectedAfA: 4800,
      expectedSurplus: 2800,
    },
  ],
  // Total rental surplus: 5.600 € + 16.200 € + 2.800 € = 24.600 €
  expectedTotalRentalSurplus: 24600,
  expectedPdfFields: {
    'est1a.zusammenveranlagung': 'X',
    'est1a.name': 'Weber',
    'est1a.vorname': 'Thomas',
    'est1a.nameB': 'Weber',
    'est1a.vornameB': 'Sabine',
    'est1a.geburtsdatum': '09.11.1972',
    'est1a.geburtsdatumB': '30.04.1975',
    'anlN.kz110': '82000',
    'anlKap.personA': 'X',
    'anlKap.kz210': '25000',
    'anlV.strasse': 'Hölderlinstraße 3',
    'anlV.kz01': '14400',
    'anlV.strasse#2': 'Mühlstraße 21',
    'anlV.kz01#2': '38400',
    'anlV.strasse#3': 'Schorndorfer Straße 55',
    'anlV.kz01#3': '10200',
  },
}
