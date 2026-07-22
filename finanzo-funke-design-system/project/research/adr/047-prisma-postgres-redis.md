# ADR-047 — Datenschicht: Prisma auf managed EU-Postgres, Redis

**Status:** Akzeptiert (Grilling Architektur-Session) · 2026-07-22

**Kontext:** Das Datenmodell ist heikel und compliance-sensibel: **versiegelte Fassungen**
unveränderlich (ADR-001, 011), **Posten-Konflikt als sichtbarer Zustand** (ADR-008),
**Herkunft an jedem Wert**. Das verlangt ein explizites, streng getyptes Schema mit sauberen,
nachvollziehbaren Migrationen. EU-Datenresidenz ist Pflicht (ADR-020).

**Entscheidung:**
- **Prisma** als ORM auf **managed EU-Postgres**. Reife Migrations- und Studio-Tooling,
  ergonomisches Schema, große Community — bei einem regulierten Produkt zählt die Reife der
  Migrations-Kette. Prisma sitzt am Persistenz-Rand (Backend); der UI-freie `packages/core`
  hält die Domänen-Typen, sodass RN/Web den Kern ohne DB-Kopplung teilen.
- **Postgres als managed EU-Dienst** (nicht selbst-gehostet): das größte Betriebsrisiko bei
  Steuerdaten sind Backups/PITR/Verschlüsselung — die gibt man an einen managed EU-Anbieter,
  statt sie auf k3s von Hand zu tragen (ADR-049).
- **Redis** für Scan-/OCR-Queues (BullMQ) und Caching.

**Konsequenzen:** Migrationen sind versioniert und prüfbar — passend zu „eingereicht =
Rechtsdokument". Provenienz-Felder (Beleg, Regel-ID, Rechenweg) sind erste-Klasse-Spalten, nicht
nachträglich. `better-auth` (ADR-046) nutzt den Prisma-Adapter auf derselben Postgres.
