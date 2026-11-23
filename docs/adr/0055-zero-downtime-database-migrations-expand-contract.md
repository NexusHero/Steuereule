# ADR-0055 — Zero-Downtime Database Migrations (Expand and Contract Pattern)

- **Status:** Accepted
- **Date:** 2026-11-08
- **Deciders:** Steuereule Engineering
- **Applies to:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`, Google Cloud Run rollouts

## Context

On Google Cloud Run (ADR-0053) and Kubernetes (product ADR-049), deployments run as rolling updates:
while a new version is being rolled out, old container instances (revision $N$) and new instances (revision $N+1$) run side by side for several minutes against the same PostgreSQL production database.

If a release runs a destructive or renaming database migration (e.g. renaming a column, dropping a column, adding NOT NULL without a default) before all old containers have stopped, running old instances crash with SQL errors (`column does not exist`). Likewise, a rollback fails if the database has already been mutated incompatibly.

## Decision

All future database schema changes in `apps/api/prisma/` are mandatorily subject to the **expand-and-contract pattern (parallel run)** across at least two separate release cycles:

### Phase 1: Expand (additive & backward compatible)
1. **New columns/tables are always optional:** New columns are created as `nullable` or with a safe default value.
2. **No column rename in one step:** A field `oldField` is never renamed via an SQL rename. Instead, `newField` is added additively.
3. **Dual writing:** The application layer (revision $N+1$) writes synchronously to both fields (`oldField` and `newField`), but keeps reading from `oldField`.
4. **Old containers survive:** Revision $N$ keeps reading and writing `oldField` undisturbed.

### Phase 2: Read Switch & Backfill
1. **Data synchronization:** Existing old records are migrated idempotently (`UPDATE table SET newField = oldField WHERE newField IS NULL`).
2. **Read switch:** The code now reads from `newField` and keeps writing to both.

### Phase 3: Contract (cleanup)
1. **Only in the following release:** Once revision $N$ has been fully shut down and the stability of $N+1$ has been proven, the next deployment (revision $N+2$) drops the old field `oldField` via a migration and removes the dual-write code.

### Migration practices that are forbidden outright (CI block)
- ❌ **`ALTER TABLE ... DROP COLUMN`** in the same release as code changes that still reference the field.
- ❌ **`ALTER TABLE ... RENAME COLUMN`** (always destructive for old containers).
- ❌ **`ALTER TABLE ... ADD COLUMN ... NOT NULL`** without a default value on populated tables (blocks writes while the migration runs).

## Consequences

- **Advantages:**
  - **Zero downtime:** Seamless rolling deployment on Google Cloud Run without 500 spikes.
  - **Rollback safety:** Revision $N+1$ can be rolled back to revision $N$ at any time, because the database schema stays fully backward compatible during phase 1.
- **Disadvantages:**
  - Breaking schema changes require two releases instead of a single quick shot (discipline and planning required).
