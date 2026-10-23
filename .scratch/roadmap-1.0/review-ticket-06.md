# Review-Report — Track 06, Slice 1 (Branch `track-06-infra-slice-1`, Commit b57188d)

**Reviewer:** Musti (Lead Developer / Architect)
**Branch-Autor:** Salih
**Scope:** `git diff ae25d19..HEAD` — 31 Dateien (`infra/`, `.github/workflows/deploy.yml`,
`.scratch/roadmap-1.0/issues/track-06/`)

---

## 1. Gesamturteil: **APPROVE**

Der Slice tut genau das, was er verspricht, und tut es sauber: ein lauffähiges, validiertes
IaC-Skelett, das hart an der Credential-Grenze stoppt, plus ein ehrlicher Feinschnitt des
Rest-Tracks in acht Tracer-Sub-Tickets. Kein einziger Blocker; alle Findings sind
Draft-Level- oder Konsistenz-Punkte, die sauber in 06.1/06.4/06.7 auflösen.

**Was verifiziert wurde (positiv):**

- **Terraform-HCL ist real valide.** `terraform fmt -check` ist sauber; `terraform init -backend=false`
  + `terraform validate` → *Success* gegen den echten `hetznercloud/hcloud`-Provider. Kein
  `tofu`-Binary im Worktree → mit `terraform` geprüft (siehe §3).
- **Manifeste sind YAML-gültig** (Ruby-YAML-Parse über alle 14 YAML-Dateien, inkl. beider
  Overlays und `cloud-init.yaml`). `kubectl apply -k --dry-run=client` selbst nicht re-verifiziert
  (kein `kubectl`), siehe §3.
- **Der InitContainer spiegelt Compose exakt.** `api-deployment.yaml:29`
  (`cd /repo && pnpm --filter @steuereule/api migrate:deploy`) ist zeichengleich mit
  `docker-compose.prod.yml:59`. Die Readiness-URL `/v1/auth/capabilities`
  (`api-deployment.yaml:49-51`) stimmt mit `@Controller('v1/auth')` + `@Get('capabilities')`
  überein.
- **Keine Secrets eingecheckt.** `git grep -i "secret\|token\|password" infra/` liefert nur
  Kommentare, `REPLACE_ME`-/`CHANGE_ME`-Platzhalter und leere `stringData`-Felder.
  `secrets.example.yaml` ist **nicht** in `base/kustomization.yaml` gelistet (grep leer) —
  `kubectl apply -k` kann es nicht versehentlich anwenden. `infra/.gitignore` ignoriert
  `*.tfvars`/`*.tfstate*`/`.terraform/`/`*.kubeconfig` und ent-ignoriert nur
  `*.tfvars.example`.
- **ADR-Konformität sichtbar abgedeckt.** k3s/Hetzner (ADR-049) und managed EU-Postgres +
  Redis-on-cluster (ADR-047) sind in `main.tf`, `api/redis`-Manifesten und `infra/README.md`
  §3 abgebildet; EU-Region (ADR-020) in `variables.tf:15-18` + Checkliste Punkt 3;
  `TRUSTED_PROXIES`-Plan (REQ-010) in `configmap.yaml`, Ingress-Topologie und Sub-Ticket 06.8;
  Key-Rotation (REQ-003) in `secrets.example.yaml:30` + Sub-Ticket 06.3 (ADR-0008-Mechanik).
- **Credential-Grenze hält.** Kein Platzhalter würde in Produktion funktionieren:
  `CHANGE_ME_PROXY_CIDR` ist kein gültiges CIDR, `hcloud_token = REPLACE_ME` scheitert an der
  Provider-Auth, leere Secrets lehnt die `resolve*()`-Guard unter `NODE_ENV=production` ab
  (ADR-0008/0012).
- **Draft-Charakter von `deploy.yml` ist unmissverständlich.** Header + `if: false` am
  `terraform-apply`-Stub; `ci.yml` wird im Diff **nicht** angefasst (nur `deploy.yml` ist neu).

---

## 2. Findings

### F1 — `deploy.yml` `tofu plan` läuft auch mit Token nie durch (Medium)

`deploy.yml:76-77` schreibt nur `hcloud_token` nach `ci.auto.tfvars`; `domain`
(`variables.tf:31`) und `ssh_public_keys` (`variables.tf:36`) haben **keine** Defaults.
Verifiziert: `terraform plan` mit token-only-`tfvars` bricht mit
`Error: No value for required variable … "domain" … "ssh_public_keys"` ab. Der Kommentar
`deploy.yml:78-81` ("plan is exercised against the skeleton defaults via a stub tfvars") ist
damit unzutreffend — der Plan scheitert an fehlenden Variablen, nicht an der Provider-Auth.
Der Slice stoppt zwar ohnehin an der Credential-Grenze, aber die Stelle verspricht eine
Plan-Form, die es so nicht gibt.

*Vorschlag:* Im Stub zusätzlich `domain` und `ssh_public_keys` (Dummy-Werte) in
`ci.auto.tfvars` schreiben — oder `domain`/`ssh_public_keys` Defaults geben (leer + explizit
"setzen Sie das in 06.1"). Damit der `plan`-Job tatsächlich bis zur Provider-Grenze läuft.

### F2 — Credential-Gate blockiert auch das credential-freie `tofu validate` (Low)

`deploy.yml:48-65`: der Gate (`exit 1` ohne `HCLOUD_TOKEN`) liegt **vor** `tofu init + validate`.
Damit läuft die einzige ohne Credentials sinnvolle Prüfung (HCL-Validierung) auf jedem
`infra/**`-PR ebenfalls nicht — jeder PR ohne Secret zeigt Rot, ohne dass `validate` jemals läuft.
Der Header `deploy.yml:10-11` behauptet, `validate`/`plan` liefen "when the HCLOUD_TOKEN secret
is configured" — also ist auch `validate` ungewollt gegatet.

*Vorschlag:* Reihenfolge tauschen: `tofu validate` bedingungslos (fängt HCL-Fehler auf jedem
infra-PR), Gate nur vor `tofu plan`/`apply`.

### F3 — Redis-AOF-Kommentar widerspricht `emptyDir` (Low)

`redis-deployment.yaml:5` behauptet, AOF-Persistenz halte "an in-flight queue survives a pod
restart". `emptyDir` (`redis-deployment.yaml:51`) überlebt aber nur einen **Container**-Restart
innerhalb desselben Pods, nicht einen Pod-Restart/Reschedule. Zeile 51 sagt das korrekt
("emptyDir survives only the pod lifecycle") — Zeile 5 verspricht also eine Haltbarkeit, die
die aktuelle Konfiguration nicht liefert. Genau die Art "why"-Kommentar, die nicht mit dem
Was driften darf.

*Vorschlag:* Zeile 5 auf "survives a container restart" präzisieren (PVC-Ausbau bleibt 06.2).

### F4 — `node_count > 1` ergibt N Einzel-Cluster, nicht HA (Low)

`main.tf:57` (`count = var.node_count`) kombiniert mit dem einzigen `server`-Role in
`cloud-init.yaml:23` (`sh -s - server`): bei `node_count = 3` entstehen drei unabhängige
Single-Node-Cluster (jedes erzeugt sein eigenes Token), kein 3-Node-HA. `variables.tf:25-28`
("3 for prod HA (later)") und der Cloud-init-Kommentar (nur "Token teilen") untertreiben das:
das Token ist notwendig, aber **nicht** hinreichend — es fehlt überhaupt ein Agent-/Join-Pfad.

*Vorschlag:* `variables.tf`-Beschreibung korrigieren ("HA braucht Agent-Nodes + Join-Mechanik,
eigenes Sub-Ticket") oder den `node_count`-Default klar als "nur 1 sinnvoll" markieren.

### F5 — Blocking-DAG im Track-README zeichnet nicht die echten Edges (Low)

Der ASCII-DAG in `.scratch/roadmap-1.0/issues/track-06/README.md` zeigt `06.4` nur an `06.1`
hängend, obwohl `06-4-cicd-staging-prod.md` `06.1 + 06.2 + 06.3` als Blocker deklariert;
ebenso fehlt die `06.2 → 06.3`-Kante (in `06-3-secrets-management-key-rotation.md` steht
`06.1 + 06.2`) und `06.6` hängt an `06.2` (nicht direkt an `06.1`). Die Einzel-`Blocked by`-Felder
sind untereinander konsistent und sinnvoll — nur das Diagramm bildet sie nicht ab und ist
visuell mehrdeutig.

*Vorschlag:* DAG an die `Blocked by`-Zeilen angleichen (oder explizit als "transitive Hülle"
kennzeichnen). Langfristig maschinenlesbare Edges (eine Zeile je Kante) statt ASCII-Kunst.

### F6 — Firewall-Skelett liefert öffentliches 6443 + Welt-SSH aus (Low, bewusst vertagt)

`main.tf:46-48` öffnet `6443` auf `0.0.0.0/0`, `main.tf:26` SSH auf `0.0.0.0/0`/`::/0`. Beides
trägt "tighten in 06.1"-Kommentare — aber `06-1-cluster-provisioning-k3s-hetzner.md` AC verlangt
"internes 6443", was das Skelett nicht abbildet. Für ein 1.0-Beta mit Single-Node ist
Welt-SSH/Welt-6443 der riskanteste vertagte Punkt; die AC-Formulierung und das Skelett sollten
nicht auseinanderlaufen.

*Vorschlag:* 06.1-AC präzisieren ("6443 auf Operator/CI-CIDR einschränken, im Slice-1-Skelett
noch 0.0.0.0/0"), damit die Absicht nicht als erfüllt gelesen wird.

### F7 — Root-README und `infra/README.md` driften beim arm64-Befund auseinander (Low)

`README.md:31` sagt weiterhin "nobody has built or run this stack on arm64 yet", während
`infra/README.md` §6 einen gemessenen arm64-Build des **API**-Images dokumentiert. Das
`infra/README` scoped den Befund ehrlich (Build + `node`-Prozess-Boot, "noch nicht der komplette
App-Stack") und verschiebt den Root-README-Ersatz explizit auf 06.7 — im Zwischenzustand stehen
aber zwei READMEs mit scheinbar widersprüchlichem Stand.

*Vorschlag:* In `README.md:31` eine Ein-Zeilen-Querverweis auf `infra/README.md` §6 ergänzen
(oder in 06.7 als erster Schritt den Root-README-Satz aktualisieren). Kein Blocker.

### F8 — Prod-Overlay-ConfigMap-Patch ist weitgehend ein No-op (sehr low, kosmetisch)

`overlays/prod/kustomization.yaml` patcht `BETTER_AUTH_URL`/`CORS_ALLOWED_ORIGINS`/`WEB_APP_URL`
auf Werte, die identisch mit der Base sind (`*.steuereule.example`); nur die
`TRUSTED_PROXIES`-Zeile ändert real etwas. Nicht falsch, aber der Patch suggeriert eine
Umgebungs-Differenz, die (noch) keine ist — die echte Prod-Domain kommt erst in 06.4.

*Vorschlag:* Kommentar im Prod-Overlay ergänzen ("Prod-Werte sind noch Platzhalter, landen in
06.4") — oder den No-op-Patch bis dahin auslassen.

---

## 3. Nicht re-verifizierte Punkte

- **`tofu` selbst nicht ausgeführt.** Im Worktree ist nur `terraform`
  (`/opt/homebrew/bin/terraform`) vorhanden, kein `tofu`. `fmt -check`, `init -backend=false`
  und `validate` liefen gegen `terraform` (alle grün). Die tofu-spezifische Sicht
  (`opentofu/setup-opentofu@v1` mit `1.8.0`, `tofu init -backend=false`) wurde nicht nachgestellt.
- **`kubectl apply -k --dry-run=client` nicht nachvollzogen.** Weder `kubectl` noch `kustomize`
  im Worktree. YAML-Syntax über Ruby geparst (alle 14 Dateien gültig), aber Kustomize-Merge,
  Overlay-Patches und k8s-Schema wurden nicht maschinell geprüft.
- **`hcloud`-Provider-Pin nicht gegen die Registry gegengeprüft.** `versions.tf:24`
  (`~> 1.48`) vs. Kommentar "~> 1.4x" ist eine kleine Diskrepanz; die exakt aktuelle
  Provider-Version wurde nicht nachgeschlagen (die Schema-Validierung lief aber gegen den
  tatsächlich geladenen Provider).
- **arm64-Befund nicht nachgemessen.** Der Build/Boot-Befund in `infra/README.md` §6 ist die
  Messung des Autors (Apple Silicon / colima); ich habe nur die ehrliche Formulierung
  (was gemessen, was nicht: nur API-Image + `node`-Prozess-Boot, kein voller App-Stack, `web`
  und Boot-Smoke auf 06.7 vertagt) bewertet, nicht selbst gebaut.
- **`deploy.yml` nicht auf GitHub Actions ausgeführt.** Runner-Verhalten, Secret-Wiring und die
  tatsächliche Fehlermeldung des Gates wurden nicht live geprüft (nur der `tofu plan`-Pfad
  lokal nachgebaut, siehe F1).

---

*Ende des Reviews — APPROVE, keine Blocker; F1/F2 vor Aktivierung von `deploy.yml` in 06.4
beheben, der Rest läuft als Konsistenz-Nacharbeit in den jeweiligen Sub-Tickets mit.*
