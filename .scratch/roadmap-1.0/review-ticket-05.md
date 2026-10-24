# Review-Report — Ticket 05, Phase 0.5 Mantel-Abschluss (Branch `ticket-05-p0-5-mantel-abschluss`, Commit 08a4bc3 auf 352d153)

**Reviewer:** Musti (Lead Developer / Architect)
**Scope:** `git diff 352d153...HEAD` (32 Dateien, +1410/−45) — REQ-007 (TOTP), REQ-008 (Apple-Flag), REQ-009 (Expo-SecureStore)
**Read-only:** keine git-Mutationen; kein Gate neu gelaufen (siehe §3).

---

## 1. Gesamturteil: **REQUEST-CHANGES**

Die TOTP-Hälfte ist auf dem Niveau, das der Mantel-Abschluss verlangt: ein echter
Acceptance-Test gegen real Postgres + real Socket deckt **alle vier** Register-Klauseln
(opt-in, Registrierung mit einem Code, Login-Prompt nach Primärfaktor, Entfernung nur nach
Re-Auth) ab, das `twoFactor`-Plugin wird genutzt statt nachgebaut (ADR-0035), die
Prisma-Migration ist expand-only in eigener Datei, und der Apple-Triple-Gate ist korrekt
off-by-default und getestet. Zwei Findings betreffen aber genau die Achse, um die es in
diesem Ticket geht — **Ehrlichkeit darüber, was wirklich gebaut vs. nur dokumentiert ist** — und
sind nachzubessern, bevor „Done" stehen darf:

- **F1:** Das Passkey-Deferral wird als **„Folge-Ticket geführt"** bezeichnet, aber **kein
  Folge-Ticket existiert** unter `.scratch/roadmap-1.0/issues/`. Die Begründung (^1.7) ist
  korrekt und belegt; die Behauptung „geführt" ist es nicht.
- **F2:** Der Expo-SecureStore-Seam ist ein **toter Adapter** (kein einziger Produktions-Callsite),
  und ein Kommentar behauptet explizit das Gegenteil („not dead … the complete REQ-009 surface").
  Der „SecureStore benutzt"-Test beweist nur den Delegations-Vertrag des Adapters, nicht, dass
  die App ihn je aufruft.

Beides ist ohne Code-Änderung behebbar (Folge-Ticket anlegen bzw. Wording ehrlich stellen) —
aber das Register selbst hat diese Defektklasse mehrfach zum Blocker gemacht („a status gets set
from evidence, not intent"; „a dead Pressable doesn't ship").

---

## 2. Findings

### F1 — Passkey-Deferral: „Folge-Ticket geführt" ohne existierendes Ticket (Medium)

- `finanzo-funke-design-system/project/research/adr/052-mantel-abschluss-2fa.md:36` — „und ist
  als Folge-Ticket geführt".
- `docs/requirements/register.md:434` — „… follow-up ticket".
- `docs/requirements/register.md:18` — „a documented follow-up, not silently dropped".

**Befund:** Die `^1.7`-Begründung ist real und korrekt belegt (pnpm-lock pinnt
`@better-auth/core@1.6.24`; `@better-auth/passkey` ist nicht installiert). Aber der
*Kern des Deferrals* — ein Nachfolge-Ticket, das die 2FA-Passkey-Arbeit trägt — **existiert
nicht** als Datei unter `.scratch/roadmap-1.0/issues/` (Bestand: 01–13, `track-06`). `grep -ri
"passkey|webauthn"` über `issues/` liefert nur Ticket 05 selbst. Das Deferral ist also in
Prosa dokumentiert, aber **nicht** als Ticket geführt — der Satz „Folge-Ticket geführt" (und
das „follow-up ticket" in REQ-007s Traceability-State) behauptet etwas, das es nicht gibt.
`register-check` prüft diesen Claim nicht (Checks 1–5 prüfen Pfad-Existenz, CI-Ausführung,
REQ-Tag-Abgleich, Status-Vokabular, `@documents-defect`-Offenheit — keiner prüft
„Follow-up-Ticket existiert"), d.h. grünes `register-check` widerlegt den Befund nicht.

*Vorschlag:* Entweder (a) ein echtes Folge-Ticket unter `.scratch/roadmap-1.0/issues/` anlegen
(z.B. `14-p0-5-passkey-webauthn-upgrade.md`, „Blocked by: 05", Verweis auf `@better-auth/passkey`
^1.7) und die drei Stellen auf dessen Namen verlinken — oder (b) das Wording auf
„documented follow-up; successor ticket not yet filed" abschwächen. (b) ist die kleinere,
ehrliche Änderung; (a) ist die vollständigere, da ADR-0035 D3 ausdrücklich „kein Eigenbau,
sondern Upgrade-Ticket" will.

### F2 — Expo-SecureStore-Seam ist ein toter Adapter; ein Kommentar behauptet das Gegenteil (Medium)

- `apps/mobile-web/src/auth/native-secure-store.ts:10-12` — „Honest, not dead: … the web
  fallback … is the already-shipped cookie flow — the two are the complete REQ-009 surface."
- `apps/mobile-web/src/auth/session-token-storage.test.tsx:1-6` — „the token is written to
  SecureStore … never a plain store".
- `docs/requirements/register.md:436` — „SecureStore is used on native" (im State).

**Befund:** `createNativeSessionTokenStorage()` / `resolveSessionTokenStorage()` /
`createWebCookieSessionTokenStorage()` haben **keinen einzigen Produktions-Callsite**
(`grep` über `apps/`/`packages/` außer `native-secure-store.ts` selbst und dem Testfile: leer).
Der Adapter ist also nicht in den Auth-Flow eingehängt — und der Satz „the web fallback is the
already-shipped cookie flow" ist doppelt irreführend: die **echte** Web-Cookie-Pflege macht
better-auths eigenes `createAuthClient` (`auth-client.ts:22-34`, `credentials: 'include'`), das
diesen No-Op-Web-Storage **niemals instanziiert**. Die zwei neuen Dateien sind komplett
entkoppelt von dem, was shipped.

Der Test beweist „set → setItemAsync" **per Mock-Injektion** — das ist ein ehrlicher
Delegations-Nachweis des Adapter-Vertrags, aber **kein** Nachweis von „SecureStore benutzt":
dafür müsste gezeigt werden, dass die App `storage.set(...)` mit einem echten Token aufruft,
und genau das tut sie nicht. Es ist kein Zirkelschluss im strengen Sinn (der Mock ruft nicht
sich selbst auf), aber es beweist die falsche Ebene: den inneren Vertrag statt der Nutzung. Der
„kein AsyncStorage"-Teil dagegen ist ehrlich — `AsyncStorage` ist keine Dependency (nicht in
`package.json`), also trägt statische Abwesenheit; das `assertNoStorageWrites`-Guard auf
local/sessionStorage bezieht sich korrekt nur auf den (ohnehin unbenutzten) Web-No-Op.

*Vorschlag:* `native-secure-store.ts:10-12` umformulieren auf „scaffolding, not yet wired — no
production caller until the better-auth ^1.7 `expoClient` consumes this storage object; the
shipped web cookie flow is better-auth's own `createAuthClient`, not this module". Register-State
REQ-009: „SecureStore is used on native" → „SecureStore seam delegates set→setItemAsync (unit,
mock); the shipped app does not yet call it (no caller — gated on ^1.7)". Das Ticket-05-Checkbox
(Zeile 17-19) sagt das im Kern schon richtig („nicht device-verifiziert … gated"), nur der
Code-Kommentar und der Register-State überzeichnen.

### F3 — Plugin-Limits (10s/3, Lockout nach 5) behauptet, nicht getestet (Low)

- `apps/api/prisma/schema.prisma:162-166` — „failedVerificationCount/lockedUntil back the
  plugin's own sign-in brute-force lockout (5 attempts → locked)".
- `apps/api/src/auth/better-auth.ts:493-497` — „a per-route rate limit (window 10s / max 3,
  the plugin's own `rateLimit` array)".

**Befund:** Beide konkreten Zahlen (10s/3, 5 Versuche → Lockout) stehen nur in Kommentaren.
Kein Test in `req-007-totp.test.ts` (oder sonstwo) übt den Rate-Limit oder den Lockout aus, und
das Register zitiert sie korrekt auch **nicht** als getestet. Die Kommentare sind plausibel
(better-auth-Defaults), aber als spezifische numerische Behauptung unverifiziert — dieselbe
Klasse „Kommentar behauptet eine Tatsache, die kein Control stützt" (ADR-0021).

*Vorschlag:* Entweder die Zahlen verifizieren (ggf. eine Asserts-Zeile im Acceptance-Test, die
nach >3 schnellen Code-Fehlversuchen einen 429 bzw. nach 5 einen Lockout beobachtet — sonst aus
dem Kommentar streichen) oder die Kommentare auf „plugin's own rate limit / lockout (values not
pinned here)" abschwächen.

### F4 — `TwoFactor.verified`-Kommentar widerspricht Schema/Migration-Default (Sehr low)

- `apps/api/prisma/schema.prisma:176-177` — „'Code confirmed' — false after `enableTwoFactor`,
  true after `verifyTOTP`" — aber `verified Boolean @default(true)` (Zeile 177) und
  `migration.sql:15` (`DEFAULT true`).

*Vorschlag:* Kommentar auf den tatsächlichen Default (`@default(true)`, better-auths kanonisches
Schema) korrigieren; der für die Nutzer sichtbare Flag ist ohnehin `User.twoFactorEnabled`, nicht
`TwoFactor.verified`.

---

## 3. Nicht re-verifizierte Punkte

- **Gates nicht neu gelaufen** (Anweisung): 338 api + 389 mobile-web Tests, 7 env-bedingte
  Fehlschläge „vorbestehend" — Plausibilität geprüft (Diff fügt ~7 neue mobile-web-Tests und
  ~5 api-Tests hinzu, ohne bestehende zu löschen), aber nicht ausgeführt.
- **`register-check` grün laut Agent** — nicht neu gelaufen. (Unabhängig davon: register-check
  deckt F1 nicht ab, da kein Check „Follow-up-Ticket existiert" prüft.)
- **„@better-auth/passkey peer-depends ^1.7"** — die Kern-Prämisse von F1/F2 ist nicht gegen die
  Registry nachgeschlagen; belegt ist nur, dass `@better-auth/passkey` nicht installiert und
  better-auth auf 1.6.24 gepinnt ist (pnpm-lock). Die Richtung der Behauptung ist plausibel,
  der konkrete Peer-Dep-Range nicht gegen npm geprüft.
- **Plugin-eigene Limits (10s/3, 5-Versuche-Lockout)** — nicht gegen better-auths `dist`/
  Plugin-Quelle verifiziert (nur als Kommentar gelesen, F3).
- **Real-iOS-Keychain-Roundtrip** — definitionsgemäß nicht geprüft (kein Device, kein native
  Build); der Seam ist ohnehin unverdrahtet (F2).

---

*Ende des Reviews — REQUEST-CHANGES. TOTP (REQ-007) und Apple (REQ-008) sind reif; nach
Behebung von F1 (Folge-Ticket oder ehrliches Wording) und F2 („not dead"/„complete surface"-
Kommentar + Register-State ehrlich stellen) ist der Mantel-Abschluss sauber. F3/F4 sind
Low-Prioritäts-Nacharbeit.*
