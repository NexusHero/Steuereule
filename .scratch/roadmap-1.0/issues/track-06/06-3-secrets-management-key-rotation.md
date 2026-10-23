# 06.3 — Secrets-Management + Key-Rotation (REQ-003)

**What to build:** Secrets kommen aus einem Sealed-Secrets-Mechanismus (Sealed Secrets auf dem
Cluster), nie unverschlüsselt ins Repo. Alle App-Secrets (die `.env.example`-Liste) sind als
SealedSecrets vorhanden und rotierbar. Der REQ-003-Feldverschlüsselungs-Key
(`PRISMA_FIELD_ENCRYPTION_KEY`) wird rotiert **und alte Daten bleiben lesbar** — das ist eine
Daten-Migration (ADR-0008), kein reiner Secret-Tausch; genau diese Unterscheidung ist der
Acceptance-Kern.

**Blocked by:** 06.1 (Controller-Install) + 06.2 (kennt das konkrete Credential-Set, das es zu
versiegeln gilt).

**Status:** ready-for-agent

- [ ] Sealed-Secrets-Controller installiert; `kubeseal` versiegelt mind. die acht App-Secrets aus `.env.example`
- [ ] Kein Secret-Wert liegt unversiegelt im Repo (Beweis: `git grep` über die Secret-Namen)
- [ ] REQ-003-Key-Rotation durchgespielt: alter Key liest weiter, neuer Key verschlüsselt neu — ADR-0008-Mechanik, nicht nur Secret-Neuausstellung
- [ ] Rotation ist als Runbook dokumentiert und in die CI/CD-Pipeline (06.4) angebunden
- [ ] ADR-0008-Amendment nachgezogen, falls die Rotation eine Datenschicht-Änderung erzwingt
