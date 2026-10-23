# Infra — k3s auf Hetzner, managed EU-Postgres, Redis (Track 06 / #292)

**Slice 1: IaC-Skelett + Feinschnitt + Credential-Blöcke.** Dieses Verzeichnis ist das
Skelett der echten Infrastruktur aus `docs/roadmap-1.0.md` (Infra-Track, D7) und den
Research-ADRs [ADR-047](../finanzo-funke-design-system/project/research/adr/047-prisma-postgres-redis.md)
(Datenschicht) und [ADR-049](../finanzo-funke-design-system/project/research/adr/049-deployment-k3s-hetzner.md)
(Deployment). Es schließt die in
[ADR-0026](../docs/adr/0026-local-production-shaped-compose-stack.md) offen benannte #292-Lücke:
der lokale `docker-compose.prod.yml`-Stack ist der *lokale Test*-Gegenpart, **nicht** das
Cloud-Deployment — dieses Verzeichnis ist der Anfang davon.

**Was Slice 1 liefert und was bewusst nicht:** Das Skelett ist lauffähig **ohne
Credentials** (`tofu validate`, `kubectl apply -k --dry-run=client`), damit jede
Entscheidung vor der Credential-Grenze geprüft werden kann. Es **provisioniert nichts**,
**erstellt keine externen Accounts** und **checkt keine Secrets ein**. Alles stoppt hart an
der Credential-Grenze — das ist gewollt und unten als Blocker benannt. Der Feinschnitt des
Rest-Tracks liegt unter `.scratch/roadmap-1.0/issues/track-06/`.

## 1. Werkzeug-Entscheidungen (begründet, zur ADR-Erhebung durch Musti in 06.1)

| Aufgabe | Werkzeug | Warum |
|---|---|---|
| Cloud-Provisioning (Nodes, Netz, Firewall, LB) | **OpenTofu** (HCL, `hetznercloud/hcloud`) | ADR-049 wählt Hetzner; der first-party Provider ist reif. OpenTofu = MPL-2.0, drop-in zu Terraform (das lokal bereits installiert ist) — kein BUSL-Lizenzrisiko für ein Produkt, reversibel, da identisches HCL. Kein Pulumi/Crossplane: für „provisioniere ein Cluster" ist deklaratives HCL der Standard, keine volle GitOps-Plattform. |
| k3s-Bootstrap | **cloud-init** (`user_data`) | k3s liefert ein offizielles Install-Script; cloud-init ist der Provider-native Weg, es einmal beim Boot zu starten. Kein Ansible/Salt — keine zweite Config-Management-Schicht für ein derzeit kleines Cluster. |
| Eigene App-Manifeste (API/Web/Redis/Ingress) | **Kustomize** (base + staging/prod overlays) | In `kubectl` eingebaut, kein Server-Teil; base+overlay bildet „Staging und Prod als getrennte Umgebungen" direkt ab (nur Image-Tag + Origins + Hosts differieren). |
| Cluster-Add-ons (ingress-nginx, cert-manager, sealed-secrets, Prometheus) | **Helm-Charts** (Upstream) | Die Upstream-Projekte liefern offizielle Charts; „kein Eigenbau" heißt, die zu nutzen statt selbst zu schreiben. Kustomize für *unsere* Manifeste, Helm für *deren* Charts — keine eigenen Charts. |
| Secrets | **Sealed Secrets** (Bitnami) | GitOps-freundlich: versiegelt gegen den Cluster-Controller-Key, der verschlüsselte Blob darf ins Repo, kein externes KMS nötig für ein Single-Cluster. Alternative **SOPS** (age/KMS) erst, wenn Multi-Cluster/key-verwaltete Rotation nötig wird. REQ-003-Key-Rotation ist *zusätzlich* eine Daten-Migration (ADR-0008), keine reine Secret-Rotation — siehe Sub-Ticket 06.3. |

Alle vier Entscheidungen sind **Vorschläge zur ADR-Erhebung** (DoD: „ADR bei
Architektur-Entscheidung") — Musti reviewt sie in Sub-Ticket 06.1, bevor das erste echte
`apply` läuft.

## 2. Verzeichnisstruktur

```
infra/
  README.md                      # diese Betriebsanleitung + Credential-Checkliste
  .gitignore                     # tfstate/.terraform/*.tfvars/*.kubeconfig — nie ins Repo
  terraform/
    versions.tf                  # Provider-/Versions-Pins (OpenTofu-kompatibel)
    backend.tf                   # Remote-State (Hetzner Object Storage) — auskommentiert bis 06.1
    variables.tf                 # jede Skeleton-vs-real-Abweichung ist eine Variable
    main.tf                      # Netz, Firewall, k3s-Node(s) via cloud-init
    outputs.tf                   # IPs + Kubeconfig-Hinweis (Kubeconfig NIE als Output)
    terraform.tfvars.example     # Template — echte Werte in git-ignoriertes terraform.tfvars
  k3s/
    cloud-init.yaml              # k3s-Server-Bootstrap (first boot)
  manifests/
    base/                        # Ziel-Topologie: API:3000, Web:8080, Redis, Ingress
      kustomization.yaml
      configmap.yaml             # Origins/Port/TRUSTED_PROXIES (nicht-secret)
      api-deployment.yaml        # inkl. migrate-InitContainer (compose-Pendant)
      api-service.yaml           # ClusterIP — nur über Proxy erreichbar
      web-deployment.yaml        # Expo-Export auf :8080 (Build-zeit-Origin!)
      web-service.yaml
      redis-deployment.yaml      # BullMQ-Queues + Cache (ADR-047)
      redis-service.yaml
      ingress.yaml               # nginx + cert-manager, TLS, API nur via Proxy
      secrets.example.yaml       # Secret-Form (NICHT anwenden) — 06.3 versiegelt
    overlays/
      staging/kustomization.yaml
      prod/kustomization.yaml
```

## 3. Abbildung der Ziel-Topologie (`docker-compose.prod.yml` → k3s)

| compose-Dienst | k3s-Pendant | Anmerkung |
|---|---|---|
| `postgres` | **managed EU-Postgres** (extern) | ADR-047/049: kein StatefulSet; `DATABASE_URL` im Secret. |
| `migrate` (one-shot) | **initContainer** in `api` | Gleiches Bild, gleiche Rolle (`prisma migrate deploy`), ein Dockerfile. |
| `api` (:3000) | `api` Deployment + ClusterIP Service | Nur via Ingress/Proxy erreichbar (REQ-010-Eigenschaft). |
| `web` (:8080) | `web` Deployment + ClusterIP Service | `EXPO_PUBLIC_API_BASE_URL` ist **Build-zeit** eingebacken → pro Umgebung ein Image. |
| Chromium-PDF | **im `api`-Image** (kein Dienst) | Siehe `apps/api/Dockerfile`; Memory-Limits bewusst gesetzt. |
| Redis | `redis` Deployment + Service | Bleibt auf dem Cluster (ADR-049); Postgres ist das Einzige, das managed wird. |

## 4. Betriebsanleitung (stoppt an der Credential-Grenze)

**Ohne Credentials — was heute läuft (nur Validierung, kein Effekt auf echte Infra):**

```sh
# HCL syntaktisch/strukturell prüfen (lädt den Provider; reicht ohne Token):
cd infra/terraform && tofu init && tofu validate      # oder: terraform init && terraform validate

# Manifeste lokal auf gültiges YAML/Struktur prüfen (kein Cluster nötig):
kubectl apply -k infra/manifests/base --dry-run=client
kubectl apply -k infra/manifests/overlays/staging --dry-run=client
```

**Ab der Credential-Grenze (Blocker — siehe Checkliste unten) gilt: hier stoppt Slice 1.**
Die echten Schritte (`tofu plan`/`apply` gegen ein Hetzner-Projekt, `kubectl` gegen den
echten Cluster, `kubeseal`, `kubectl apply -k` ohne `--dry-run`, GHCR-Push) sind Sub-Ticket
06.1 ff. und beginnen erst, wenn die Credentials vorliegen.

## 5. Credential-/DNS-Checkliste — für NexusHero (explizite Blocker)

Jeder Punkt ist ein **harter Blocker** für den weiteren Track. Ohne ihn kann kein Sub-Ticket
von „Skelett" zu „echt" übergehen. Nichts davon gehört ins Repo.

1. **Hetzner Cloud API-Token** (Project, read/write) — für `hcloud_token` (Terraform).
2. **Domain + DNS-Verwaltung** — z. B. `steuereule.example`; A-Records für `api.` und `www.`
   (und `*.staging.`). Hetzner-DNS-API-Token, falls DNS via Hetzner läuft.
3. **EU-Region-Entscheidung** (ADR-020, DSGVO-relevant) — `fsn1`/`nbg1` (DE) oder `hel1`
   (FI); festhalten, nicht stillschweigend defaulten.
4. **Container-Registry** — GHCR (ADR-049): Org/Namespace `ghcr.io/steuereule/*` + Token mit
   `packages:write` für `deploy.yml`.
5. **Managed-Postgres-Credentials** — Host, User, Passwort, Datenbankname; EU-Region, PITR
   aktiv (ADR-047: Backups/PITR/Verschlüsselung „nicht von Hand tragen").
6. **Redis-Credentials** — Passwort für den Cluster-Redis (falls später managed Redis:
   dessen Endpoint).
7. **App-Secrets** (acht Werte aus `.env.example`/`secrets.example.yaml`):
   `GUEST_SESSION_SECRET`, `PRISMA_FIELD_ENCRYPTION_KEY` (REQ-003), `BETTER_AUTH_SECRET`,
   `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (echt, erst mit #170), `DATABASE_URL`,
   `REDIS_URL`/`REDIS_PASSWORD`.
8. **Let's-Encrypt-Konto/E-Mail** + `cert-manager` ClusterIssuer-Ziel (HTTP-01 oder DNS-01).
9. **`TRUSTED_PROXIES`-CIDR** — der echte ingress-nginx-Pod/Service-CIDR (Sub-Ticket 06.8);
   ohne ihn bleibt REQ-010 unbeweisbar.
10. **SSH-Public-Key(s)** für Node-Zugriff (`ssh_public_keys`).

## 6. arm64-Befund (Slice 1, gemessen — nicht vermutet)

Der README-Abschnitt „Apple Silicon (arm64) — genuinely unverified" wird durch diesen
Befund abgelöst. Gemessen auf Apple Silicon (Docker via colima, Builder `linux/arm64`):

```
docker buildx build --platform linux/arm64 --load -t steuereule-api:arm64-test \
  -f apps/api/Dockerfile .                     # EXIT_CODE=0
docker image inspect steuereule-api:arm64-test --format '{{.Architecture}}/{{.Os}}'
                                               # arm64/linux
docker run --rm --platform linux/arm64 --entrypoint node \
  steuereule-api:arm64-test -e 'console.log(process.arch, process.platform)'
                                               # arch=arm64 platform=linux
```

Der im Dockerfile benannte echte Risikopunkt — Prisma löst sein Engine-Binary unter
`"native"` pro Architektur — ist damit **auf arm64 gemessen grün**: `prisma generate`
(v6.19.3) lief im arm64-Builder durch, und Playwright zog die arm64-Binaries
(`chromium-linux-arm64.zip`, `ffmpeg-linux-arm64.zip`, `chromium-headless-shell-linux-arm64.zip`).
Das `web`-Image und ein vollständiger Boot-Smoke gegen Postgres+Migrate sind **06.7** (der
README-Abschnitt wird dort vollständig ersetzt; bis dahin gilt der Befund hier für das
API-Image: Build + Prozess-Boot, noch nicht der komplette App-Stack).

## 7. Was dieses Skelett bewusst NICHT tut (→ Sub-Tickets)

- Kein echtes `apply`, kein Cluster, keine Accounts (Credential-Blocker oben).
- Kein managed Postgres/Redis provisioniert (06.2), keine Secrets versiegelt (06.3),
  keine Pipeline (06.4), keine Observability (06.5), keine Backups/DR (06.6),
  kein `web`-arm64-Bild (06.7), kein TRUSTED_PROXIES-Abschluss (06.8).
- Die Tool-Entscheidungen sind noch **keine** ADR — das ist Sub-Ticket 06.1.
