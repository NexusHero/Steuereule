# 06.4 — CI/CD-Pipeline Staging/Prod

**What to build:** Das Draft-`deploy.yml` aus Slice 1 wird zur echten Pipeline: GHCR-Images
bauen (ADR-049), auf Staging/Prod als getrennte Umgebungen ausrollen (Kustomize-Overlays), und
`prod-deploy-smoke` (das compose-Pendant aus ADR-0026) läuft auf jeder Stage-Pipeline gegen die
echte URL. Deploys via OpenTofu-Apply + `kubectl apply -k`.

**Blocked by:** 06.1 (Cluster/Kubeconfig) + 06.2 (DB-/Redis-Endpoints) + 06.3
(Secrets-Mechanismus) · Credential-Blöcke (GHCR-Token). Ebenfalls relevant: das Web-Image
bäckt `EXPO_PUBLIC_API_BASE_URL` zur Build-Zeit ein (ADR-0026) — pro Umgebung wird also ein
eigenes Web-Image gebaut; der Image-Tag muss die Umgebung/API-Origin kodieren.

**Status:** ready-for-agent

- [ ] GHCR-Images für `api` und `web` gebaut und gepusht (multi-arch nach 06.7)
- [ ] Staging- und Prod-Overlays getrennt; `kubectl apply -k` deployt beide Umgebungen
- [ ] prod-deploy-smoke gegen die Staging-URL auf jeder Stage-Pipeline grün (echter Browser, echte Container)
- [ ] Rollout-/Rollback-Status sichtbar (kubectl rollout oder Argo); kein Secret im Workflow-Input, nur Referenzen
- [ ] Web-Image pro Umgebung mit korrekt eingebackener Origin gebaut (Build-Arg, kein Runtime-Hack)
