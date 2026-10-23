# 06.7 — arm64-Verifikation (README-Lücke)

**What to build:** Die README-Lücke „genuinely unverified" schließen — Build **und** Boot auf
`linux/arm64` gemessen, nicht vermutet. Slice 1 hat den ersten Befund bereits geliefert: ein
`docker buildx build --platform linux/arm64` des API-Images auf Apple Silicon (colima,
`linux/arm64`-Builder) — dokumentiert in `infra/README.md`. Dieses Ticket vervollständigt:
beide Images, Boot-Smoke, README-Update, multi-arch GHCR.

**Blocked by:** None — kann sofort starten. Die App-Images (`apps/api/Dockerfile`,
`apps/mobile-web/Dockerfile`) existieren bereits.

**Status:** ready-for-agent

- [ ] `docker buildx build --platform linux/arm64` für `api` **und** `web` grün (Prisma-Engine „native" löst auf arm64 auf — der im Dockerfile benannte echte Risikopunkt)
- [ ] Boot-Smoke auf arm64 (API + web, compose oder k8s) — gemessen, nicht vermutet
- [ ] README-Abschnitt „genuinely unverified" durch das Messergebnis ersetzt/ergänzt
- [ ] multi-arch GHCR-Images (amd64+arm64) gebaut (Übergabe an 06.4)
