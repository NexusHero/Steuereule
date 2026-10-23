# 06.5 — Observability

**What to build:** Logs (Pod-Logs + API-Logs zentral), Metriken (Prometheus + Grafana) und
Alerts. Die drei Mindest-Alerts aus dem Track-Ticket — Boot-Fehler, DB-Verbindung, Fehlerrate —
sind real konfiguriert **und durchgespielt** (ADR-0021: ein Control ist bewiesen, indem man es
bricht), nicht nur installiert.

**Blocked by:** 06.1 (Cluster).

**Status:** ready-for-agent

- [ ] Metriken: API, Web, Redis und Postgres in Grafana sichtbar
- [ ] Logs zentral gesammelt (Loki/Promtail oder Hetzner-eigene Logs — Entscheidung begründet)
- [ ] Drei Alerts real: Boot-Fehler, DB-Verbindungsverlust, Fehlerrate > Schwelle — je einmal „proven by breaking"
- [ ] Alert-Routing (E-Mail/Webhook) an NexusHero definiert und getestet
- [ ] Upstream-Add-ons (Prometheus-Stack, Loki) über Helm-Charts installiert, nicht handgebaut (ADR „kein Eigenbau")
