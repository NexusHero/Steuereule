# 06.6 — Backups/DR + Wiederherstellungs-Test

**What to build:** Backups des managed Postgres (PITR) verifiziert plus Redis-Persistenz-Sicherung.
Der Track-DoD verlangt einen **Wiederherstellungs-Test** — die DB wird aus einem Backup
wiederhergestellt und die API bootet dagegen. Das ist ein DR-Nachweis, nicht nur ein Skript, das
„jemand mal ausführen könnte".

**Blocked by:** 06.2 (Postgres existiert).

**Status:** ready-for-agent

- [ ] managed-Postgres-PITR/Backups aktiv; RPO/RTO dokumentiert (nicht nur „ist aktiv")
- [ ] Wiederherstellungs-Test: DB aus Backup wiederhergestellt, API bootet dagegen, Migrationen/Seed laufen — aufgezeichnet als Beweis
- [ ] Redis-Recovery (AOF/RDB) durchgespielt oder bewusst als verzichtbar begründet (Queue kann neu aufbauen)
- [ ] DR-Runbook im `infra/README` (Schritte, nicht Skript-Verweis)
- [ ] REQ-003-Zusammenhang beachtet: verschlüsselte Felder (Feldverschlüsselungs-Key) sind im Backup nur mit dem Key lesbar — Key-Backup/Recovery ist Teil des DR-Nachweises
