# Backend Subsystems — Component View (C4 Level 3)

Dieses Dokument ist der **C4 Level-3 (Komponenten-) Begleiter** zur zentralen Architektur-Dokumentation [`architecture.md`](./architecture.md).

Während die Building Block View in `architecture.md` das Gesamtsystem auf Container- und Paketebene (Level 1 und 2) umreißt, zoomt dieses Dokument in jedes **Backend-Subsystem in Isolation** und beschreibt dessen innere Struktur und Verdrahtung unter `apps/api/src/`.

---

## Architektur-Vertrag der Subsysteme

Jedes Subsystem in Steuereule unterliegt denselben strengen Architektur-Garantien:

1. **Echtes Modul-Scoping & Tenant-Isolation:**
   Jeder Controller sitzt hinter `UserContextGuard` bzw. `RequiresAccountGuard`. Das Scoping auf `userId` und `Steuerjahr` wird serverseitig garantiert — kein Client kann Daten fremder Mandanten adressieren oder manipulieren.
2. **Delegation an den deterministischen Kern (`@steuereule/core`):**
   Kein Controller und kein Service erfindet steuerliche Berechnungen oder Tarife. Sämtliche Beträge, Tarife (§ 32a EStG), Freibeträge, AfA-Sätze, Besteuerungsanteile und Verjährungsfristen werden von rein funktionalen, zustandslosen Funktionen in `@steuereule/core` berechnet ([ADR-0005](adr/0005-deterministic-core-llm-assist.md)). Der Kern ist streng in fünf Schichten unterteilt (`math/`, `engine/`, `domains/`, `interview/`, `common/`) und wird durch automatisierte Architektur-Linter (`architecture.test.ts`) gegen zyklische Abhängigkeiten geschützt.
3. **Feldverschlüsselung im Ruhezustand (Encryption at Rest, [ADR-0008](adr/0008-keine-erfundenen-daten.md)):**
   Alle steuerlichen Werte, Stammdaten und PII werden vor dem Schreiben in PostgreSQL über AES-256-GCM verschlüsselt. In der Datenbank stehen ausschließlich Chiffre-Texte mit zufälligem Nonce.
4. **Enge Vendor-Seams (Ports & Adapters):**
   Externe Drittanbieter (Stripe, Brevo, Openrouteservice, Google Gemini, HIBP) werden ausschließlich über schmale Provider-Interfaces angesprochen. Kein Domänencode importiert Vendor-Typen.

### Diagramm-Legende (Shared Mermaid `classDef`)
* **ctrl** (Blau): HTTP Controller Surface (`apps/api/src/<modul>/*.controller.ts`)
* **svc** (Grün): Orchestrierung & Business-Service (`apps/api/src/<modul>/*.service.ts`)
* **core** (Orange): Reine, zustandslose Kernlogik (`packages/core/src/*.ts`)
* **db** (Grau): PostgreSQL Tabellen & Prisma Repositories
* **port** / **adapter** (Lila): Externe Provider-Seams (Stripe, Brevo, KI, ORS)

---

## 1. Cockpit & Tax Estimate Subsystem

Das `cockpit`- und `tax-estimate`-Subsystem verwaltet den aktuellen Erklärungsstand, die offenen Pflichtpunkte und die Spanne der vorläufigen Steuererstattung.

```mermaid
flowchart TD
  classDef ctrl fill:#e3f0ff,stroke:#2b6cb0,color:#1a365d;
  classDef svc fill:#eef7ee,stroke:#38a169,color:#1c4532;
  classDef core fill:#fff5e6,stroke:#dd6b20,color:#7b341e;
  classDef db fill:#f0f0f5,stroke:#718096,color:#2d3748;

  CockpitCtrl["CockpitController\nGET /v1/steuerjahre/:jahr/cockpit"]:::ctrl
  EstimateCtrl["TaxEstimateController\nGET /v1/steuerjahre/:jahr/schaetzung"]:::ctrl

  CockpitSvc["CockpitService"]:::svc
  EstimateSvc["TaxEstimateService"]:::svc

  CoreCalc["@steuereule/core\nberechneErstattung()\nTaxYearParameters"]:::core
  CoreRange["@steuereule/core\ncockpitSpanne()"]:::core

  PrismaTax["Prisma\nTaxYear, LstbData,\nPensionData, RentalObject"]:::db

  CockpitCtrl --> CockpitSvc
  EstimateCtrl --> EstimateSvc

  CockpitSvc --> EstimateSvc
  CockpitSvc --> PrismaTax
  EstimateSvc --> PrismaTax
  EstimateSvc --> CoreCalc
  EstimateSvc --> CoreRange
```

---

## 2. Interview & Minimal-Gate Subsystem

Das `interview`-Subsystem steuert das dynamische Drei-Fragen-Minimal-Gate und den On-Demand-Lebenslagen-Katalog ([ADR-0031](adr/0031-the-interview-is-three-questions-and-a-catalog.md), [ADR-0045](adr/0045-value-first-funnel.md)).

```mermaid
flowchart TD
  classDef ctrl fill:#e3f0ff,stroke:#2b6cb0,color:#1a365d;
  classDef svc fill:#eef7ee,stroke:#38a169,color:#1c4532;
  classDef core fill:#fff5e6,stroke:#dd6b20,color:#7b341e;
  classDef db fill:#f0f0f5,stroke:#718096,color:#2d3748;

  InterviewCtrl["InterviewController\nGET /v1/steuerjahre/:jahr/interview\nPOST /v1/steuerjahre/:jahr/interview/antworten"]:::ctrl

  InterviewSvc["InterviewService\n(Transaktions-Queue & Re-Entry)"]:::svc

  CoreGraph["@steuereule/core\nInterviewGraph\nQUESTIONS, isReachable()"]:::core

  PrismaInterview["Prisma (AES-256-GCM)\nInterviewAnswer, TaxYear"]:::db

  InterviewCtrl --> InterviewSvc
  InterviewSvc --> CoreGraph
  InterviewSvc --> PrismaInterview
```

---

## 3. LStB & Pendler-Subsystem

Verwaltet Lohnsteuerbescheinigungen, Werbungskosten, Entfernungspauschale und Homeoffice-Tage.

```mermaid
flowchart TD
  classDef ctrl fill:#e3f0ff,stroke:#2b6cb0,color:#1a365d;
  classDef svc fill:#eef7ee,stroke:#38a169,color:#1c4532;
  classDef core fill:#fff5e6,stroke:#dd6b20,color:#7b341e;
  classDef db fill:#f0f0f5,stroke:#718096,color:#2d3748;
  classDef port fill:#f3e8ff,stroke:#7e22ce,color:#581c87;

  LstbCtrl["LstbController\nGET/PUT /v1/steuerjahre/:jahr/lstb"]:::ctrl
  CommuteCtrl["CommuteController\nPOST /v1/steuerjahre/:jahr/pendler/distanz"]:::ctrl

  LstbSvc["LstbService"]:::svc
  CommuteSvc["CommuteService"]:::svc

  CoreEmployee["@steuereule/core\nvalidateLstb()\nTaxYearParameters (Freibetrag)"]:::core
  CoreWorkdays["@steuereule/core\ncalculateCommuteDeduction()"]:::core

  OrsAdapter["OpenrouteserviceAdapter\n(Distanzmatrix-Port)"]:::port
  PrismaLstb["Prisma (AES-256-GCM)\nLstbData, WorkdayData"]:::db

  LstbCtrl --> LstbSvc
  CommuteCtrl --> CommuteSvc

  LstbSvc --> CoreEmployee
  LstbSvc --> PrismaLstb
  CommuteSvc --> OrsAdapter
  CommuteSvc --> CoreWorkdays
```

---

## 4. Grenzgänger Schweiz (CH-Vertikale)

Abwicklung von Schweizer Lohnausweisen, 60-Tage-Regel nach Art. 15a DBA-CH und amtlicher CHF-Währungsumrechnung.

```mermaid
flowchart TD
  classDef ctrl fill:#e3f0ff,stroke:#2b6cb0,color:#1a365d;
  classDef svc fill:#eef7ee,stroke:#38a169,color:#1c4532;
  classDef core fill:#fff5e6,stroke:#dd6b20,color:#7b341e;
  classDef db fill:#f0f0f5,stroke:#718096,color:#2d3748;

  ChCtrl["ChSalaryCertificateController\nGET/PUT /v1/steuerjahre/:jahr/ch-lohnausweis"]:::ctrl

  ChSvc["ChSalaryCertificateService"]:::svc

  CoreCh["@steuereule/core\ngrenzgaengerStatus()\nchPostenAlsKernposten()"]:::core
  CoreEx["@steuereule/core\numrechnenChfEur()\nBMF_REFERENZKURSE"]:::core

  PrismaCh["Prisma (AES-256-GCM)\nChSalaryCertificate"]:::db

  ChCtrl --> ChSvc
  ChSvc --> CoreCh
  ChSvc --> CoreEx
  ChSvc --> PrismaCh
```

---

## 5. Renten, Kapital & Vermietung Subsysteme

Die spezialisierten Einkunftsarten für Rentner (§ 22 EStG), Kapitalanleger (§ 20 EStG) und Vermieter (§ 21 EStG / lineare AfA § 7 Abs. 4 EStG).

```mermaid
flowchart TD
  classDef ctrl fill:#e3f0ff,stroke:#2b6cb0,color:#1a365d;
  classDef svc fill:#eef7ee,stroke:#38a169,color:#1c4532;
  classDef core fill:#fff5e6,stroke:#dd6b20,color:#7b341e;
  classDef db fill:#f0f0f5,stroke:#718096,color:#2d3748;

  PensionCtrl["PensionController\n/v1/.../rente"]:::ctrl
  CapitalCtrl["CapitalController\n/v1/.../kapital"]:::ctrl
  RentalCtrl["RentalController\n/v1/.../vermietung"]:::ctrl

  PensionSvc["PensionService"]:::svc
  CapitalSvc["CapitalService"]:::svc
  RentalSvc["RentalService"]:::svc

  CorePension["@steuereule/core\nbesteuerungsanteil()\nertragsanteil()"]:::core
  CoreCapital["@steuereule/core\nguenstigerpruefungKapital()\nSparerpauschbetrag"]:::core
  CoreRental["@steuereule/core\nlineareAfaSatz()\nvalidateRentalObject()"]:::core

  PrismaSub["Prisma (AES-256-GCM)\nPensionData, CapitalData, RentalObject"]:::db

  PensionCtrl --> PensionSvc
  CapitalCtrl --> CapitalSvc
  RentalCtrl --> RentalSvc

  PensionSvc --> CorePension
  CapitalSvc --> CoreCapital
  RentalSvc --> CoreRental

  PensionSvc --> PrismaSub
  CapitalSvc --> PrismaSub
  RentalSvc --> PrismaSub
```

---

## 6. Freischaltung & Zahlungs-Subsystem (Stripe)

Rechtssicherer Verkauf des Formular-Ausdrucks pro Steuerjahr mit HMAC-geprüften Webhooks und Widerrufs-Zustimmung (§ 356 Abs. 5 BGB).

```mermaid
flowchart TD
  classDef ctrl fill:#e3f0ff,stroke:#2b6cb0,color:#1a365d;
  classDef svc fill:#eef7ee,stroke:#38a169,color:#1c4532;
  classDef db fill:#f0f0f5,stroke:#718096,color:#2d3748;
  classDef port fill:#f3e8ff,stroke:#7e22ce,color:#581c87;

  CheckoutCtrl["UnlockController\nPOST /v1/.../ausdruck/checkout\nGET /v1/.../freischaltung"]:::ctrl
  WebhookCtrl["PaymentWebhookController\nPOST /v1/zahlung/stripe/webhook"]:::ctrl

  UnlockSvc["UnlockService"]:::svc
  StripeProvider["StripePaymentProvider\n(verifyWebhookSignature, createSession)"]:::port

  PrismaUnlock["Prisma\nFreischaltung, TaxYear"]:::db

  CheckoutCtrl --> UnlockSvc
  WebhookCtrl --> UnlockSvc
  UnlockSvc --> StripeProvider
  UnlockSvc --> PrismaUnlock
```

---

## 7. Formular-Ausdruck Pipeline (Printout)

Schreibt die berechneten Daten exakt an die vermessenen Positionen der amtlichen BMF-NET-Vordrucke ([ADR-0050](adr/0050-papierweg-statt-elster-in-1-0.md)). Unterstützt sowohl synchrones Streaming als auch eine entkoppelte asynchrone Job-Queue ([ADR-0056](adr/0056-asynchronous-pdf-generation-job-queue.md)).

```mermaid
flowchart TD
  classDef ctrl fill:#e3f0ff,stroke:#2b6cb0,color:#1a365d;
  classDef svc fill:#eef7ee,stroke:#38a169,color:#1c4532;
  classDef core fill:#fff5e6,stroke:#dd6b20,color:#7b341e;
  classDef db fill:#f0f0f5,stroke:#718096,color:#2d3748;

  PrintoutCtrl["PrintoutController\nGET /v1/.../ausdruck\nGET /v1/.../ausdruck/pruefung\nPOST /v1/.../ausdruck/async\nGET /v1/.../ausdruck/jobs/:jobId"]:::ctrl

  PrintoutSvc["PrintoutService\n(Vorprüfung & Datenassemblierung)"]:::svc
  PrintoutJobSvc["PrintoutJobService\n(Asynchrone Worker-Queue & Status)"]:::svc

  Renderer["FormRenderer\n(pdf-lib Engine)"]:::svc
  FieldSets["FIELD_SETS\n(felder-<jahr>.json)"]:::core
  Templates["assets/vordrucke/<jahr>/\n(Amtliche BMF NET-PDFs)"]:::db

  PrintoutCtrl --> PrintoutSvc
  PrintoutCtrl --> PrintoutJobSvc
  PrintoutJobSvc --> PrintoutSvc
  PrintoutSvc --> Renderer
  Renderer --> FieldSets
  Renderer --> Templates
```

---

## 8. Eulen-Modus (KI-Assistent) & MCP-Server

Sichere KI-Beratung mit PII-Maskierung und Rollback-Mechanismus ([ADR-0051](adr/0051-eulen-ki-modus.md), [ADR-0052](adr/0052-mcp-ki-assistent.md)).

```mermaid
flowchart TD
  classDef ctrl fill:#e3f0ff,stroke:#2b6cb0,color:#1a365d;
  classDef svc fill:#eef7ee,stroke:#38a169,color:#1c4532;
  classDef core fill:#fff5e6,stroke:#dd6b20,color:#7b341e;
  classDef db fill:#f0f0f5,stroke:#718096,color:#2d3748;
  classDef port fill:#f3e8ff,stroke:#7e22ce,color:#581c87;

  AdvisorCtrl["AdvisorController\nPOST /v1/advisor/chat\nPOST /v1/advisor/undo"]:::ctrl
  McpCtrl["McpController\n/mcp/sse, /mcp/messages"]:::ctrl

  AdvisorSvc["AdvisorService\n(Session & Context Manager)"]:::svc
  McpSvc["McpService\n(6 gesicherte Fach-Tools)"]:::svc

  PiiMask["@steuereule/core\nmaskPii(), unmaskPii()"]:::core
  GeminiAdapter["GoogleGeminiAdapter\n(LLM Provider Port)"]:::port

  PrismaAdvisor["Prisma (AES-256-GCM)\nAdvisorSession, AuditLog"]:::db

  AdvisorCtrl --> AdvisorSvc
  McpCtrl --> McpSvc

  AdvisorSvc --> GeminiAdapter
  AdvisorSvc --> McpSvc
  McpSvc --> PiiMask
  AdvisorSvc --> PrismaAdvisor
```

---

## 9. DSGVO & Kontoverwaltung Subsystem

Garantiert die Einhaltung von Art. 15/20 (Datenexport) und Art. 17 (Recht auf Vergessenwerden) über DMMF-gestützte Deckungstests.

```mermaid
flowchart TD
  classDef ctrl fill:#e3f0ff,stroke:#2b6cb0,color:#1a365d;
  classDef svc fill:#eef7ee,stroke:#38a169,color:#1c4532;
  classDef db fill:#f0f0f5,stroke:#718096,color:#2d3748;

  AccountCtrl["AccountController\nDELETE /v1/account\nGET /v1/account/export"]:::ctrl

  AccountSvc["AccountService"]:::svc
  ExportRepo["TaxDataExportRepository\n(Entschlüsselung aller Tabellen)"]:::svc
  AuditRepo["AuditRepository\n(Unveränderliches Audit-Log)"]:::svc

  PrismaAll["Prisma Database Engine\n(Atomare $transaction über alle Tabellen)"]:::db

  AccountCtrl --> AccountSvc
  AccountSvc --> ExportRepo
  AccountSvc --> AuditRepo
  AccountSvc --> PrismaAll
```

---

## 10. Observability, Tracing & Resilience Subsystem

Sichert Systemzuverlässigkeit, Tracing und Fault Isolation gemäß [SRE Reliability Spec](sre/reliability-spec.md).

```mermaid
flowchart TD
  classDef ctrl fill:#e3f0ff,stroke:#2b6cb0,color:#1a365d;
  classDef svc fill:#eef7ee,stroke:#38a169,color:#1c4532;
  classDef port fill:#f3e8ff,stroke:#7e22ce,color:#581c87;
  classDef db fill:#f0f0f5,stroke:#718096,color:#2d3748;

  ReqMiddleware["Fastify genReqId / onSend\n(W3C traceparent, x-request-id)"]:::ctrl
  ErrorFilter["DomainErrorFilter\n(Embeds requestId in error response)"]:::ctrl

  TracerModule["OpenTelemetry Tracer\n(withSpan helper)"]:::svc
  EstimateSpan["TaxEstimateService\n(Span: tax_estimate.calculate)"]:::svc

  CloudTrace["Google Cloud Trace / Monitoring\n(Distributed Traces)"]:::port
  PrismaPool["Prisma Connection Pool\n(Circuit Breaker / Transient Recovery)"]:::db

  ReqMiddleware --> ErrorFilter
  EstimateSpan --> TracerModule
  TracerModule --> CloudTrace
  ErrorFilter -.-> PrismaPool
```
