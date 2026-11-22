# ADR-0102 — Ports & Adapters: die Grenzen in `apps/api` erzwingt der Linter

- **Status:** Accepted
- **Date:** 2026-11-22
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `.oxlintrc.json`, `apps/api/src/**`, `apps/api/src/ki/single-shot-model.ts`, `apps/api/src/auth/bearer-token.repository*.ts`, `docs/architecture.md` §4.1
- **Baut auf:** ADR-0038 (deterministischer Kern und KI-Port), ADR-0008 (Feldverschlüsselung), ADR-0019 (oxlint statt ESLint), ADR-0021 (Kontrollen werden durch Brechen bewiesen), ADR-0052 (Agenten-Zugang per OAuth)

## Kontext

Steuereule ist als Ports & Adapters (hexagonale Architektur) gebaut: ein reiner Rechenkern `@steuereule/core`, Anwendungsservices in `apps/api`, und an deren Rand Adapter für HTTP, Datenbank, Sprachmodelle, Zahlung und Mail. Der Kern war durch `packages/core/src/architecture.test.ts` geschützt, der Rand in `apps/api` nur durch Konvention.

Eine Prüfung am 2026-11-22 fand drei Brüche dieser Konvention:

1. Drei Dokument-Parser (`receipt/parse/auto-receipt-parse.strategy.ts`, `lstb-scan/lstb-scan.parse-strategy.ts`, `ch-certificate-scan/ch-certificate-scan.parse-strategy.ts`) importierten `BaseChatModel`, `HumanMessage` und `SystemMessage` aus LangChain. ADR-0038 legt LangChain aber hinter den KI-Port.
2. `auth/user-context.guard.ts`, der einzige Ort, der die `userId` einer Anfrage festlegt, las `oauthClient`, `oauthConsent` und `oauthAccessToken` direkt über `PrismaService`.
3. Der Port `account/account-deletion.repository.ts` importierte seinen Ergebnistyp aus dem Prisma-Adapter. Damit zeigte die Abhängigkeit vom Port zum Adapter.

Keiner der drei Brüche war ein Fehler im Verhalten. Jeder einzelne macht aber den nächsten billiger. Ein Review findet solche Brüche nur zufällig, eine Maschine findet sie immer.

## Ziele

- Ein Fachmodul in `apps/api` kann kein Vendor-SDK und keinen Datenbank-Client importieren, ohne dass `pnpm lint` rot wird.
- Jede Ausnahme steht als Dateipfad in einer Datei, `.oxlintrc.json`, und ist im Review sichtbar.
- Die Regel kostet nichts zur Laufzeit und läuft im bestehenden Lint-Schritt, ohne neues Werkzeug.

## Nicht-Ziele

- **Modulgrenzen zwischen Fachmodulen.** Services rufen sich gegenseitig auf (`audit.service` hat 34 Importeure, `link.service` 23). Das ist Kopplung innerhalb des Anwendungsrings, kein Verstoß gegen Ports & Adapters, und bleibt ein eigenes Thema.
- **Die Richtung `domains` ↔ `interview` im Kern.** Der Kern-Test prüft `math`, `common` und `engine → interview`. Welche Richtung zwischen `domains` und `interview` gewollt ist, ist noch nicht entschieden.
- **Tests.** Die Regel gilt für `apps/api/src/**`. Tests dürfen Adapter und SDKs direkt bauen, um sie zu prüfen.

## Entscheidung

### 1. Vier Gruppen verbotener Importe

`eslint/no-restricted-imports` in `.oxlintrc.json`, als `overrides` je Dateigruppe:

| Gruppe | Muster | Erlaubt nur in |
|---|---|---|
| Persistenz | `@prisma/**`, `@prisma-keystore/**`, `prisma-field-encryption`, `**/prisma/prisma.service*` | `**/*.prisma.ts`, `src/prisma/**`, `**/*.module.ts` (Verdrahtung), `config/assert-database-*.ts`, `config/database-url.ts`, `auth/better-auth.ts`, `health/pooled-database-reachability-check.ts`, `receipt/storage/postgres-bytea-storage.adapter.ts` |
| Sprachmodell | `@langchain/**` | `src/ki/**` |
| Zahlung | `stripe` | `unlock/stripe-payment-provider.ts` |
| Mail | `nodemailer` | `auth/smtp-email-sender.ts` |

Die Override-Reihenfolge ist wichtig: Spätere Einträge ersetzen frühere. Jeder Adapter-Eintrag nimmt deshalb nur seine eigene Gruppe aus und verbietet die drei anderen weiter. Ein Prisma-Adapter darf also kein LangChain importieren, und `src/ki/**` kein Prisma.

### 2. Namenskonvention: ein Adapter sagt, was er ist

Eine Datei, die einen Prisma-Client hält, endet auf `.prisma.ts`. Deshalb heißen `account/delete-account-transaction.ts` und `auth/guest-account-upgrade.ts` jetzt `*.prisma.ts`. Beide sind Transaktionen über mehrere Tabellen, also Adapter, die keinen weiteren Port brauchen. Die Endung ist zugleich die Ausnahme in der Lint-Regel. Ein neuer Adapter braucht also keinen neuen Eintrag in der Liste.

### 3. Neuer Port `SingleShotModel` (`src/ki/single-shot-model.ts`)

Die drei Parser brauchen dasselbe: einen Systemprompt, eine Nutzernachricht, Text zurück, abbrechbar per `AbortSignal`. Kein Verlauf, keine Werkzeuge, kein Streaming. Der Port bildet genau das ab:

```ts
interface SingleShotModel {
  complete(prompt: { system: string; user: string }, options: { signal: AbortSignal }): Promise<string>
}
type SingleShotModelFactory = (config: ResolvedAiSlotConfig) => SingleShotModel | null
```

Der Adapter `langchain-single-shot.adapter.ts` setzt ihn auf die bestehende `createChatModelFromConfig` (Anthropic, OpenAI, Google GenAI, das Fake-Modell für CI). `KiModule` stellt die Factory unter `SINGLE_SHOT_MODEL_FACTORY` bereit und exportiert sie. Die Parser injizieren sie **ohne** `@Optional()`. Fehlt die Verdrahtung, bricht Nest deshalb schon beim Start ab und fällt nicht still auf „kein Modell“ zurück. Außerhalb von Nest, in Unit-Tests, ist der Standardwert `noSingleShotModel`, also der deterministische Weg.

Den bestehenden `KiPort` aus dem Kern (`packages/core/src/interview/ki-port.ts`) haben wir bewusst nicht erweitert. Er beschreibt fachliche Fähigkeiten (Vorschlag aus Beleg, Quelle erklären, Beraterrunde). Ein generischer Prompt-Aufruf gehört nicht in den Kern, weil der Kern dann von der Existenz eines Sprachmodells wüsste.

### 4. Neuer Port `BearerTokenRepository` (`src/auth/bearer-token.repository.ts`)

Der Guard braucht drei Lesezugriffe: das opake Token über seinen Hash, den OAuth-Client, und ob die Zustimmung des Nutzers noch besteht. Der Port gibt eigene Typen zurück (`OpaqueAccessToken`, `AssistantClient`), keine Prisma-Zeilen. `disabled: boolean | null` aus dem Schema wird im Adapter zu `boolean`. Der Guard entscheidet weiter allein: abgelaufen, widerrufen, Client gesperrt, keine Zustimmung. Das Repository schlägt nur nach.

### 5. Ports besitzen ihre Typen

Ein Ergebnistyp, den ein Port zurückgibt, steht im Port. `DeleteAccountResult` ist deshalb von `delete-account-transaction.prisma.ts` nach `account-deletion.repository.ts` gezogen, und der Adapter importiert ihn von dort.

## Betrachtete Alternativen

| Alternative | Warum nicht |
|---|---|
| **dependency-cruiser** | Mächtiger (Zyklen, Modulgraph, Visualisierung), aber ein weiteres Werkzeug mit eigener Konfigurationssprache und eigenem CI-Schritt. Für vier Importgruppen reicht der Linter, den wir schon haben (ADR-0019). Wenn wir später Modulgrenzen *zwischen* Fachmodulen erzwingen wollen, ist dependency-cruiser der nächste Schritt. |
| **Ein Architekturtest wie im Kern** (`architecture.test.ts` mit Regex über Importe) | Funktioniert, aber jede Regel ist selbst geschriebener Parser-Code. Der Linter versteht `import type`, `export … from` und dynamische `import()`-Pfade bereits. Und er meldet die Stelle mit Zeile und Hilfetext direkt im Editor. |
| **Nur Review und Doku** | Das war der bisherige Stand. Die Prüfung hat gezeigt, dass er nicht hält. |
| **Fachmodule bekommen einen eigenen LangChain-freien `KiPort` im Kern** | Siehe Entscheidung 3: Der Kern soll nicht wissen, dass es Prompts gibt. |

## Konsequenzen

- **Positiv:** Ein neuer Verstoß wird beim Commit rot, mit einem Hilfetext, der den richtigen Port nennt. Die Doku kann die Grenzen jetzt als *geprüft* bezeichnen statt als *gewollt*.
- **Positiv:** Der Parser-Code ist kleiner: Er baut keine Message-Objekte mehr und ruft `extractMessageText` nicht mehr auf, das erledigt der Adapter.
- **Negativ:** Die Ausnahmeliste für Infrastruktur-Dateien (`config/`, `health/`, `auth/better-auth.ts`) ist eine Pfadliste. Verschiebt jemand eine dieser Dateien, wird der Linter rot, bis die Liste nachgezogen ist. Das ist gewollt: Eine Ausnahme soll im Diff auffallen.
- **Negativ:** `**/*.module.ts` ist pauschal ausgenommen, weil die Nest-Module die Verdrahtung sind (Composition Root). Ein Modul könnte deshalb Fachlogik mit Prisma enthalten, ohne dass der Linter es merkt. Das fällt im Review auf, weil Module in diesem Repo nur Provider-Listen enthalten.

## Nachweis (ADR-0021)

Die Regel ist durch Brechen bewiesen. Am 2026-11-22 lagen dafür Probe-Dateien in `src/zz-probe/probe.service.ts`, `src/zz-probe/probe.prisma.ts` und `src/ki/zz/probe.ts`, die alle vier Gruppen importierten:

| Datei | Prisma | LangChain | Stripe | nodemailer |
|---|---|---|---|---|
| `probe.service.ts` | rot | rot | rot | rot |
| `probe.prisma.ts` | erlaubt | rot | rot | rot |
| `ki/zz/probe.ts` | rot | erlaubt | rot | rot |

Ein erster Versuch mit dem Muster `@langchain/*` ließ `@langchain/core/messages` durch, weil `*` nur ein Pfadsegment abdeckt. Deshalb steht jede Paketgruppe zusätzlich als `/**` in der Regel. Nach dem Entfernen der Probe-Dateien ist `pnpm lint` grün.
