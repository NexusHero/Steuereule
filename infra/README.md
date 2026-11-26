# Infra

## Active target: Google Cloud Run + Cloud SQL (ADR-0053)

`infra/gcp/` describes one environment in `europe-west4`: Cloud SQL (Postgres 16, private IP only, a separate
keystore instance), Memorystore Redis with AUTH and TLS, Artifact Registry, Secret Manager (empty secrets; the
wizard fills them), service accounts, Workload Identity for GitHub Actions, monitoring alerts with an uptime
check, and a budget alert. The Cloud Run services themselves are rolled out by `.github/workflows/deploy.yml`.

What the API needs at runtime is declared once in `apps/api/src/config/production-config.ts`: name, format and
where each value comes from. On a deployment the API refuses to start while any value is missing, malformed or
still a development value published in this repository, and names each one. The unit test
`apps/api/test/config/deployment-wiring.test.ts` compares that list with `deploy.yml`, `infra/gcp/main.tf`, both
Dockerfiles, `docker-compose.prod.yml`, `.env.example` and the wizard, so a value without a path to Cloud Run
fails CI.

### Two environments: staging and production (ADR-0109)

Each environment is its own GCP project with its own OpenTofu state prefix and its own GitHub environment
(`staging`, `production`). The first stack keeps the name `beta` (prefix `steuereule/beta`, resource names
unchanged) and serves as staging.

- **staging** is deployed by hand, and after every green `Build & E2E` run on `main` once the repository variable
  `DEPLOY_STAGING_AUTO` is `true`. Until then the automatic run skips its jobs; it shows "skipped", not "success",
  and creates no deployment record.
- **production** is deployed by hand only (Actions, Deploy, Run workflow, `environment = production`), bound to
  the GitHub environment `production`, whose required reviewers must approve.
- **Every deploy variable lives in its GitHub environment, none at repository level.** The deploy lists the
  repository-level ones and refuses to run while any exists, because a repository-level value silently fills
  in for an environment that lacks it. `GCP_ENVIRONMENT` must equal the environment's name. The one
  repository-level variable is the switch `DEPLOY_STAGING_AUTO`.

### First deployment, in order

The wizard does steps 1 to 14; run it from the repo root. It is idempotent: a second run keeps every
secret that already has a value.

```sh
scripts/infra/gcp-setup.sh                         # staging (the "beta" stack)
TF_ENVIRONMENT=production scripts/infra/gcp-setup.sh   # production, in its own project
```

Before you start you need: a Google account with a billing account, `gcloud`, `gh` (logged in as a repository
admin), `tofu` or `terraform`, `openssl`, `curl`, `jq`; a domain whose DNS you control; a Brevo account; a
Stripe account (test mode for staging and the beta); the operator details for the Impressum.

1. Sign in to `gcloud` twice (CLI and Application Default Credentials).
2. Billing account and project; link them.
3. Domain (web on `www.`, API on `api.`), sender address, the address that receives alerts, the monthly budget
   (wizard default 60 EUR for staging, 250 EUR for production; a guideline for Cloud SQL, Redis and Cloud Run together).
4. State bucket (`<project>-tfstate`, versioned, no public access).
5. `tofu apply` with `environment`, `github_environments`, `alert_email`, `api_hostname=api.<domain>` and
   `monthly_budget_eur`. Creates everything listed above. Costs start here.
6. Generated secrets: `GUEST_SESSION_SECRET`, `BETTER_AUTH_SECRET`, `PRISMA_FIELD_ENCRYPTION_KEY`,
   `PRISMA_FIELD_ENCRYPTION_HASH_SALT` (before the first migration, ADR-0109 §12), `KEYSTORE_MASTER_KEY`.
7. Database users (row-level security, P11). Three secrets, two logins on the tax-data instance:
   - `MIGRATE_DATABASE_URL`: the user `steuereule`, created with `gcloud sql users create`. It owns the tables
     and runs migrations, backfills and `rotate:field-key`. Only the migrate job reads this secret; it runs as
     its own service account (`steuereule-migrate`), and the API's account has no access to it.
   - `DATABASE_URL`: the user `steuereule_api`, what the API connects as. The wizard only generates its password
     and stores the URL; the migrate job creates the login from it on every run (`RUNTIME_DATABASE_URL` in the
     job, `apps/api/scripts/runtime-database-login.mjs`): no SUPERUSER, BYPASSRLS, CREATEROLE or CREATEDB,
     owner of nothing, member of `steuereule_app` and of nothing else. Do not create it with `gcloud sql users
     create`: such a user is a member of `cloudsqlsuperuser`, and the API refuses to start as it.
   - `KEYSTORE_DATABASE_URL`: the keystore instance keeps one user for now (see "Residuals" in ADR-0111).
   The migration `…_p11_row_level_security` creates the role `steuereule_app` (no login) that holds the table
   rights; the policies bind it. In production the API checks its login at boot and refuses to start as the
   owner, as a role with one of the attributes above, or as a member of any other role.
   To rotate the API's password: store a new version of `DATABASE_URL` with a new password and deploy; the
   migrate job sets it before the new revision starts. A setup from before this split (where `DATABASE_URL`
   held the owner) is converted by running the wizard again: it gives the owner a new password, which only
   `MIGRATE_DATABASE_URL` holds, and destroys the earlier versions of `DATABASE_URL`, which the API's service
   account could read. The migrate job must run (deploy) before the API starts again: until then the API has
   no valid login. In the local production-shaped stack the keystore shares the server and gets a login of its
   own (`KEYSTORE_RUNTIME_DATABASE_URL` of the migrate service); the API refuses to start if its keystore login
   there is a superuser or can become the owner of the tax-data tables.
8. Brevo: authenticate the sender domain by DNS, store `BREVO_API_KEY`.
9. Stripe (required on a deployment, so the printout never ends in "payment not set up"):
   - two products with a one-time price each, the standard printout and the printout with self-employment;
     store `STRIPE_PRICE_ID` and `STRIPE_PRICE_ID_SELBSTSTAENDIG`;
   - in Settings, Public details, the terms URL `https://www.<domain>/rechtliches/agb` (Checkout asks for
     consent to the terms and refuses without it);
   - `STRIPE_SECRET_KEY` (`sk_test_…` for the beta);
   - a webhook endpoint `https://api.<domain>/v1/zahlung/stripe/webhook` with the events
     `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `charge.refunded`,
     `charge.dispute.created` and `charge.dispute.closed` (refunds and disputes revoke the unlock); store its
     `STRIPE_WEBHOOK_SECRET`.
10. Optional: Google login (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, redirect URI
    `https://api.<domain>/api/auth/callback/google`).
11. Operator details: `EXPO_PUBLIC_BETREIBER_NAME`, `_ANSCHRIFT`, `_EMAIL` (required), `_VERTRETEN`, `_USTID`.
12. GitHub environment: the wizard creates it with deployments from `main` only, and for production with you as
    required reviewer. **If that call fails** (missing admin rights, or a private repository on a plan without
    environment reviewers), do it by hand before the first deploy: Settings, Environments, New environment;
    Deployment branches and tags: Selected, `main`; for production: Required reviewers.
13. GitHub environment variables: `GCP_ENVIRONMENT`, `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`,
    `GCP_DEPLOYER_SA`, `GCP_RUNTIME_SA`, `GCP_MIGRATE_SA`, `GCP_WEB_SA`, `GCP_SQL_INSTANCE`, `GCP_KEYSTORE_SQL_INSTANCE`,
    `GCP_VPC_NETWORK`, `GCP_VPC_SUBNET`, `APP_DOMAIN`, `EMAIL_FROM`, `TRUSTED_PROXIES` and the operator details.
14. First deploy (`gh workflow run deploy.yml --ref main -f environment=<staging|production>`): builds the three
    images, backs up the database, runs the migrate job (hash phase), deploys API and web, smoke-tests them.
    For staging the wizard then offers to set `DEPLOY_STAGING_AUTO=true`.
15. Domain: verify it in Search Console, create the Cloud Run domain mappings for `www.` (service `steuereule-web`,
    the app), `api.` (`steuereule-api`) and the bare domain (`steuereule-website`, the marketing site, whose links
    go to `www.`), set the DNS records the wizard prints, wait for the certificates (up to about an hour).
16. Check on the real system (OPS-5; none of this has been run against a deployment yet):
    - `https://api.<domain>/v1/health/ready` answers, the web app loads, sign-up mail arrives;
    - the API log shows no rate-limiter degradation warning (Redis over TLS with `REDIS_TLS_CA` works);
    - a receipt upload goes through (upload admission over real HTTP);
    - a test purchase with a Stripe test card unlocks the printout, and the webhook shows as delivered in Stripe;
    - a deliberate error appears as an alert (the log filter `Unhandled error` in `monitoring.tf` matches);
    - the uptime check is green in Cloud Monitoring.
17. `TRUSTED_PROXIES`: read the peer address of a request in the Cloud Run logs. With direct ingress it is in
    `169.254.0.0/16`, which the wizard sets. Change it only if traffic goes through an external load balancer
    (then add its ranges `35.191.0.0/16,130.211.0.0/22`), and deploy again.
18. After the release, run the encryption phase of the identity backfill in the image:
    `node --import tsx scripts/backfill-identity.ts` (ADR-0109 §12).
19. Ask a repository admin to add the four missing required checks (`docs/ci-pipeline.md`, Required checks).

### Rotating the field key (ADR-0008, REQ-003)

`PRISMA_FIELD_ENCRYPTION_KEY` encrypts every column the schema marks `/// @encrypted`. The API writes with it
and reads with it and with every key in `PRISMA_FIELD_DECRYPTION_KEYS`. A new key alone moves a value only when
the app next writes it, so the old key may be dropped only after `rotate:field-key` has re-encrypted the rest.
It takes the columns from the schema annotations, rewrites only values under a retired key, leaves `updatedAt`
and the e-mail hash alone, and is idempotent and resumable.

1. Generate a key (`k1.aesgcm256.$(openssl rand -base64 32)`). Add the current key to
   `PRISMA_FIELD_DECRYPTION_KEYS` (comma-separated, keep earlier ones that are still in use), then make the new
   key the new version of `PRISMA_FIELD_ENCRYPTION_KEY`.
2. Deploy. API and migrate job both carry the decryption keys; new writes use the new key.
3. Re-encrypt the rest in the migrate job, which connects as the migration login (the tables' owner). The API's
   login cannot rewrite the book's append-only rows (the trigger lets only the owner of the table through);
   this job can, and only their encrypted columns:
   `gcloud run jobs execute steuereule-migrate --region <region> --wait --args="-c,cd /repo/apps/api && node --import tsx scripts/rotate-field-encryption-key.ts"`
4. Check: the same command with `rotate-field-encryption-key.ts --check` must end with "every encrypted value
   is under the current key". It exits 1 while values remain under a retired key, or when a value is under a
   key that is not configured (fix that before going on: such a value is unreadable to the API too).
5. Remove the old key from `PRISMA_FIELD_DECRYPTION_KEYS` (or disable the secret's version when it held only
   that key) and deploy again.

Backups taken before step 3 still hold values under the old key: keep the old key offline until the last such
backup has expired. Receipt files and `HouseholdPerson.sealed` use the keystore keys, not this one
(`KEYSTORE_MASTER_KEY_PREVIOUS`); they are not part of this procedure.

### Decisions behind the deploy

- **The deploy merges, it does not replace (OPS-12).** The API service is updated with `--update-env-vars` and
  `--update-secrets`. The values the workflow sets are rewritten on every deploy; anything set by hand
  (`AI_KILL_SWITCH`, model choice, daily limits) survives. Remove a hand-set value with
  `gcloud run services update steuereule-api --remove-env-vars NAME`. Moving every runtime value into OpenTofu
  was the alternative; it would mean managing the Cloud Run service in OpenTofu too, which today belongs to the
  workflow.
- **Redis is required on a deployment (OPS-7).** Without it every rate limit and the daily AI cost cap would count
  per instance, up to ten times the limit. The API refuses to start without a `rediss://` `REDIS_URL`.
  `enable_redis = false` is still possible, with the URL of another Redis in the secret.
- **`TRUSTED_PROXIES` (OPS-8).** No default in the workflow: the wizard writes `169.254.0.0/16` into the
  environment, which is right for Cloud Run direct ingress (domain mappings, `*.run.app`). Behind an external
  load balancer every user would share one rate-limit bucket until the LB ranges are added.
- **`NODE_ENV` (OPS-9).** Must be `production`, `development` or `test`; any other value refuses to start. The
  image sets `production`.
- **Street data is in the image, geo-IP is not (OPS-15).** The API image fetches the pinned street extract
  (ODbL, checksum in `apps/api/scripts/fetch-street-data.ts`) and sets `STREET_DATA_PATH`. No geo-IP source is
  pinned (ADR-0024: its licence must be read by a person first), so the device list shows the region as
  unknown. To enable it, pick a source, fetch it with `scripts/fetch-geoip-database.ts`, and mount the file
  (for example a Cloud Storage volume) with `GEOIP_DATABASE_PATH`.
- **Payment on a deployment (OPS-6).** Stripe is required, so the dead end "payment not set up on this
  environment" cannot occur on a deployment; it remains only on a local stack without Stripe.

### Values set by hand

Each of these has a default in code and is set, when needed, with
`gcloud run services update steuereule-api --update-env-vars NAME=value`; the deploy keeps it (OPS-12). The
format and the production rule of each are in `apps/api/src/config/production-config.ts` (source `operator`),
and the API refuses to start with a value it would otherwise ignore.

- Model choice and limits: `AI_ADVISOR_PROVIDER`, `AI_ADVISOR_MODEL`, `AI_VISION_PROVIDER`, `AI_VISION_MODEL`,
  `AI_FALLBACK_PROVIDER`, `AI_FALLBACK_MODEL`, `AI_GUARD_PROVIDER`, `AI_GUARD_MODEL`, `AI_BASE_URL`,
  `OPENAI_BASE_URL` (both local stack only: refused on a deployment, ADR-0111 decision 4), `AI_KILL_SWITCH`, `AI_DAILY_CALL_LIMIT`, `AI_PAID_RESERVE_PERCENT`, `AI_DAILY_MESSAGE_LIMIT`,
  `AI_TURN_TIMEOUT_MS`, `AI_MAX_TOOL_ROUNDS`, `AI_GUARD_TIMEOUT_MS`, `AI_TEMPERATURE`, `AI_ADVISOR_REASONING`,
  `AI_ADVISOR_REASONING_BUDGET`, `AI_ADVISOR_THINKING_LEVEL`. The keys of the model slots are optional secrets.
- Upload and parse limits: `PARSE_DAILY_LIMIT`, `UPLOAD_MAX_IN_FLIGHT`, `GUEST_UPLOAD_BYTES_PER_DAY`,
  `GUEST_UPLOAD_BYTES_PER_DAY_TOTAL`.
- Sign-in and e-mail: `APPLE_SIGN_IN_ENABLED` (with the secrets `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`),
  `EMAIL_DELIVERY` (`smtp`; unset sends through Brevo), `SMTP_URL` (`smtps` for implicit TLS or `smtp` for
  STARTTLS; the mails carry login links, so the API sends none without TLS and a verified server certificate, on
  every run), `SMTP_CA_CERT` (path to the PEM of a private CA that signed the SMTP server certificate; not needed
  for a provider with a publicly trusted certificate; when set, only this CA is trusted), `EMAIL_FROM_NAME`.
- Self-employment (ADR-0101): `SELBSTSTAENDIGE_ENABLED`, `ELSTER_SUPPLIED_LINES_DIR`,
  `ELSTER_TRANSMISSION_ENABLED`, `ELSTER_ERIC_CLI`, `ELSTER_CERT_PATH`, `ELSTER_HERSTELLER_ID` (the PIN is the
  secret `ELSTER_CERT_PIN`).
- Device list: `GEOIP_DATABASE_PATH` (OPS-15, above).

### Network and database size (ADR-0109)

**Private Cloud SQL.** Both instances (tax data and keystore) have a private address only, through
private services access on the VPC `vpc_network` (default `default`; it must exist). Cloud Run reaches
them with Direct VPC egress (`--network`, `--subnet`, `--vpc-egress private-ranges-only`), which has no
connector instances to pay for; the Cloud SQL socket path in `DATABASE_URL` and `KEYSTORE_DATABASE_URL`
(`host=/cloudsql/<connection name>`) and `--add-cloudsql-instances` stay as they are, so no secret
changes. Redis lives in the same VPC. The VPC is now a required part of the stack: the deploy refuses to run
without the GitHub variables `GCP_VPC_NETWORK` and `GCP_VPC_SUBNET` (`gcp-setup.sh` sets them from the
outputs `vpc_network` and `vpc_subnet`). Cost of that: the subnet needs one address per running Cloud
Run instance, and the project needs the `compute` and `servicenetworking` APIs (enabled by this stack).
The pre-deploy backup step (`gcloud sql backups create`) uses the Cloud SQL admin API, not the network, and is unaffected.

**Size.** `db_tier` unset means `db-f1-micro` for beta and staging and `db-custom-1-3840` for production;
`db_high_availability` unset means regional (standby in a second zone) for production only. PITR is already
on for both instances, which is what regional needs. `max_connections` is set to 60 (shared core) or 100;
the arithmetic is in the comment in `main.tf`. Approximate list prices, europe-west4, not a quote: two
`db-f1-micro` about 20 EUR a month, two `db-custom-1-3840` zonal about 100 EUR, regional about 200 EUR
(plus storage). Raise `monthly_budget_eur` for production accordingly.

**Moving an existing stack (beta/staging) to private IP.** Removing the public address cuts off every
client that used it; the API and the migrate job are the only ones, and they need the VPC first. In this order:

1. Make sure the network exists and note its name and subnet in `europe-west4`
   (`gcloud compute networks subnets list --network default --filter region:europe-west4`).
2. `tofu apply -var db_keep_public_ipv4=true ...` (plus the usual variables). This creates the address
   range and the peering and adds the private address next to the public one. Adding a private address
   restarts each instance: expect an outage of the API's database access for a few minutes (it is not measured here).
   Do it in a quiet window.
3. Set the GitHub variables `GCP_VPC_NETWORK` and `GCP_VPC_SUBNET` (outputs `vpc_network`, `vpc_subnet`) and run
   the Deploy workflow. The migrate job and the API revision now carry the VPC. No downtime beyond the normal rollout.
4. Check that the API is healthy (`/v1/health/ready`) and the migrate job succeeded.
5. `tofu apply` again without `db_keep_public_ipv4` (default false). The public address is removed; the instances
   restart again, same short outage as in step 2. After it, a connection through the VPC is the only path.
6. Run the Deploy workflow once more (or hit `/v1/health/ready`) to prove the API still connects.

Rollback of step 5: `tofu apply -var db_keep_public_ipv4=true`. The sequence cannot be rehearsed without a real
project; whether the Cloud Run socket prefers the private address while both exist is not verified here, which is
why step 5 is the real proof. A new stack needs none of this: one `apply`, one deploy.

Alarme (`monitoring.tf`) entstehen mit `alert_email`; was sie bedeuten: [docs/sre/incident-runbook.md](../docs/sre/incident-runbook.md).

Datenbank zwischen Testrunden anhalten und wieder starten:

```sh
gcloud sql instances patch steuereule-<environment> --activation-policy=NEVER
gcloud sql instances patch steuereule-<environment> --activation-policy=ALWAYS
```

## Später: k3s auf Hetzner (nicht aktiv)

Alles unterhalb dieser Zeile beschreibt das Zielbild aus Produkt-ADR-049. Es wird nicht
deployt, bis Last oder Verfügbarkeit es verlangen (ADR-0053).

### k3s auf Hetzner, managed EU-Postgres, Redis (Track 06 / #292)

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

## 5. Credential-/DNS-Checkliste — nur für das inaktive k3s-Ziel

Dieser Abschnitt gehört zum k3s-Zielbild und ist kein Schritt für das aktive Cloud-Run-Deployment; dessen
Schritte stehen oben unter „First deployment, in order“.

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
