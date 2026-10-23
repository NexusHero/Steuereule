# 06 — Infra-Track: #292 Deployment-Pipeline (k3s/Hetzner, EU-Postgres, Redis)

**What to build:** Die echte Infrastruktur existiert und läuft: Deployment-Pipeline nach
k3s auf Hetzner, managed EU-Postgres (ADR-049), Redis (ADR-047), CI/CD mit Staging/Prod,
Observability, Backups/DR, Secret-/Key-Management (inkl. Rotation des Datenverschlüsselungs-
Keys, REQ-003). Danach shippt jede Produktphase auf eine echte URL, und REQ-010s
Rate-Limiting schließt sich über die Netzwerk-Eigenschaft (App nur über echten Proxy
erreichbar, `TRUSTED_PROXIES` gesetzt).

**Blocked by:** None — can start immediately (paralleler Track zur Phase 0).

**Status:** ready-for-agent

- [ ] Cluster + Pipeline: k3s/Hetzner, Deployments für API und Web, managed EU-Postgres,
      Redis, Secrets aus einem Vault/Sealed-Secret-Mechanismus (nie im Repo)
- [ ] Staging und Prod als getrennte Umgebungen; prod-deploy-smoke auf jeder Stage-Pipeline
- [ ] Observability: Logs, Metriken, Alerts (mind. Boot-/DB-/Fehlerrate); Backups mit
      Wiederherstellungs-Test (DR-Nachweis, nicht nur Skript)
- [ ] Key-Rotation für REQ-003-Feldverschlüsselung ist durchgespielt (rotiert + alte
      Daten lesbar)
- [ ] `TRUSTED_PROXIES`/`trustProxy` aus Phase 0.2 auf der echten Topologie gesetzt;
      REQ-010-Rate-Limiting-Acceptance beweist die Netzwerk-Eigenschaft; Register REQ-010 → Done
- [ ] arm64-Verifikation (README-Lücke): Build + Boot auf linux/arm64 gemessen, nicht vermutet

_Track-Ticket: wird beim Start per `to-spec`/`to-tickets` fein geschnitten (D11)._
