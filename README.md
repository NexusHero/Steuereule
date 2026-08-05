# Steuereule

## Running a local, production-shaped stack

```
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
```

Brings up Postgres, runs migrations, and boots real container images for the API
(`http://localhost:3000`) and the web app (`http://localhost:8080`) — guest browsing,
registration, login and the QR-code device sign-in all work against this stack out of the box.
See `.env.example`'s own header for what each variable does and `docs/adr/0026-local-production-shaped-compose-stack.md`
for the reasoning behind this setup (and what it deliberately does not yet answer — the real
Fly.io deployment pipeline, tracked separately as #246).

For local development without containers (hot reload, etc.), `docker compose up -d` alone still
brings up just Postgres — see that file's own header comment.