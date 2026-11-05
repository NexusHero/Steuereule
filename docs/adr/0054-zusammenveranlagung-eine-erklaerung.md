# ADR-0054 — Zusammenveranlagung: eine gemeinsame Erklärung, Person A erfasst für Person B mit

- **Status:** Accepted (Stakeholder-Entscheidung 2026-11-05, Grilling nach dem 4-Personen-Testlauf)
- **Date:** 2026-11-05
- **Deciders:** NexusHero (Stakeholder)
- **Amends** [ADR-0050](0050-papierweg-statt-elster-in-1-0.md) (Ausdruck, Freischaltung pro Steuerjahr)
- **Context tags:** product scope, data model, payment, test gate

## Context

Der Testlauf vom 05.11.2026 mit vier Personen hat gezeigt, dass Ehepaare in der App keine
abgabefähige Erklärung bekommen:

1. **Kopplung nur für das aktuelle Jahr.** Die Zusammenveranlagung lässt sich nur für das laufende
   Jahr einstellen (`CURRENT_TAX_YEAR`), nicht für das gewählte Steuerjahr.
2. **Kein Weg, die Einladung anzunehmen.** Person B kann den Einladungscode in der App nirgends
   einlösen.
3. **Zwei Erklärungen statt einer.** Jedes Konto druckt eine eigene ESt 1 A und führt sich selbst
   als Person A. Die Einkünfte des Partners fehlen in beiden Erklärungen.
4. **Kein Platz für Bs Einkünfte ohne Konto.** Hat Person B kein eigenes Konto, gibt es keinen Ort
   für ihre Einkünfte.
5. **Schätzung rechnet als ledig.** Sie fragt den Familienstand nicht ab und rechnet Verheiratete
   als ledig, bis die Stammdaten ausgefüllt sind.

Drei der vier Testszenarien (Grenzgänger-Ehepaar mit Kindern, Ehefrau als Grenzgängerin,
DE-Ehepaar mit Immobilien und Kapital) sind dadurch nicht bestehbar.

## Decision

1. **Eine Erklärung je Paar und Steuerjahr, gedruckt von Person A.** Das PDF enthält
   - die ESt 1 A,
   - die Anlagen von A,
   - die Anlagen von B (N, N-Gre, Vorsorgeaufwand, KAP, V mit Personenkennzeichnung),
   - die Anlage Kind mit Kindschaftsverhältnis zu A und B.

   Person B sieht die Erklärung nur lesend. Die Freischaltung gilt einmal je Paar und Jahr.
2. **Person A erfasst für Person B mit.** Für B gibt es dieselben Masken wie für A:
   Lohnsteuerbescheinigung bzw. CH-Lohnausweis, Arbeitsweg, Vorsorge. Die Daten liegen in einem
   eigenen Datensatz für B. Sobald B ein Konto über den Einladungscode verknüpft, pflegt B diese
   Daten selbst, und A sieht sie nur noch lesend.
3. **Kopplung pro Steuerjahr.** Jeder Screen arbeitet mit dem gewählten Steuerjahr, nie mit
   `CURRENT_TAX_YEAR`. Für das Einlösen des Einladungscodes gibt es einen eigenen Screen.
4. **Zuordnung von Kapital und Immobilien.**
   - Je Depot: gehört A, B oder beiden.
   - Je Vermietungsobjekt: Miteigentumsanteil in Prozent, Vorgabe 50/50.
5. **Familienstand im Minimal-Gate.** Er ist die vierte Frage nach den Kindern. Die Stammdaten
   übernehmen den Wert. Die Schätzung rechnet Verheiratete nie mehr als ledig. Sie nutzt
   - den Splittingtarif,
   - die Günstigerprüfung Kindergeld gegen Kinderfreibetrag,
   - die Kirchensteuer als Spanne,
   - Kapital mit Günstigerprüfung und Vermietung als Einkünfte.
6. **Abnahme über die vier Testszenarien.**
   - Die Szenarien aus dem Testlauf werden ein Playwright-Test, der komplett durch die
     Oberfläche läuft.
   - Er läuft bei jedem PR und muss vor dem Merge grün sein.
   - Die Sollwerte liegen als Fixtures im Repo:
     - Einkommensteuer, Soli und Kirchensteuer aus dem BMF-Einkommensteuerrechner,
     - die Zeilen für N-Gre, AfA und Pendlerpauschale als dokumentierte Handrechnung.

## Consequences

- **Datenmodell:** Eingaben, die heute an `userId` hängen (LStB, Lohnausweis, Arbeitsweg,
  Vorsorge), bekommen eine Personenrolle (A/B) innerhalb der Kopplung. Die Löschung des Kontos, der
  DSGVO-Export und die Liste der verschlüsselten Felder müssen den B-Datensatz abdecken.
- **Abschluss des Ausdrucks:** Der Ausdruck wird erst abgeschlossen, wenn auch Bs Pflichtfelder
  vollständig sind.
- **Dauer der Pipeline:** Der Abnahmetest verlängert jeden PR. Dafür fallen Lücken wie ein
  fehlender Screen sofort auf und nicht erst im manuellen Testlauf.
- **Abgrenzung:**
  - Getrennte Veranlagung (§ 26a EStG) und ein automatischer Vergleich Einzel- gegen
    Zusammenveranlagung sind nicht Teil dieser Entscheidung.
  - Verluste aus Kapitalvermögen und Krypto bleiben ehrlich „nicht unterstützt“.
