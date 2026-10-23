# 06.8 — TRUSTED_PROXIES / REQ-010-Abschluss

**What to build:** Die App ist nur über den echten Reverse-Proxy (nginx ingress) erreichbar,
`TRUSTED_PROXIES`/`trustProxy` ist auf der echten Topologie gesetzt (nicht `none`, wie es der
lokale Stack bewusst deklariert — `docker-compose.prod.yml`), und das REQ-010-Rate-Limiting
beweist die Netzwerk-Eigenschaft über den echten Proxy. Danach: Register REQ-010 → Done. Das ist
der Abschluss des Tracks — es schließt die in ADR-0026 offen benannte #292-Lücke.

**Blocked by:** 06.1 (Cluster/Ingress) + 06.4 (Staging/Prod deployt — die Eigenschaft ist nur
über die echte Topologie beweisbar).

**Status:** ready-for-agent

- [ ] nginx ingress + cert-manager TLS; die API ist nur über den Proxy erreichbar (API-Port nicht öffentlich)
- [ ] `TRUSTED_PROXIES` auf den echten Proxy-CIDR gesetzt; der `trusted-proxies.ts`-Resolver lehnt `none` unter prod ab (Phase 0.2-Vorarbeit aktiviert)
- [ ] REQ-010-Rate-Limiting-Acceptance grün über die echte Topologie — Client-IP kommt vom Proxy, nicht von Pods
- [ ] Register REQ-010 → Done mit Test-Ort-Zitat (DoD REQ-Ebene)
