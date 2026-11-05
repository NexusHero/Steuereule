# ADR-0053 — Beta-Hosting auf Google Cloud Run und Cloud SQL

- **Status:** Accepted (Stakeholder-Entscheidung NexusHero, 2026-11-04)
- **Date:** 2026-11-04
- **Deciders:** NexusHero (Stakeholder); Musti — Architektur-Review auf dem PR
- **Ändert:** Produkt-ADR-049 (k3s auf Hetzner) — gilt erst wieder, wenn Last oder
  Verfügbarkeit es verlangen; ADR-0026 (lokaler Compose-Stack bleibt das lokale Gegenstück)

## Kontext

Die Beta startet mit höchstens zehn Testern. Das Zielbild aus Produkt-ADR-049 (k3s-Cluster,
Load Balancer, verwaltetes Postgres bei einem Drittanbieter) kostet rund 30–60 € im Monat und
verlangt, dass wir Cluster, Backups und Updates selbst betreiben. Infra #292 hängt seit Wochen
an genau diesem Aufwand.

Verglichen wurden (netto, grob, November 2026):

| | Hetzner, eine VM mit Compose | Google Cloud Run + Cloud SQL |
|---|---|---|
| Erstes Jahr | ~95–135 € | ~130 € (die ersten 90 Tage deckt das Startguthaben) |
| Ab Jahr 2 | ~95–135 € | ~165 € |
| Backups, PITR, Logs, Secrets | selbst betrieben | verwaltet |
| Anbieter | deutsch | US-Anbieter, Rechenzentrum in der EU |

## Entscheidung

Die Beta läuft auf Google Cloud in **`europe-west4`** (Niederlande):

- **Cloud Run** betreibt zwei Dienste aus den bestehenden Images: `steuereule-api`
  (1 vCPU, 2 GiB wegen Chromium) und `steuereule-web`. Beide skalieren auf null, höchstens
  zwei Instanzen.
- **Cloud Run Job** `steuereule-migrate` führt `prisma migrate deploy` mit dem API-Image aus,
  vor jedem API-Rollout — das Pendant zum `migrate`-Dienst im Compose-Stack.
- **Cloud SQL** Postgres 16, Stufe `db-f1-micro`, tägliche Backups und PITR. Die API verbindet
  sich über den Unix-Socket, den Cloud Run bereitstellt; es gibt keine freigegebenen Netze.
- **Secret Manager** hält alle Secrets. OpenTofu legt nur die leeren Secrets an; die Werte
  erzeugt `scripts/infra/gcp-setup.sh` lokal und schreibt sie direkt hinein. So landet kein
  Secret im Tofu-State.
- **Artifact Registry** statt GHCR, mit Aufräumregel (die letzten fünf Images bleiben).
- **GitHub Actions** deployt per Workload Identity Federation, ohne langlebigen Schlüssel.
  Der Zugang ist auf `NexusHero/Steuereule` beschränkt.
- **Eigene Domain** mit `www.` (Web) und `api.` (API) über Cloud-Run-Domain-Mappings.
  Die `*.run.app`-Adressen liegen auf der Public Suffix List; Web und API wären damit zwei
  Sites, das Session-Cookie ein Third-Party-Cookie, und Safari würde den Login blockieren.
  Domain-Mappings sind der Grund für `europe-west4` statt Frankfurt.
- **Budget-Alarm** bei 20 € im Monat.

Der Hetzner-Teil unter `infra/terraform`, `infra/k3s` und `infra/manifests` bleibt als
Zielbild für später liegen, wird aber nicht deployt.

## Konsequenzen

- **Kosten:** ~12–15 € im Monat, unabhängig davon, ob ein oder zehn Tester aktiv sind; fast
  alles davon ist Cloud SQL. Zwischen Testrunden kann die Instanz angehalten werden (~2–3 €).
- **Kaltstart:** Nach Leerlauf braucht die erste Anfrage 5–10 Sekunden. Eine dauerhaft warme
  Instanz würde ~50 € im Monat kosten und ist für die Beta nicht vorgesehen.
- **Datenschutz:** Google ist ein US-Anbieter (CLOUD Act). Das gehört in die DSFA und in die
  Datenschutzerklärung; der AVV mit Google ist vor dem ersten echten Tester abzuschließen.
- **Vor dem ersten Rollout zu prüfen:**
  - dass Cloud-Run-Domain-Mappings in `europe-west4` verfügbar sind (`gcloud beta run
    domain-mappings create` scheitert sonst sofort; Ausweg wäre ein Load Balancer für ~18 €);
  - welche Peer-Adresse die API hinter Cloud Run sieht. `TRUSTED_PROXIES` ist als
    Repo-Variable gesetzt und mit `169.254.0.0/16` vorbelegt; ein falscher Wert lässt alle
    Tester einen gemeinsamen Rate-Limit-Topf teilen (fail-closed, nicht fail-open).
- **Bewusste Abweichungen:** `/v1/health/*` ist öffentlich erreichbar, weil Cloud Run keinen
  zweiten, internen Port kennt (#344 gilt erst für ein Cluster). Die Endpunkte geben nur
  `ok`/`error` zurück. Redis entfällt, bis BullMQ-Queues tatsächlich gebaut werden.
- **Bekanntes Risiko:** Cloud Run beendet Instanzen nach Leerlauf. Ein abgestürzter
  Chromium-Prozess wird heute nicht neu gestartet (#288); der nächste Kaltstart heilt das,
  ein langlebiger Prozess nicht.

## Alternativen

- **Hetzner, eine VM mit Compose:** etwas günstiger ab Jahr 2, deutscher Anbieter. Abgelehnt,
  weil Backups, PITR, Updates und Monitoring dann selbst zu betreiben wären.
- **k3s auf Hetzner (Produkt-ADR-049):** für zehn Tester zu teuer und zu aufwendig.
- **Global External Load Balancer statt Domain-Mappings:** erlaubt Frankfurt, kostet aber
  ~18 € im Monat zusätzlich. Bleibt der Ausweg, falls die Domain-Mappings nicht verfügbar sind.
