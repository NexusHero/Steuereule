# ADR-0083 — Lohnsteuerbescheinigung ohne lesbare Sozialversicherung

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/lstb/lstb.service.ts`, `apps/api/src/lstb-scan/`, `apps/mobile-web/src/screens/lstb/scan/`
- **Baut auf:** ADR-0008 (Werte übernehmen), dem Dazurechnen einer weiteren Bescheinigung (Scan-Robustheit)

## Kontext

Im Echtfall 2024 gab es eine zweite Lohnsteuerbescheinigung desselben Arbeitgebers (Zahlung nach dem Austritt,
Steuerklasse 6). Bruttolohn und Lohnsteuer waren lesbar, die Zeilen der Sozialversicherung im Scan nicht. „Werte
übernehmen“ verlangte alle drei Werte, darum fehlten Lohn und Steuer dieser Bescheinigung ganz.

## Entscheidung

1. **Die Sozialversicherung darf fehlen.** Bruttolohn und Lohnsteuer werden übernommen. Bleibt die Sozialversicherung
   leer, gilt sie als offen.
2. **Bei einer weiteren Bescheinigung** kommen Lohn und Steuer zur bisherigen Summe dazu. Die Summe der
   Sozialversicherung bleibt mit ihrer Herkunft stehen.
3. **Als dieselbe Bescheinigung** gilt eine weitere nur dann, wenn alle gelesenen Werte gleich sind.
4. **Maske:** Ein leeres Sozialversicherungsfeld blockiert „Werte übernehmen“ nicht. Ein Hinweis sagt, was dann
   passiert, und dass der Nutzer den Betrag auch selbst eintragen kann. Die Plausibilitätsprüfung rechnet die
   fehlende Sozialversicherung als 0.

## Folgen

- Echtfall 2024: Lohn und Lohnsteuer beider Bescheinigungen stehen zusammen in der Lohnsteuerbescheinigung, wie
  beim Steuerberater.
- Die Entwürfe der Eule zu einer gescannten Bescheinigung bleiben, wie sie sind; übernommen wird über die Maske.
