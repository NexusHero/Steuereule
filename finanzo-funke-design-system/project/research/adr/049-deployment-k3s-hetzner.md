# ADR-049 — Deployment: k3s auf Hetzner (EU) + managed Postgres

**Status:** Akzeptiert (Grilling Architektur-Session) · 2026-07-22

**Kontext:** Es deployt: statischer **Web-App-Export** (Expo), statische **Marketing-Seite**,
**NestJS-API**, **Postgres**, **Redis**. Das vorhandene `k8s/`-Verzeichnis ist ein aus myDevTime
kopiertes k3s-auf-Hetzner-Gerüst (Postgres/Redis/API/Web, nginx-SPA). EU-Datenresidenz ist
Pflicht (ADR-020); 1.0 ist kostenlose Beta (ADR-017).

**Entscheidung:** **k3s auf Hetzner** (deutscher/EU-Anbieter — erfüllt die Residenz-Pflicht)
adoptieren und von myDevTime auf **Steuereule** umbauen: API, Redis, Web-Export und
Marketing-Seite laufen auf dem Cluster; GHCR-Images + Deploy-Workflow werden übernommen.
**Postgres jedoch als managed EU-Dienst** statt selbst-gehostetem StatefulSet (ADR-047) —
Backups/PITR/Verschlüsselung für Steuerdaten nicht von Hand tragen.

**Konsequenzen:** Zwei Web-Deploys (App-Export + Marketing-Seite), beide statisch hinter nginx;
die API als eigener Dienst. Die k8s-Manifeste, das k8s-README und der Deploy-Workflow werden von
myDevTime-Bezeichnern (Domain, Image-Namen, Secrets) auf Steuereule umgestellt. Der
DB-StatefulSet aus dem kopierten Manifest entfällt zugunsten des managed Dienstes. k8s ist
Betriebs-Gewicht; die managed DB nimmt den riskantesten Teil heraus.
