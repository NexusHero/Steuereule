# ADR-0077 — Krankheitskosten (§ 33) und haushaltsnahe Aufwendungen (§ 35a) eingeschaltet

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/config/features.ts`, `apps/mobile-web/src/config/features.ts`, `apps/api/src/printout/{printout-values,printout.service,form-renderer}.ts`, `apps/api/src/printout/felder-2025.{spec.json,json}`
- **Baut auf:** ADR-0032 (Schalter `HOUSEHOLD_AND_HEALTH_BOOSTERS`), ADR-0050 (Ausdruck vermessen)

## Kontext

Die Fragen nach Krankheitskosten und haushaltsnahen Aufwendungen und ihre Rechnung (zumutbare
Belastung, 20 % Steuerermäßigung) waren gebaut, aber ausgeschaltet: Damals fehlte ein sicherer
Gesamtbetrag der Einkünfte, und kein Vordruck konnte die Werte drucken. Die Schätzung rechnet den
Gesamtbetrag der Einkünfte inzwischen selbst. Im Echtfall fehlten so Chiropraktiker und der
Handwerker-Lohnanteil, die der Steuerberater angesetzt hatte.

## Entscheidung

1. Der Schalter ist an (API und App). Die Kachel „Haushalt & Handwerker“ steht für alle vorne, „Gesundheit“
   vorne bei Rentnern, Eltern und Alleinerziehenden, sonst unter „Weitere Themen“.
2. Der Ausdruck füllt die **Anlage Außergewöhnliche Belastungen** Z. 23–25 (Kz 302, 303 = 0, weil das
   Interview die Kosten nach Erstattungen fragt) und die **Anlage Haushaltsnahe Aufwendungen** Z. 4 (Kz 202),
   Z. 5 (Kz 212) und Z. 6/9 (Kz 214). Beide Vordrucke sind neu vermessen und stehen nach den Sonderausgaben.
3. Ist der Schalter aus, druckt der Ausdruck nichts davon und das Interview speichert nichts davon.

## Folgen

- Krankheitskosten sind eine Summe; Arzt, Zahnarzt, Brille werden nicht getrennt geführt.
- Bei Handwerkern ist nur der Lohnanteil bekannt; den Rechnungsbetrag in Z. 6 trägt der Nutzer im Ausdruck nach.
