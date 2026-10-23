# Track 06 — Infra-Track #292: Feinschnitt (Slice 1)

Feinschnitt des Phasen-Tickets `../06-infra-track-292.md` in Tracer-Sub-Tickets. Das
Phasen-Ticket bleibt der Zielzustand des ganzen Tracks; diese Dateien sind die
Implementierungs-Slices mit expliziten Blocking-Edges.

**Slice 1 (dieser Lauf) ist bereits erledigt** und NICHT hier als Ticket geführt — es hat das
IaC-Skelett (`infra/`), die Tool-Entscheidungen, die Credential-Checkliste und den
arm64-Build-Befund geliefert. Die acht Sub-Tickets unten sind der **Rest** des Tracks.

## Blocking-Graph (DAG)

```
  ┌─ 06.1 Cluster (k3s/Hetzner) ──────────────┐
  │        │                                   │
  │        ├──► 06.2 Postgres + Redis ──► 06.6 Backups/DR
  │        │        │
  │        │        └──► 06.3 Secrets (Key-Rotation)
  │        │                │
  │        ├──► 06.5 Observability             │
  │        │                                   │
  │        └──► 06.4 CI/CD Staging/Prod ───────┤
  │                 │                          │
  └─ 06.7 arm64 (sofort, kein Dep)            │
                    │                          │
                    06.8 TRUSTED_PROXIES/REQ-010 ◄─ 06.4 + 06.1
```

- **06.1** ist die Wurzel (nur Credential-Blocker, kein Track-Dep).
- **06.7 arm64** startet sofort (kein Dep); Slice 1 hat den ersten Befund bereits geliefert.
- **06.8** ist der Abschluss des Tracks — braucht die echte Topologie (06.1) UND ein
  funktionierendes Staging/Prod-Deploy (06.4), weil die REQ-010-Netzwerk-Eigenschaft nur über
  den echten Proxy beweisbar ist.

## Querschnitts-Blocker (gelten für alle Tickets)

Jedes Ticket hängt zusätzlich an **Credential-Blöcken**, die NexusHero liefern muss — sie sind
die harte Grenze, an der dieser Track (gewollt) stoppt. Vollständige Liste in
`infra/README.md` → „Credential-/DNS-Checkliste". Die wichtigsten: Hetzner-API-Token,
Domain + DNS, GHCR-Token, managed-Postgres-/Redis-Credentials, EU-Region-Entscheidung.
