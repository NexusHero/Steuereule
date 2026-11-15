# ADR-0090 — Funde aus dem Echtfall-Lauf über den Strom (2024/2025)

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:**
  - `packages/core/src/{engine/married-estimate,domains/{lstb,n-gre,health-insurance,extraordinary-burdens},common/print-width,interview/{interview,field-catalog}}.ts`
  - `apps/api/src/{lstb,children,printout,tax-estimate,confirmation,ch-certificate-scan}/`
  - `apps/api/prisma/`
  - `apps/mobile-web/src/screens/{lstb,children,master-data,filing-type-comparison}/`
  - `e2e/forms/real-case-additions.mjs`
- **Baut auf:** ADR-0063 (Kirchensteuer-Zeilen der LStB), ADR-0066 (Feldkatalog der Eule), ADR-0079 (Wechseljahr), ADR-0080 (Schweizer KV-Auszug), ADR-0087/0088, ADR-0089 (Strom)

## Kontext

Der Echtfall eines verheirateten Grenzgänger-Haushalts lief für 2024 und 2025 nur über die App, mit dem neuen Strom. Die Ausdrucke erzeugte die App selbst. Erklärung und Bescheid des Beraters dienten erst danach als Vergleich. Der Lauf zeigte Fehler, Lücken und zwei fachliche Fragen. Die Fragen haben wir an der amtlichen Anleitung 2025 und an den Vordrucken geklärt.

## Entscheidung

1. **Veranlagungsvergleich auf der Abgabe-Seite.** Er beginnt beim bekannten Familienstand: Stammdaten oder Basis-Antwort. Bisher stand er immer auf „Nein“. Die beiden Knöpfe teilen sich die Zeile, statt aus der Karte zu ragen.
2. **zvE wie im Bescheid.** Bei Zusammenveranlagung meldet die Schätzung das zu versteuernde Einkommen nach den Freibeträgen für Kinder, wenn diese günstiger sind als das Kindergeld (§ 2 Abs. 5 EStG). Die Steuer selbst war schon richtig. Der Vergleich mit dem Bescheid ließ es aber so aussehen, als fehle der Kinderfreibetrag.
3. **Religion von Person B.** Das Partner-Formular fragt die Religion von B ab und speichert sie nur mit Einwilligung (Art. 9 DSGVO). Ohne diese Angabe blieb die Kirchensteuer der Zusammenveranlagung „offen“.
4. **LStB Zeile 24.** Die steuerfreien Arbeitgeberzuschüsse zur Kranken- und Pflegeversicherung (a–c, als Summe) sind eine optionale Zeile neben der Kirchensteuer: eigene Spalte, verschlüsselt, Endpunkt `lstb-zuschuesse`. Die Schätzung zieht sie vom Sozialversicherungsanteil ab, denn abziehbar ist nur, was der Arbeitnehmer getragen hat (§ 10 Abs. 2 Satz 1 Nr. 1 EStG). Die Eule kann Zeile 24 und die Kirchensteuer-Zeilen 6/7 jetzt auch schreiben.
5. **Erstattete Krankheitskosten.** Das Interview fragt die Kosten vor der Erstattung (Kz 302) und dazu, was Kasse, Versicherung oder Beihilfe erstattet haben (Kz 303, neue Frage `gesundheit-erstattung`). Abziehbar ist die Differenz, nie weniger als 0. Vorher musste der Nutzer selbst rechnen; im Echtfall ging das schief.
6. **Kita-Anbieter.** Das Feld nimmt nur so viel Text an, wie in die Zeile 67 der Anlage Kind passt, und sagt das. Gemessen wird in Helvetica 10 pt (`printedWidthPt`) und gegen die schmalere Box der Vordrucke 2024/2025. Ein Paritätstest gleicht die Breiten mit dem Renderer ab. Der Ausdruck lehnt einen zu langen Text deshalb nicht mehr erst nach der Bezahlung ab.
7. **N-Gre Zeile 82 bleibt.** Krankentaggeld und die halbe NBUV gehören laut Vordruck und ELSTER-Anleitung 2025 in Z. 80/81 (Summe Z. 82). Berater und Finanzamt haben sie weggelassen. Steuerlich wirken sie nicht, wenn die Basis-KV den Höchstbetrag von 2.800 € schon ausschöpft.
8. **Neu: die andere Hälfte der NBUV** zählt als Werbungskosten, N-Gre Z. 57/58 (Kz 380) und in der Schätzung. So sagt es die Anleitung zu Z. 97/98: Ein Nichtberufsunfall umfasst den Arbeitsweg.
9. **Schweizer KV des Kindes in Kz 89.** Ein Kind hat jetzt `healthInsuranceAbroad`. Ist es gesetzt, gehen KV und PV zusammen in die Anlage Kind, Kz 89 („ausländische Kranken- und Pflegeversicherung“, 2024 Z. 36, 2025 Z. 37), nicht in Kz 66/67. Der Schweizer KV-Auszug setzt die Angabe selbst, und die Eule kann sie schreiben.
10. **Kein doppeltes Zählen.** Eine im Interview als „ausländisch“ angegebene KV zählt nicht noch einmal, wenn die Grenzgänger-Maske schon eine Schweizer Kasse hat. Beides ist dieselbe Police.

Aus dem Vergleich Strom gegen Chat (sieben erfundene Haushalte) kamen hinzu:

11. **Lebenslagen im Ausdruck.** Bisher fehlten sie im PDF, und die Prüfung meldete nichts. Jetzt druckt die App:
    - Fortbildung: Anlage N Z. 60 bzw. N-Gre Z. 55, Kz 330.
    - Umzug: als weitere Werbungskosten, Kz 380.
    - Einkommensersatzleistungen: Hauptvordruck Z. 35, Kz 120 für A und Kz 121 für B.

    Für die Abfindung (Anlage N Z. 17/18, je nachdem, wie der Arbeitgeber sie besteuert hat) und die doppelte Haushaltsführung (eigene Anlage) gibt es noch keinen Ausdruck. Die Prüfung sagt das jetzt ausdrücklich, statt still zu drucken.
12. **Anlage Kind ohne Kind.** Nennt die Basis Kinder, ist aber keins erfasst, meldet die Prüfung „kinder“.
13. **LStB für B im Wechseljahr.** Arbeitet B in der Schweiz und zeigt Bs Arbeitsweg einen Jobwechsel (oder ist schon eine LStB erfasst), bietet das Cockpit auch Bs deutsche LStB an. Es ist dieselbe Regel wie für A im Strom (`hasGermanJobToo`).

## Folgen

- Im Echtfall 2025 stimmen die Krankenversicherung (Kassenwechsel Helsana → SWICA zum 1.7.) und Z. 82 der App. Berater und Finanzamt haben die SWICA-Hälfte und die KV des Kindes übersehen. Das ist ein Hinweis für einen Einspruch, kein App-Fehler.
- **E2E:** `real-case-additions` prüft die Zeilen B (Kita zu lang, Kasse im Ausland), G (Religion von B) und H (Zeile 24). `e2e/advisor/strom-vs-chat.mjs` vergleicht Strom und Chat je Haushalt (manuell, kostet Modellaufrufe).
- **Offen:**
  - Im Einzel-Pfad der Schätzung gibt es noch keine Günstigerprüfung für Alleinerziehende mit hohem Einkommen.
  - Im Strom steht Person B noch nicht (eigener PR).
