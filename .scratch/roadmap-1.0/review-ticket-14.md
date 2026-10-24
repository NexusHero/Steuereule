# Review — Ticket 14 (Passkeys via better-auth ^1.7)

**Verdict: APPROVE** (mit drei Follow-up-Empfehlungen, keine davon ein Merge-Blocker)

Der Kern des Tickets ist das Upgrade-Risiko better-auth 1.6.24 → 1.7.12. Beide
Breaking-Change-Behauptungen sind gegen die installierte 1.7.12-Dist verifiziert, keine
übersehenen Breaking-Changes in den bestehenden Plugins gefunden, der Acceptance-Test
treibt echte WebAuthn-Krypto (nicht gestubbt), und die zwei ADR-052-Abweichungen sind per
Test gepinnt und im Register ehrlich als „not met by the plugin" geführt — nicht als Done
beschönigt. Die einzige substanzielle Lücke ist dokumentarisch: ADR-052 selbst ist nicht
nachgezogen.

---

## (1) Breaking-Change-Behauptungen — alle verifiziert

- **Rate-Limit-Storage `consume`-only:** `apps/api/src/auth/rate-limit-storage.ts:47` —
  `get`/`set` sind entfernt. Bestätigt gegen `@better-auth/core` 1.7.12
  `dist/types/init-options.d.mts:142` (Doc-Kommentar wörtlich: „Better Auth no longer
  accepts separate `get`/`set` rate-limit storage") und `better-auth/dist/api/rate-limiter/
  index.mjs` (`getRateLimitStorage` liefert nur noch `{ consume }`-Shapes). Korrekt.
- **`/unlink-account` accountId:** `apps/api/test/acceptance/req-014-device-list-session-freshness.test.ts:198`
  sendet jetzt `{ accountId: linkedAccount.id }`. Bestätigt gegen
  `better-auth/dist/api/routes/account.mjs:262` (`body: z.object({ accountId: z.string() })`)
  und `:278` (`accounts.find((account) => account.id === accountId)`). Die lokale
  `account.id` ist der korrekte Selektor, nicht der provider-seitige `accountId`-String. Korrekt.
- **Keine weiteren übersehenen 1.7-Breaking-Changes:**
  - `twoFactor({ issuer: 'SteuerEule' })` weiterhin gültig (`plugins/two-factor/index.mjs:170`
    liest `options?.issuer`).
  - `deviceAuthorization({ expiresIn, verificationUri })` weiterhin gültig
    (`plugins/device-authorization/index.mjs:20,28`).
  - `device-session-cookie.ts` liest `ctx.context.newSession` — in 1.7.12 weiterhin gefüllt
    (`context/create-context.mjs:191-192`, `setNewSession` setzt `this.newSession`).
  - `freshSessionMiddleware`-Konsumenten weiterhin **exakt zwei** in 1.7.12
    (`api/routes/session.mjs:350` list-sessions, `api/routes/account.mjs:263` unlink-account)
    — die ADR-0027-Aussage „exactly two" hält unverändert, kein still eingeführter dritter
    Konsument durchs Upgrade.

## (2) Test-Beweiskraft — echt, nicht gestubbt

`apps/api/test/acceptance/req-007-passkey.test.ts` baut einen echten P-256-Schlüssel
(`generateKeyPairSync('ec', P-256)`, Z. 88), kodiert CBOR mit `@levischuck/tiny-cbor`
(Z. 46, 95) — derselben Bibliothek, die `@simplewebauthn/server` 13.3.3 zum **Dekodieren**
nutzt (dessen `package.json` hat `"@levischuck/tiny-cbor": "^0.2.2"`) — und signiert die
Assertion mit `node:crypto.sign` (Z. 169). Der Server verifiziert über SimpleWebAuthns echte
`verifyRegistrationResponse`/`verifyAuthenticationResponse`. Nichts daran ist gestubbt.

REQ-007-Passkey-Klauseln sind abgedeckt: opt-in (Z. 254), Registrierung (Z. 261),
passwordless Sign-in ohne Primärfaktor (Z. 278), list/delete ownership-gated (Z. 300, 321)
sowie die zwei Boundary-Tests (Z. 335, und der Delete-ohne-Passwort in Z. 300-319). Die
NICHT-bewiesenen Teile (Browser-`navigator.credentials`-Zeremonie, Hardware-Attestation)
sind im Modul-Header Z. 18-29 und im Register ausdrücklich benannt. Ehrlich.

## (3) Die zwei ADR-052-Abweichungen — gepinnt + ehrlich, aber ADR-052 nicht nachgezogen

Beide Abweichungen sind **per Test gepinnt** (Beweis des tatsächlichen Verhaltens):
- passwordless statt Zweitfaktor: Z. 335-355 assertet `twoFactorRedirect`/`twoFactorMethods`
  undefined nach Email+Passwort-Login trotz registriertem Passkey.
- deletePasskey ohne Re-Auth: Z. 300-319 sendet `{ id }` ohne Passwort und es gelingt.

Beide sind im Register (Status- **und** State-Spalte) als „not met by the plugin, recorded
rather than interposed (ADR-0035)" geführt — keine Done-Beschönigung. `deletePasskey` ohne
Re-Auth ist zudem gegen die Dist bestätigt: `@better-auth/passkey/dist/index.mjs:581-584`
nutzt `[sessionMiddleware, requireResourceOwnership(...)]`, **nicht** `sensitiveSessionMiddleware`.

**Finding F3 (substanziell, Follow-up):** ADR-052
(`finanzo-funke-design-system/project/research/adr/052-mantel-abschluss-2fa.md`) entscheidet
„TOTP/Passkey als opt-in **Zweitfaktor**". Die Implementierung liefert Passkey als
**passwordless sign-in** (primärfaktor-alternativer Weg), nicht als Zweitfaktor. Das ist eine
echte Produkt-Entscheidungs-Abweichung (ADR-027(b)/ADR-052-Geist: 2FA in 1.0), keine rein
technische Grenze. Register und Ticket dokumentieren sie ehrlich, aber **ADR-052 selbst ist
nicht amendiert** — ein späterer Leser der Entscheidung glaubt, Passkeys seien als
Zweitfaktor umgesetzt. Außerdem kumuliert „deletePasskey ohne Re-Auth" mit der ADR-0027-
Entscheidung `session.freshAge: 0`: ein gestohlener (nicht abgelaufener) Session-Cookie kann
Passkeys löschen **und** Accounts entkoppeln, ohne Freshness- oder Re-Auth-Check — während
TOTPs `disable` re-auth-gated ist. Empfehlung: ADR-052 per Amendment (oder Folge-ADR 052a)
nachziehen, das die tatsächliche Passkey-Form (passwordless statt Zweitfaktor) und den
Re-Auth-Unterschied zu TOTP festhält, inkl. Re-Evaluation-Trigger nach ADR-0027-Muster. Als
eigenständiges Folge-Ticket, kein Merge-Blocker — die Register-Doku schließt die Lücke für
den Moment.

## (4) Register REQ-007 — konsistent

`docs/requirements/register.md`: Passkey-Hälfte **Done (Passkey — passwordless sign-in, web)**
mit Tier-Zitat (`req-007-passkey.test.ts`, acceptance). Die zwei Boundary-Klauseln (a)
prompt-after-primary-factor und (b) removal-after-re-auth sind in **Status- und State-Spalte
identisch** benannt (nicht wortgleich, aber dieselben zwei Boundaries). `register-check`
behauptet grün — plausibel, nicht neu ausgeführt.

## (5) Parallel-Track-Merge-Aufwand — nicht benannt (Bewertung, kein Blocker)

Ticket 14 benennt keinen Rebase-Aufwand für t08/t09. Die Tickets t08 (`08-p1a-angestellte.md`)
und t09 (`09-p1b-grenzgaenger-ch.md`) referenzieren better-auth gar nicht; der tatsächliche
Merge-Effekt ist der generische Lockfile/package.json-Rebase für jeden noch auf pre-14-`main`
basierenden Branch. Ticket 14 benennt dafür korrekt den REQ-009-Nachklapp (`expoClient`-Seam)
als natives Folge-Ticket. Keine Aktion nötig; allenfalls beim Slicen von P1 explizit
vermerken, dass 14 zuerst gemergt sein muss.

## (6) Standards / Konventionen

- Commit `e01b749` konventionell (`feat(auth): …`), `Co-authored-by: Robin`, **kein**
  Tool-/AI-Footer. Konform.
- Migration `20261024090000_add_passkey` ist expand-only (CREATE TABLE + Index + FK, kein
  ALTER bestehender Tabellen) und folgt dem kanonischen Plugin-Schema unrenamed
  (`@better-auth/passkey/dist/index.mjs:669-720` — Feldmenge stimmt; `id`/`updatedAt` sind
  der Standard-Prisma-Adapter-Zusatz wie bei allen anderen better-auth-Modellen).
- Kein Eigenbau: Passkey über das Plugin, keine Interposition der Plugin-Routen. Konform mit
  ADR-0035.

## Findings

- **F1 (minor):** `apps/api/src/auth/better-auth.ts:589` — Kommentar sagt weiterhin
  „exactly two endpoints in better-auth **1.6.24**, measured against the installed dist",
  während der REQ-014-Testkommentar auf 1.7.12 nachgezogen wurde. Der Claim hält (selbst
  verifiziert: weiterhin zwei), aber die Versionsreferenz ist veraltet. Vorschlag: auf
  „re-verified against 1.7.12 (still exactly two)" ändern.
- **F2 (minor):** `apps/api/src/auth/device-session-cookie.ts:3-4` — Kommentar „(better-auth
  1.6.24)" veraltet; das beschriebene Verhalten (`ctx.context.newSession` gefüllt) hält in
  1.7.12 weiterhin (via `setNewSession`), also rein kosmetisch. Vorschlag: Versionsreferenz
  aktualisieren.
- **F3 (substanziell, Follow-up):** ADR-052 nicht amendiert — Passkey landete als
  passwordless sign-in statt als Zweitfaktor; `deletePasskey` ohne Re-Auth kumuliert mit
  `session.freshAge: 0`. Siehe Abschnitt (3). Vorschlag: Folge-ADR/Amendment + Folge-Ticket,
  kein Merge-Blocker.

## Nicht re-verifiziert

- Gates nicht neu ausgeführt (Anweisung): `api` unit 347, `mobile-web` 390, `api` integration
  130 pass / 7 fail (7 vorbestehend, umgebungsbedingt), `typecheck`/`lint`/`register-check`
  grün. Plausibilität geprüft: die 7 Fehlschläge korrelieren mit `pdf-renderer.playwright.integration.test.ts`
  (Chromium) und `req-014-device-code.integration.test.ts` (127.0.0.2-Loopback); die
  Versions-/Typ-Konsistenz ist durch die Dist-Verifikation abgedeckt. Kein Test tatsächlich
  ausgeführt.
