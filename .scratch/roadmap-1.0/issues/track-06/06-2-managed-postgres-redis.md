# 06.2 — Managed EU-Postgres + Redis

**What to build:** Der managed EU-Postgres-Dienst (ADR-047/ADR-049) existiert und ist vom
Cluster erreichbar; Redis (BullMQ-Scan-/OCR-Queues + Cache, ADR-047) läuft auf dem Cluster.
Die API bekommt `DATABASE_URL`/Redis-URL aus Secrets; Migrationen laufen als Job/InitContainer
(`migrate`, das compose-Pendant). **Kein** selbst-gehostetes Postgres-StatefulSet im Cluster.

**Blocked by:** 06.1 (Cluster/Netz für Redis und den Zugriff auf Postgres) · Credential-Blöcke
(managed-Postgres-Instanz + Credentials, Redis-Credentials).

**Status:** ready-for-agent

- [ ] managed Postgres in EU-Region provisioniert; PITR/Verschlüsselung aktiv (ADR-047: „nicht von Hand tragen")
- [ ] `DATABASE_URL` zeigt auf managed Postgres; `prisma migrate deploy` läuft gegen die echte DB (nie `migrate dev`)
- [ ] Redis auf dem Cluster (Deployment/StatefulSet) mit Persistenz (AOF) und Passwort aus einem Secret
- [ ] BullMQ-Queues verbinden sich gegen das echte Redis
- [ ] Kein Klartext-Passwort in Manifests; kein Postgres-StatefulSet im Cluster (ADR-049)
