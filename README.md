# Steuereule

## Running a local, production-shaped stack

```
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
```

Brings up Postgres, runs migrations, and boots real container images for the API
(`http://localhost:3000`) and the web app (`http://localhost:8080`) — guest browsing,
registration, login, and the QR code rendering against the containerised API all work against this
stack, **proven on Linux/amd64** (CI's `prod-deploy-smoke` job builds and drives this exact compose
file against a real headless browser on every push).

Note the deliberately narrow QR claim: what is proven against *these containers* is that the QR
column mints and renders a real `user_code` (`POST /v1/device/code` → 201 → the code on screen) —
the stakeholder's own reported symptom. Completing a cross-device *sign-in* (approve → the
RFC-8628 `POST /v1/device/token` poll → the desktop is actually signed in) is proven by
`e2e/device/device-authorization.mjs` in the `Browser gates` job, against that job's own
hand-wired stack, never against these images.

See `.env.example`'s own header for what each variable does
and `docs/adr/0026-local-production-shaped-compose-stack.md` for the reasoning behind this setup
(and what it deliberately does not yet answer — the real cloud deployment pipeline, target now
confirmed as k3s on Hetzner + managed EU Postgres per ADR-049, tracked separately as #292). That
gap was #246's until the stakeholder closed #246 on 2026-08-05; **the gap itself did not close with
it** — #292 is its successor and carries it, so a reader who follows a "closed" ticket from here
does not conclude the deployment question is answered.

**Apple Silicon (arm64) — genuinely unverified, not "probably fine."** Both Dockerfiles are plain
`node:24-bookworm-slim` builds with no amd64-only instructions we're aware of, but that is an
expectation, not a measurement: nobody has built or run this stack on arm64 yet. An attempt to
check at least the build (`docker buildx build --platform linux/arm64`) from a Linux dev session
was blocked before it could reach either architecture — the container registry pull itself was
denied by that session's own network policy (a 403 from Docker Hub's CDN, confirmed via that
proxy's own status endpoint), the same "registry can be blocked" environment truth
`e2e/harness/README.md` already documents for CI reproduction sessions. If you're on an Apple
Silicon Mac and this doesn't build or boot, that is a real, reportable gap — not a mistake on your
end.

**Three things to know before your first click, named here so nothing looks broken that isn't:**

- **The database starts empty.** This is deliberate, not a bug — a fresh Postgres with no seed
  data is exactly the "clean slate, sign up for real" scenario this stack exists for. There is
  nothing to log into until you register an account or continue as a guest.
- **PDF export (the DSGVO data-export screen's PDF option) works in this stack** — same
  Linux/amd64 footnote as the rest of this section. `apps/api/Dockerfile` bundles the
  headless-Chromium binary the renderer needs, and CI's `prod-deploy-smoke` job proves it against
  the built container on every push: sign up, save a profile, `GET /v1/account/export?format=pdf`,
  assert `application/pdf` and the `%PDF-` magic bytes. (This bullet previously said the opposite;
  it was already untrue when written — Chromium had landed a commit earlier. Kept visible here
  rather than silently deleted.)
- **The Google sign-in button renders, but pressing it will fail.** This stack ships the same
  dev-only placeholder Google OAuth credentials the rest of the repo uses (`.env.example`'s own
  header explains why) — real Google sign-in needs real credentials from
  console.cloud.google.com, which is out of scope for a local stack (#170, still open). The button
  itself rendering, and the plumbing behind it, are both proven; completing a real Google login is
  not.

For local development without containers (hot reload, etc.), `docker compose up -d` alone still
brings up just Postgres — see that file's own header comment.