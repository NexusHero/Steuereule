# ADR-052 — Mantel-Abschluss: TOTP/Passkey als opt-in Zweitfaktor (Amendment zu ADR-027(b))

**Status:** Akzeptiert (Roadmap-Grilling-Session 2026-10-23, D9) · 2026-10-24
**Amendiert:** Produkt-ADR-027(b) — nur auf dem 2FA-Punkt, nichts sonst.

## Kontext

ADR-027(b) lautete „keine 2FA in 1.0" (Grilling R4, 2026-07-22). Die
Roadmap-Grilling-Session (2026-10-23) hat den Mantel-Abschluss in die Foundation
gelegt (D9, Engineering-ADR-0035 §5): REQ-007 (TOTP/Passkey als opt-in
Zweitfaktor), REQ-008 (Apple-Wiring, flagged off) und REQ-009 (Expo-SecureStore)
werden **vor** den Produktfeatures gebaut. Das ist eine spätere, spezifischere
Entscheidung als der frühere Pauschal-Ausschluss.

## Entscheidung

REQ-007 wird 1.0-Umfang: Ein Kontoinhaber kann **TOTP** (App-Authenticator,
Code-Bestätigung) und/oder **WebAuthn-Passkey** als **opt-in** Zweitfaktor
eintragen. Ein Login fragt nach dem Zweitfaktor erst nach erfolgreichem
Primärfaktor; Entfernen eines Faktors nur nach Re-Authentifizierung. 2FA bleibt
opt-in, nie Pflicht.

Damit ist ADR-027(b) auf genau diesem einen Punkt **superseded** — „keine 2FA in
1.0" gilt nicht mehr. Die andere Hälfte von ADR-027(b) — **Multi-Device ohne
Geräteverwaltung** — bleibt unberührt (und ist durch REQ-014 ohnehin schon
präzisiert worden, nicht durch dieses Amendment).

## Konsequenzen

- REQ-007 steht im Register als operatives Requirement; ADR-027(b) nur auf dem
  2FA-Punkt als ersetzt markiert.
- Durchsetzungsort ist Ticket 05 (`.scratch/roadmap-1.0/issues/05-*`).
- Implementierungs-Hinweis (Stand der Umsetzung, nicht dieser Entscheidung):
  TOTP über better-auths `twoFactor`-Plugin; Passkey/WebAuthn ist in better-auth
  1.6.24 **nicht** enthalten (`@better-auth/passkey` verlangt ein better-auth
  ^1.7-Core-Upgrade) und ist als Folge-Ticket
  **14** (`.scratch/roadmap-1.0/issues/14-passkey-webauthn-better-auth-upgrade.md`)
  geführt — kein Eigenbau (Engineering-ADR-0035 D3).
