# 06.1 — Cluster-Provisioning: k3s auf Hetzner (EU)

**What to build:** Das IaC-Skelett aus `infra/terraform/` wird von „läuft ohne Credentials" zu
echter, anwendbarer Infrastruktur: OpenTofu/Terraform provisioniert die Hetzner-Cloud-Ressourcen
(Server-Nodes, privates Netz, Firewall, Load-Balancer) in einer EU-Region, k3s wird per
cloud-init gebootstrapt, und ein Kubeconfig fällt als Output an. Danach ist der Cluster der
Träger für alle weiteren Sub-Tickets.

**Bereits erledigt (nicht neu bauen):** #338 hat die liveness/readiness-Endpoints
(`/v1/health/live`, `/v1/health/ready` — gepinnte Pfade, health.controller.ts „PIN") geliefert;
Slice 1 nutzt sie bereits in den Manifest-Proben. Dazu gehört #344 (Ingress-/NetworkPolicy-
Ausschluss des `/v1/health/*`-Präfixes, #338 F3) — sofern noch offen, hier mitziehen.

**Blocked by:** Credential-Blöcke (Hetzner-API-Token, Domain/DNS, EU-Region) — siehe
`infra/README.md`. Kein Track-Dep — kann sofort starten, sobald die Credentials vorliegen.

**Status:** ready-for-agent

- [ ] `tofu plan` (oder `terraform plan`) validiert das HCL gegen ein echtes Hetzner-Projekt ohne Fehler
- [ ] `tofu apply` erzeugt ≥1 k3s-Node in einer EU-Region (fsn1/nbg1/hel1 — ADR-020), nicht nur ein Plan
- [ ] Kubeconfig aus dem Output bootet `kubectl get nodes` mit `Ready`-Node
- [ ] Firewall lässt nur SSH (22), Ingress (80/443) und internes 6443 zu — kein öffentlicher Postgres-/Redis-Port
- [ ] Remote-State (Hetzner Object Storage) aktiv; kein `*.tfstate` landet je im Repo
- [ ] ADR für die IaC-Tooling-Entscheidung nachgezogen (OpenTofu vs Terraform, Kustomize vs Helm,
      Sealed Secrets vs SOPS) — Musti-Review, DoD „ADR bei Architektur-Entscheidung"
- [ ] Musti-Review F1/F2 aus `review-ticket-06.md` geschlossen: alle `terraform.tfvars.example`-
      Variablen haben Defaults oder sind als Pflicht markiert, sodass `tofu plan` mit Token
      durchläuft und das Credential-Gate `tofu validate` nicht blockiert
