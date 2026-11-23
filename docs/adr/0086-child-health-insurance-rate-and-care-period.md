# ADR-0086 — KV des Kindes ohne gewählten Kurs, Betreuungszeitraum aus dem Bescheid

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/ch-certificate-scan/ch-health-statement.parse-strategy.ts`, `packages/core/src/domains/childcare-notice.ts`, `apps/api/src/receipt/parse/auto-receipt-parse.strategy.ts`, `apps/api/src/advisor/advisor.service.ts`
- **Baut auf:** ADR-0080 (Krankenkassen-Auszüge), ADR-0076 (Kinderbetreuung)

## Kontext

Im vollständigen Lauf 2024 fehlten zwei Dinge. Den Auszug der Krankenkasse für das Kind lud der Nutzer hoch,
bevor er im Lohnausweis einen Wechselkurs gewählt hatte. Die App versprach, den Betrag später umzurechnen, kam
aber nie darauf zurück. Den Bescheid der Kindertagespflege erkannte sie, legte aber keinen Entwurf an. Der Zeitraum
der Betreuung wurde darum geraten (ganzes Jahr statt ab dem Beginn laut Bescheid).

## Entscheidung

1. **Kurs für das Kind:** Ist noch kein Kurs gewählt, rechnet die App die Prämie des Kindes zum amtlichen
   Jahresdurchschnitt um (wie ihn die Anlage N-Gre druckt). Der Entwurf ist „prüfen“, und die Eule sagt, dass er bei
   einem anderen Kurs anzupassen ist.
2. **Betreuungszeitraum aus dem Bescheid:** Ein Bescheid oder eine Rechnung über Kinderbetreuung („ab …“, „vom …
   bis …“) ergibt den Zeitraum im Steuerjahr für Anlage Kind Zeile 67. Ein Beginn ohne Ende läuft bis zum Jahresende.
   Folgt dem Beginn eine Befristung („befristet bis …“, „bis zum …“), endet der Zeitraum dort, auch im
   Folgejahr. Der Entwurf geht an das einzige Kind des Jahres; bei mehreren an das Kind, dessen Vorname im
   Bescheid steht. Passt keines oder mehr als eines, entsteht kein Entwurf, und die Eule bittet, den Zeitraum beim
   Kind einzutragen. Den Betrag liest die App nicht, weil ein Bescheid nur einen Monatsbeitrag nennt; die Eule
   bittet um den tatsächlich gezahlten.
3. Dokument-Entwürfe dürfen Text tragen (Datum), nicht nur Beträge.

## Folgen

- Echtfall 2024: Die KV des Kindes steht im Entwurf, der Betreuungszeitraum ist der aus dem Bescheid, wie beim Steuerberater.
- Ein Bescheid aus dem Vorjahr mit Befristung ins neue Jahr ergibt auch im neuen Jahr den richtigen Zeitraum.
