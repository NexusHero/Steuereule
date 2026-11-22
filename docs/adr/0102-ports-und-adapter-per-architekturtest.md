# ADR-0102 — Ports & Adapters: zwei Architekturtests erzwingen die Grenzen

- **Status:** Accepted
- **Date:** 2026-11-22
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/test/architecture.test.ts`, `apps/api/test/architecture-module-edges.json`, `packages/core/src/architecture.test.ts`, `apps/api/src/ki/single-shot-model.ts`, `apps/api/src/auth/bearer-token.repository*.ts`, `apps/api/src/common/transaction-runner.ts`, `docs/architecture.md` §4.1
- **Baut auf:** ADR-0038 (deterministischer Kern und KI-Port), ADR-0008 (Feldverschlüsselung), ADR-0021 (Kontrollen werden durch Brechen bewiesen), ADR-0052 (Agenten-Zugang per OAuth)

## Kontext

SteuerEule ist als Ports & Adapters (hexagonale Architektur) gebaut: ein Rechenkern `@steuereule/core` ohne npm-Abhängigkeiten, Anwendungsservices in `apps/api`, und an deren Rand Adapter für HTTP, Datenbank, Sprachmodelle, Zahlung und Mail. Erzwungen war davon wenig. Eine Prüfung am 2026-11-22 und ein unabhängiges Review des ersten Entwurfs dieser Entscheidung fanden:

1. **SDK-Importe in Fachcode.** Drei Dokument-Parser und der Themenwächter der Eule importierten LangChain-Typen. `auth/user-context.guard.ts` las drei OAuth-Tabellen direkt über `PrismaService`.
2. **Ports, die vom Adapter abhingen.** `account-deletion.repository.ts` importierte seinen Ergebnistyp aus dem Prisma-Adapter. Der Port `TransactionRunner` stand zusammen mit seiner Prisma-Implementierung in `prisma/transaction.ts`, und `mcp-report.service.ts` prüfte per `instanceof PrismaTransactionRunner`.
3. **Ein Kern-Test, der weniger prüfte als behauptet.** `packages/core/src/architecture.test.ts` las die Ordner nicht rekursiv, sah also `domains/business/**` und `domains/ledger/**` nicht. Die Doku nannte die Ordner einen zyklenfreien Schichtenstapel `interview → domains → engine → math`. Gemessen gibt es zwei Zyklen auf Ordnerebene: `engine ↔ domains` und `domains ↔ interview`.
4. **Keine Aussage zur Kopplung zwischen Fachmodulen.** 352 Modul-zu-Modul-Kanten zwischen 50 Ordnern, davon 16 Paare in beide Richtungen. Nichts hinderte eine 353. Kante.

Keiner dieser Punkte war ein Fehler im Verhalten. Jeder macht aber den nächsten billiger, und ein Review findet solche Brüche nur zufällig.

## Ziele

- Ein Fachmodul in `apps/api` kann weder den Datenbank-Client noch ein externes SDK importieren, ohne dass `pnpm test` rot wird. Das gilt auch für die Umwege über `src/prisma/**` und über Adapterklassen.
- Jede Ausnahme ist eine Zeile in einer Tabelle im Test und damit im Review sichtbar. Eine Ausnahme, die niemand mehr braucht, macht den Test ebenfalls rot.
- Neue Kopplung zwischen Fachmodulen und neue Rückwärtskanten im Kern sind eine sichtbare Entscheidung, kein Nebeneffekt.
- Kein neues Werkzeug, keine Laufzeitkosten.

## Nicht-Ziele

- **Die bestehende Kopplung abbauen.** Die 352 Kanten und die zwei Ordner-Zyklen im Kern bleiben. Sie sind jetzt gemessen und können nur noch schrumpfen.
- **Tests einschränken.** Die Regeln gelten für `apps/api/src/**` und `packages/core/src/**` ohne Testdateien. Tests dürfen Adapter und SDKs direkt bauen.
- **`apps/mobile-web`.** Die Web-App hat keine entsprechende Prüfung.

## Entscheidung

### 1. SDK-Grenzen als Tabelle in `apps/api/test/architecture.test.ts`

Der Test liest alle statischen und dynamischen Importe unter `apps/api/src` und prüft sie gegen eine Tabelle. Jede Zeile nennt ein SDK und die Dateien, die es importieren dürfen:

| Grenze | Was dazugehört | Erlaubt in |
|---|---|---|
| Datenbank-Client | `@prisma/*`, `@prisma-keystore/*`, `prisma-field-encryption`, `@better-auth/prisma-adapter`, alles unter `src/prisma/` außer `prisma.module.ts` | `*.prisma.ts`, `prisma/`, und sieben namentlich genannte Infrastruktur-Dateien |
| Prisma-Adapter | jede Datei `*.prisma.ts` | `*.module.ts` (bindet Port an Adapter), `*.prisma.ts`, `auth/better-auth.ts` |
| LangChain | `@langchain/*` | acht namentlich genannte Dateien in `ki/` |
| Stripe | `stripe` | `unlock/stripe-payment-provider.ts` |
| nodemailer | `nodemailer` | `auth/smtp-email-sender.ts` |
| better-auth | `better-auth`, `@better-auth/*` | `auth/`, `device/` |
| MCP-SDK | `@modelcontextprotocol/*` | `mcp/` |
| Redis-Client | `ioredis` | `advisor/run/advisor-run-log.redis.ts`, `advisor/advisor.module.ts` |
| Playwright | `playwright-core` | `account/export/pdf-renderer.playwright.ts` |
| pdf-lib | `pdf-lib` | `printout/form-renderer.ts` |
| OpenTelemetry | `@opentelemetry/*` | `telemetry/` |
| Kindprozesse | `node:child_process` | `business/elster-transmission.ts` |

Drei Eigenschaften der Tabelle:

- **Jede Grenze wird einzeln geprüft.** Eine Datei, die zwei Grenzen berührt, braucht in beiden eine Erlaubnis. `auth/guest-account-upgrade.prisma.ts` ist so ein Fall: Prisma-Adapter und better-auth-Hook zugleich.
- **Namentliche Ausnahmen verfallen.** Steht eine Datei in einer Liste, importiert das SDK aber nicht mehr, wird der Test rot. Die Liste kann also nicht verwaisen.
- **LangChain ist dateigenau begrenzt, nicht ordnerweit.** Eine neue Datei in `ki/` darf LangChain erst importieren, wenn sie in der Tabelle steht. Die Ports in `ki/` (`single-shot-model.ts`, `advisor-engine.token.ts`) stehen dort nicht.

### 2. Modulkopplung als Ratsche

Derselbe Test berechnet alle Kanten *Modul → Modul* (ein Modul ist ein Ordner direkt unter `src`) und vergleicht sie mit `apps/api/test/architecture-module-edges.json`. Abweichungen in beide Richtungen machen ihn rot: Eine neue Kante muss bewusst in die Baseline, eine entfernte muss gestrichen werden. `UPDATE_ARCHITECTURE_BASELINE=1` schreibt die Datei neu.

### 3. Der Kern-Test prüft, was wirklich gilt

`packages/core/src/architecture.test.ts` liest jetzt rekursiv und prüft drei Dinge:

- **Erlaubte Richtungen** zwischen den fünf Ordnern, so wie sie heute bestehen. `math` importiert nichts, `common` nur `math`, `engine` nie `interview`.
- **Rückwärtskanten als Liste.** Gegen die gewollte Ordnung `interview → engine → domains → common → math` importieren heute 13 Dateien in `domains` aus `engine` und 10 aus `interview`. Die Listen stehen im Test und dürfen nur kürzer werden.
- **Kein Zyklus von Wert-Importen zwischen Dateien.** Das gilt heute und bleibt so. Reine Typ-Importe sind davon ausgenommen.

### 4. Neue und bereinigte Ports

- **`SingleShotModel`** (`ki/single-shot-model.ts`): ein Systemprompt, eine Nutzernachricht, Text zurück, abbrechbar per `AbortSignal`. Vier Nutzer: die Parser für Belege, LStB und CH-Lohnausweis und der Themenwächter. `KiModule` leitet die Factory aus `CHAT_MODEL_FACTORY` ab, damit beide denselben Modell-Slot gleich auflösen. Die Abhängigkeit ist nicht optional: Fehlt die Bindung, bricht Nest beim Start ab.
- **`BearerTokenRepository`** (`auth/bearer-token.repository.ts`): drei Lesezugriffe für den Guard. Der Guard trifft weiter jede Entscheidung selbst (abgelaufen, widerrufen, Client gesperrt, keine Zustimmung).
- **`TransactionRunner`** liegt jetzt in `common/transaction-runner.ts`, getrennt von `PrismaTransactionRunner`. Statt `instanceof` fragt die Simulation `rollsBack` und `isActive()` am Port ab.
- **Ports besitzen ihre Typen.** `DeleteAccountResult` steht im Port `account-deletion.repository.ts`.
- **Tokens ohne SDK-Ballast.** `ADVISOR_ENGINE` steht in `ki/advisor-engine.token.ts`, `assertFakeKiNotInProduction` in `ki/fake-ki-env.ts`. Wer sie importiert, lädt kein LangChain mehr.
- **Adapter sagen, was sie sind.** `delete-account-transaction` und `guest-account-upgrade` heißen `*.prisma.ts`.

## Betrachtete Alternativen

| Alternative | Warum nicht |
|---|---|
| **oxlint `no-restricted-imports` mit Overrides** (erster Entwurf dieses ADR) | Ein späterer Override ersetzt die Regel eines früheren vollständig. Eine Datei in zwei Adaptergruppen lässt sich so nicht ausdrücken, und jede weitere SDK-Gruppe muss in jedem anderen Override wiederholt werden (4 Gruppen ergaben 244 Zeilen). Relative Pfade wie `../prisma/encrypted-prisma.provider.js` und Adapterklassen blieben ungeprüft. Der Vorteil, die Meldung direkt im Editor zu sehen, wiegt das nicht auf. |
| **dependency-cruiser** | Kann dasselbe und zusätzlich Graphen zeichnen. Es wäre ein weiteres Werkzeug mit eigener Konfigurationssprache. Der Test hat rund 200 Zeilen, läuft in der bestehenden Suite in Millisekunden und ist in derselben Sprache wie der Code. Wenn die Regeln deutlich wachsen, ist dependency-cruiser der nächste Schritt. |
| **Den Kern in dieser Änderung in echte Schichten umschneiden** | Die Rückwärtskanten betreffen 23 Dateien und das Rechenmodell `engine/berechnung.ts`, das fast jede Fachvertikale nutzt. Das ist ein eigener Umbau. Die Ratsche verhindert bis dahin, dass es schlimmer wird. |
| **Nur Review und Doku** | Das war der bisherige Stand. |

## Konsequenzen

- **Positiv:** Ein Verstoß macht `pnpm test` und den CI-Job `test` rot, mit einer Meldung, die Datei, SDK und den richtigen Port nennt.
- **Positiv:** Die Doku kann Grenzen jetzt als *geprüft* bezeichnen und dabei den Test nennen.
- **Negativ:** Kein Hinweis im Editor. Ein Verstoß fällt erst beim Testlauf auf.
- **Negativ:** Importe werden per Muster gefunden. Ein zur Laufzeit berechneter Pfad, etwa über `createRequire`, bleibt unsichtbar.
- **Negativ:** `*.module.ts` darf jede Adapterklasse importieren, weil Module Ports an Adapter binden. Einzelne Module enthalten mehr als Verdrahtung, zum Beispiel `advisor/advisor.module.ts` mit der Auswahl des Redis-Laufprotokolls. Fachlogik dort würde der Test nicht bemerken.
- **Negativ:** Die Baseline der Modulkanten erzeugt bei jeder neuen Abhängigkeit einen Eintrag im Diff. Das ist gewollt, kostet aber einen Handgriff.

## Bekannte Grenzen

- **LangChain liegt nicht hinter einem Port, sondern in acht Dateien.** Prompt-Aufbau (`ki/advisor-prompt.ts`), Werkzeugrunde und Werkzeugkontext der Eule sind in LangChain-Typen geschrieben. `mcp/` importiert `TOOL_ARG_SCHEMAS` aus `ki/advisor-tools.ts` und lädt damit LangChain mit.
- **`pdf-lib` hat keinen Port.** `printout/form-renderer.ts` ist die einzige Datei, die es importiert, aber Services rufen `renderForms` direkt auf.
- **DI-Tokens sind nicht typgeprüft.** `@Inject(TOKEN) x: Port` vertraut darauf, dass das Modul einen passenden Adapter bindet. Eine fehlende Bindung fällt beim Start auf (`test/boot/build-app-stays-database-free.test.ts`), eine falsche erst in Integrationstests.

## Nachweis (ADR-0021)

Der Nachweis liegt im Repository und läuft bei jedem Testlauf mit:

- `apps/api/test/architecture.test.ts` füttert dieselbe Prüffunktion mit zwölf konstruierten Verstößen, einem je Regel, und erwartet für jeden genau einen Befund. Fünf konstruierte erlaubte Importe müssen ohne Befund bleiben.
- Der Kern-Test wurde am 2026-11-22 mit vier Probe-Dateien gebrochen: ein Import aus `math` nach `engine`, ein neuer Import aus `domains/business` nach `interview`, und ein Zyklus zweier Dateien in `common`. Vier der sechs Tests wurden rot, nach dem Entfernen wieder grün.
- Beim ersten Lauf fand der API-Test eine Ausnahme, die niemand brauchte (`config/database-url.ts` importiert Prisma nicht). Sie ist gestrichen.
