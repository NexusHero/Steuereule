# ADR-0080 — Spendenbestätigungen addieren, Schweizer Krankenkassen-Auszüge lesen

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/domains/{donation-receipt,ch-health-statement,document-kind}.ts`, `packages/core/src/interview/{advisor,owl-mode}.ts`, `apps/api/src/receipt/parse/auto-receipt-parse.strategy.ts`, `apps/api/src/ch-certificate-scan/ch-health-statement.parse-strategy.ts`, `apps/api/src/advisor/advisor.service.ts`
- **Baut auf:** ADR-0074/0075 (Schweizer Unterlagen lesen), ADR-0076 und ADR-0078 (Belege addieren sich)

## Kontext

Im Echtfall 2024 kam die App nur auf einen Bruchteil der Spenden: Jede Bestätigung ersetzte die vorige. Einfaches
Addieren wäre aber auch falsch gewesen. Eine Spende stand mit derselben Buchungsnummer in der gemeinsamen
Sammelbestätigung und in der eigenen Bestätigung eines Partners, und eine dritte Bestätigung war eine Zweitschrift.
Die Auszüge der Schweizer Krankenkassen las nur das Modell, ohne Zuordnung zu Kind oder Kassenwechsel.

## Entscheidung

1. **Spenden als Posten.** Ein fester Leser zerlegt eine Zuwendungsbestätigung in Posten: Buchungsnummer, wenn
   gedruckt, und immer Aussteller, Betrag und Jahr. Ein Posten gilt als schon gezählt, wenn die Buchungsnummer
   gleich ist oder, wenn eine Seite keine hat, Aussteller, Betrag und Jahr gleich sind. Neue Posten kommen zur
   Summe dazu, schon gezählte nicht, und die Eule sagt das. Das Jahr ist das Jahr der Zuwendung, nicht das Datum
   der Bestätigung.
2. **Krankenkassen-Auszug als eigene Unterlage** (`chKrankenkasse`). Gelesen wird die Prämie der
   Grundversicherung je versicherter Person, bei Helsana einzeln je Person, bei SWICA für die ganze Familie.
   Der Name entscheidet, wohin die Prämie gehört: zu Person A, zu Person B (jeweils `krankenkasseChf`) oder zu
   einem Kind (`healthBasicEur`, Anlage Kind Kz 66, in Euro zum Kurs des Lohnausweises). Bei mehreren
   passenden Personen gewinnt die mit den meisten Namen; bei Gleichstand bleibt es offen. Ohne Wechselkurs gibt
   es für das Kind keinen Entwurf, nur einen Hinweis.
3. **Kassenwechsel addiert, derselbe Auszug nicht.** Eine zweite Kasse im Jahr kommt zur ersten dazu. Derselbe
   Auszug noch einmal zählt nicht.
4. **Gezählte Posten am Entwurf.** Jeder Entwurf trägt seine gezählten Posten nur als Hash. Sie bleiben auf dem
   Server und gehen nie an den Client. Ein Hash beginnt mit einer Ziffer, damit die IBAN-Sperre ihn nicht für
   eine IBAN hält.
5. **Rechtsquelle `estg-10-1-3`** (Basis-Krankenversicherung).

## Folgen

- Echtfall 2024: Spenden wie beim Steuerberater, in jeder Upload-Reihenfolge; die Krankenkassenprämien beider Partner wie beim
  Steuerberater.
- Echtfall 2025: Spenden wie beim Steuerberater; die Bestätigung für 2024 landet in 2024. Bei der Krankenkasse rechnet die App
  beide Kassen des Jahres; der Steuerberater hat nur die erste angesetzt (offene Frage an ihn).
- Selbst getragene Krankheitskosten aus dem Auszug nennt die Eule nur als Hinweis. Sie gehören zu den
  Krankheitskosten (§ 33) und werden nicht automatisch übernommen.
