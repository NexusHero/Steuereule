# ADR-0076 — Weitere Werbungskosten, Kinderbetreuung und der Arbeitgeberanteil der Prämien

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/prisma/schema.prisma` (Arbeitsweg, Kind), `apps/api/src/commute/`, `apps/api/src/children/`, `apps/api/src/confirmation/field-access.ts`, `apps/api/src/tax-estimate/tax-estimate.service.ts`, `apps/api/src/printout/`, `apps/api/src/receipt/parse/auto-receipt-parse.strategy.ts`, `apps/api/src/advisor/{advisor.service,advisor-case-facts}.ts`, `apps/api/src/ki/advisor-prompt.ts`, `apps/api/src/ch-certificate-scan/ch-letter.parse-strategy.ts`, `packages/core/src/domains/{work-expenses,childcare,n-gre}.ts`, `packages/core/src/interview/{advisor,field-catalog}.ts`, `apps/mobile-web/src/screens/{workdays,children,cross-border}/`
- **Baut auf:** ADR-0050 (Ausdruck-Felder vermessen), ADR-0072 (N-Gre-Prämien), ADR-0073 (Person B), ADR-0075 (Prämienbrief)

## Kontext

Im Echtfall setzte der Steuerberater Arbeitsmittel (Berufskleidung), Kontoführung und
Kinderbetreuung an. Die App hatte dafür kein Feld: Die Eule nannte sie als Hebel, konnte sie aber
nirgends ablegen, die Schätzung kannte sie nicht, der Ausdruck druckte sie nicht. Belege über
Arbeitsmittel landeten als „Fortbildung = Ja“. Bei Grenzgängern zählten Fortbildung und Umzug in
der Schätzung gar nicht. Der Arbeitgeberbetrag einer Prämie war in der Maske erst bei 100 % sichtbar,
obwohl die Rechnung ihn immer verwendet und ein Prämienbrief ihn ohne Anteil nennt.

## Entscheidung

1. **Weitere Werbungskosten je Person in der Arbeitsweg-Maske:** Berufsverbände (Kz 310), Arbeitsmittel
   und typische Berufskleidung (Kz 320, mit „was es war“), Kontoführung und Sonstiges (Kz 380, mit
   „wofür“). Die Arbeitsweg-Maske ist schon je Person geführt, auch für Person B; ein Speichern ohne diese
   Felder lässt sie unverändert. Verschlüsselt wie alle Beträge.
2. **Schätzung:** Sie zählen zu Arbeitsweg und Homeoffice und werden wie bisher mit dem
   Arbeitnehmer-Pauschbetrag verglichen. Fortbildung und Umzug zählen jetzt auch bei Grenzgängern.
3. **Ausdruck:** Anlage N Z. 53/54/56 und 62–64, Anlage N-Gre Z. 48/49/51 und 57–59, neu vermessen.
4. **Kinderbetreuung je Kind** (Betrag, Art/Anbieter, Zeitraum): Anlage Kind Z. 67 (Kz 51). Die Schätzung
   zieht ab 2025 80 %, höchstens 4.800 € je Kind ab (davor zwei Drittel, höchstens 4.000 €), nur für ein
   Kind, das zu Jahresbeginn noch nicht 14 war; beim Ehepaar einmal für den Haushalt.
5. **Eule und Belege:** Die Felder stehen im Feldkatalog und sind Entwurfsziele (auch für Person B). Die
   Eule kennt ihre Wirkung im Fall-Überblick. Ein Arbeitsmittel-Beleg geht auf Kz 320; mehrere Belege
   addieren sich zur Jahressumme statt sich zu ersetzen. Ein Wert, der kein schlichter Betrag ist, bleibt
   für die PII-Prüfung stehen und wird nicht „korrigiert“.
6. **Prämien:** Der Arbeitgeberbetrag ist sichtbar, solange der Anteil offen oder 100 % ist. Zahlt die Person
   selbst nichts zum Krankentaggeld, gilt der Arbeitgeber als 100 %-Zahler — in der Rechnung und im
   Prämienbrief-Leser. Für die NBUV bleibt der Anteil eine Frage an den Nutzer, weil der Arbeitnehmeranteil
   dort nur ein Rest aus Ziffer 9 ist.

## Folgen

- Echtfall: Arbeitsmittel und Kontoführung je Person und die Kinderbetreuung lassen sich erfassen und
  stehen im Ausdruck wie beim Steuerberater.
- Nicht enthalten: Fortbildungskosten (Kz 330) stehen noch nicht im Ausdruck; Reisekosten und doppelte
  Haushaltsführung bleiben wie bisher.
