# ADR-046 — Backend: NestJS + Fastify, nur API, REST/OpenAPI, better-auth

**Status:** Akzeptiert (Grilling Architektur-Session) · 2026-07-22

**Kontext:** Das Backend trägt echte Fachlogik — amtliches Formular-Mapping (ADR-004),
Multi-Device + EU-Cloud (ADR-020), später Scan/OCR-Jobs und die ELSTER-Abgabe (ab Zertifikat,
ADR-005). Es ist fachlich schwer (Anlagen, Grenzgänger-Tiefe, Zustandsmaschine ADR-018).

**Entscheidung:**
- **NestJS mit dem Fastify-Adapter** (`@nestjs/platform-fastify`). Modul-/DI-Struktur passt
  zur schweren Domäne; Fastify liefert die schnellere HTTP-Engine. NestJS ist **nur die API** —
  es liefert **nicht** das Frontend aus. Begründung: saubere Backend-Grenze (ADR-004), und die
  React-Native-App spricht dieselbe API über HTTP ohnehin, also gewinnt ein Frontend-Ausliefern
  aus Nest nichts, koppelt aber Web- an Backend-Release.
- **API-Stil: REST + OpenAPI** (NestJS-nativ). Getippte Clients für RN *und* Web, dokumentierte,
  prüfbare Grenze für ein Steuer-/ELSTER-Produkt.
- **Auth: `better-auth`.** Deckt Google/Apple/E-Mail/Gast ab (aus `auth.html`), selbst-gehostet
  → Identitätsdaten in *unserer* EU-Postgres (DSGVO + ADR-027 „Identität erst bei Abgabe").
  Passt zur `AUTH_*`-Secret-Linie aus dem k8s-Gerüst.

**Konsequenzen:** Backend, Web, Mobile, DS und Fachkern sind durchgehend TypeScript — ein
Sprach-Stack, geteilte Typen. OpenAPI-Generierung speist die Client-Typen. Scan-Queues laufen
über BullMQ + Redis (ADR-047). Web deployt getrennt von der API (ADR-049).
