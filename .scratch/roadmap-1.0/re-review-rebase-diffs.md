# Re-Review: Rebase-Deltas & Konfliktlösungen (drei Branches)

Scope: nur die Deltas nach dem Rebase auf den neuen `origin/main` (8c9a150) und die
Konfliktlösungen. Kein Voll-Review — Erst-Reviews (`review-ticket-01.md`, `review-ticket-06.md`)
bleiben APPROVE. Basis der Diffs: `main` (cb00586, 7 Commits vor `origin/main`).

## 1. GO/NO-GO

| Branch | Verdict |
|---|---|
| `ticket-01-p0-1-hygiene` (428c5c3) | **NO-GO** — stale ADR-0029-Referenzen in zwei Dateien (Renumber 0029→0036 nicht durchgezogen) |
| `fix-12-mobile-web-node26` (6c56a1a) | **GO** |
| `track-06-infra-slice-1` (680802a) | **GO** |

## 2. Findings mit Beleg

### 2.1 ticket-01-p0-1-hygiene

**`.gitignore`-Union — korrekt und vollständig.** ✓
`git diff main..ticket-01` auf `.gitignore` zeigt exakt zwei Zuwächse, beide als sauberer
Block ohne Duplikat:
- `package-lock.json` direkt unter `node_modules/` (mit pnpm-Begründung).
- macOS/Editor-Block am Dateiende (`.DS_Store`, `.AppleDouble`, `.LSOverride`, `._*`,
  `.Spotlight-V100`, `.Trashes`, `.idea/`, `.vscode/`, `*.swp`, `*~`).
Die remote-`#284`-Einträge (`apps/api/.generated-test-clients/` und
`apps/api/prisma/.generated-test-schema-*.prisma`) sind bereits in `main` vorhanden und werden
unverändert mitgeführt — Union beider Seiten, keine Duplikate, Reihenfolge sinnvoll (Paketmanager
oben, Artefakt-Blöcke unten).

**Ticket-Datei — ADR-0036-Referenz und ehrlicher AC-Zustand.** ✓
`01-p0-1-hygiene.md` nennt in AC 4 „PR-Template … aus ADR-0036" (post-rebase korrekt) und lässt
AC 3 (`pnpm gate`) bewusst offen mit einer `teilweise`-Notiz: `typecheck` grün, `lint` grün,
`test` rot in `apps/mobile-web` (2 vorbestehende Suiten, Node v26 `localStorage`), explizit
„Nicht gefixt … Wird durch Ticket 12 geschlossen." — ehrlich, mit Verweis auf Ticket 12.

**Kein Fremdkörper.** ✓
Branch enthält nur 4 Dateien: `.github/pull_request_template.md` (neu), `.gitignore`,
`.scratch/roadmap-1.0/issues/01-p0-1-hygiene.md`, `docs/process/README.md`. Kein remote-Code,
keine infra-Dateien.

**Defekt — stale ADR-0029-Referenzen (Renumber nicht durchgezogen).** ✗ — NO-GO.
Der Rebase hat unsere DoD-ADR von 0029 auf 0036 umnummeriert (`docs/adr/0036-definition-of-done.md`
existiert auf `main`; `.scratch/roadmap-1.0/adr-drafts/` ist leer). Zwei Dateien im Branch tragen
aber weiter die alte Nummer:
- `.github/pull_request_template.md`: Heading `Definition of Done — Ticket/Slice (ADR-0029)` und
  im Deviations-Kommentar `ADR-0029 D20`. `docs/adr/0029-…` ist jetzt der **fremde**
  Remote-ADR `0029-piggybacked-batch-sweep-instead-of-a-scheduler.md` — der Verweis zeigt also auf
  einen inhaltlich völlig anderen ADR, nicht nur auf eine alte Nummer.
- `docs/process/README.md`: Bullet `Definition of Done, four levels (ADR-0029)` und ein Link auf
  den **toten** Entwurf-Pfad `../../.scratch/roadmap-1.0/adr-drafts/0029-definition-of-done.md`
  (Verzeichnis ist leer; die ADR ist nach `docs/adr/0036-definition-of-done.md` promoviert).

Das ist genau die Kategorie, die Prüfpunkt 4 adressiert: Die Renumber 0028/0029→0035/0036 wurde in
der Ticket-Datei (AC 4) durchgezogen, aber in PR-Template und `docs/process/README.md` vergessen.
Behebung: beide Stellen auf `ADR-0036` und den Link auf `../adr/0036-definition-of-done.md`.

### 2.2 fix-12-mobile-web-node26

**Diff-Umfang — exakt die 3 erwarteten Dateien.** ✓
`git diff --name-status main..fix-12` liefert nur:
`01-p0-1-hygiene.md` (AC 3 → `[x]`), `12-fix-mobile-web-node26-tests.md` (ACs abgehakt +
Flake-Befund), `apps/mobile-web/src/test-setup.ts` (`InMemoryStorage`).

**InMemoryStorage — own-property-Semantik erfüllt (#329 finding 2).** ✓
`class InMemoryStorage`: `setItem` schreibt `this[key] = String(value)` (eigene, enumerable
data property), `getItem`/`removeItem`/`clear`/`key`/`get length` liegen auf dem Prototype und
operieren über `Object.keys(this)`. Das spiegelt jsdom-`Storage` (Keys als own enumerable
properties, API auf dem Prototype). Abgleich mit `test-storage-guard.test.tsx` auf `main`:
der Finding-2-Control (`const spreadStandIn = { ...window.localStorage, setItem }` nach
`setItem('preexisting', …)` erwartet `Object.keys === ['preexisting', 'setItem']`) schlägt bei
einem Map-backed Stand-in fehl (Map-Keys sind keine own enumerable properties) — mit der
own-property-Semantik geht der Spread korrekt auf. Der Kommentar im Test-Setup begründet genau
diesen „warum own properties statt Map"-Punkt mit Verweis auf `#329 finding 2`. Semantik passt.

**Kommentar — ehrlich und warum-only.** ✓
Der Kommentar erklärt das Warum (Node-≥26-Accessor verdrängt jsdom-`Storage`; data property
statt Zuweisung, weil die Zuweisung nur den Setter aufriefe; own properties statt Map wegen des
#329-Guard-Vertrags). Keine ausufernde „was"-Doku, keine falsche Zuschreibung.

**`defineProperty` — kein Verstoß, `configurable: true` ist gefordert.** ✓
`Object.defineProperty(globalThis, 'localStorage', { value, configurable: true, writable: true,
enumerable: true })`. `configurable: true` ist notwendig, damit `vi.stubGlobal('localStorage', …)`
in `stubStorageSetItem` den Wert ersetzen und `vi.unstubAllGlobals()` ihn wiederherstellen kann
(ein nicht-konfigurierbares Property ließe sich nicht per `stubGlobal` überschreiben). Kein
Verstoß — im Gegenteil, die richtige Wahl für die Interaktion mit dem Guard.

**Keine stale ADR-0028/0029-Referenzen.** ✓
`git diff main..fix-12 | grep '0028\|0029'` → leer (einziger Treffer im Diff ist Kontextzeile
`ADR-0036`, korrekt).

**Anmerkung (kein Blocker):** `fix-12` und `ticket-01` bearbeiten dieselbe Zeile von
`01-p0-1-hygiene.md` in entgegengesetzter Richtung (AC 3: `ticket-01` lässt offen/`teilweise`,
`fix-12` hakt ab). Das ist fachlich konsistent (Ticket 12 schließt den Blocker), erzeugt beim
Merge aber einen Konflikt auf dieser Datei — beim Zusammenführen manuell auflösen.

### 2.3 track-06-infra-slice-1

**Proben-Pfade — exakte Übereinstimmung mit dem HealthController.** ✓
`git show main:apps/api/src/health/health.controller.ts`: `@Controller('v1/health')` +
`@Get('live')` → `/v1/health/live`, `@Get('ready')` → `/v1/health/ready`. Port: `main.ts`
`const port = Number(process.env.PORT ?? 3000)` → 3000; `api-service.yaml`
`port: 3000 / targetPort: 3000`.
`track-06` `infra/manifests/base/api-deployment.yaml`:
- `readinessProbe.httpGet` → `path: /v1/health/ready`, `port: 3000`.
- `livenessProbe.httpGet` → `path: /v1/health/live`, `port: 3000`.
Pfade und Port stimmen exakt. Kein Rest von `/v1/auth/capabilities` im Diff (grep über den
Branch-Diff → nur `/v1/health/*`-Treffer).

**livenessProbe-Zusatz sinnvoll — keine DB-Reachability in liveness.** ✓
`/v1/health/live` liefert im Controller bedingungslos `{ status: 'ok' }` (kein DB-Zugriff);
`/v1/health/ready` führt `isDatabaseReachable()` aus. Der `livenessProbe`-Kommentar hält das
korrekt fest („DB reachability is a readiness concern, not liveness"). Liveness killt/restartet
den Pod nur bei Prozessstillstand, ein transienter DB-Hickup darf keinen Restart auslösen —
Trennung ist korrekt umgesetzt.

**06.1-Hinweis zu #338/#344 — plausibel.** ✓ (soweit ohne Issue-Zugriff prüfbar)
`06-1-cluster-provisioning-k3s-hetzner.md` markiert `#338` als „Bereits erledigt" (liefert die
Endpoints) und führt `#344` (Ingress-/NetworkPolicy-Ausschluss des `/v1/health/*`-Präfixes,
`#338` F3) mit dem Zusatz „sofern noch offen, hier mitziehen" — sachlich korrekt gehedged.
`#344` wird in `main` konsistent als verfolgte Pflicht referenziert (`health.controller.ts`:
„tracked: #344"; `health.service.ts`: „#344 … Ingress must not route `/v1/health/*`"), die
Nummerierung ist also nicht frei erfunden. Musti-F1/F2 sind als letzte AC-Zeile aufgenommen
(tfvars-Defaults/Pflichtfelder, damit `tofu plan` das Credential-Gate nicht blockiert). Ob `#344`
tatsächlich als offenes Ticket existiert, ist ohne GitHub-Zugriff nicht verifizierbar.

**Keine stale ADR-0028/0029-Referenzen.** ✓
`git diff main..track-06 | grep '0028\|0029'` → leer. Die `infra/`-Kommentare zitieren nur
vorhandene, unberührte Nummern (`ADR-047`, `ADR-0026`).

## 3. Nicht verifizierte Punkte

- **#344 als offenes Ticket:** GitHub-Issue-Zugriff fehlt. Der Verweis ist intern konsistent
  (`health.controller.ts`, `health.service.ts` auf `main`), aber die Offenheit von `#344` ist
  nicht bestätigt.
- **fix-12: `sessionStorage`-Abdeckung.** Der `InMemoryStorage` wird nur für `localStorage`
  installiert; der Kommentar nennt zwar auch `sessionStorage` als Node-Accessor, es gibt aber
  keinen `sessionStorage`-Stand-in. Die Tests `ProfilScreen`/`req-012` rufen
  `stubStorageSetItem('sessionStorage')` → `window.sessionStorage` müsste also funktional sein.
  Da der Branch 379/379 grün meldet, ist plausibel, dass Node 26 `sessionStorage` in-memory
  bereitstellt (nur `localStorage` liest ohne `--localstorage-file` `undefined`). Nicht lokal
  nachgetestet (kein Checkout/keine Testläufe im Prüfauftrag).
- **Testläufe (379/379, CI Node 24) nicht reproduziert** — read-only, keine Checkouts/keine
  `pnpm`-Runs. Die Zahlen werden aus den Ticket-ACs übernommen, nicht selbst gemessen.
