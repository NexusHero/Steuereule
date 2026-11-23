# ADR-0056 — Asynchronous PDF generation & job decoupling (fault isolation)

- **Status:** Accepted
- **Date:** 2026-11-08
- **Deciders:** Steuereule Engineering
- **Applies to:** `apps/api/src/printout/`, Google Cloud Run worker pool

## Context

Exporting the official BMF tax Vordrucke (forms) requires filling in up to 8 PDF forms and rendering via headless Chromium through Playwright. This process is CPU- and memory-intensive (~300–800 MB RAM per Chromium instance, 1–3 seconds of compute time).

If this operation runs synchronously in the HTTP request lifecycle (`GET /v1/steuerjahre/:jahr/ausdruck`), load peaks (e.g. at the 31 July filing deadline) lead to:
1. **Event loop blocking:** High CPU load slows down time-critical REST endpoints (login, cockpit, interview).
2. **Container crashes due to OOM:** Simultaneous Chromium starts exceed the container's memory quota.
3. **HTTP timeouts:** Proxies and load balancers hard-abort slow requests after 30–60 seconds.

## Decision

We decouple the compute-intensive PDF generation through an **asynchronous job pattern (fault isolation)**:

1. **Job creation:**
   - The client initiates the export via `POST /v1/steuerjahre/:jahr/ausdruck/async`.
   - The API responds immediately with **`202 Accepted`** and a `PrintoutJobDto` (`{ jobId, status: 'queued', statusUrl: '...' }`).
2. **Decoupled background processing:**
   - The job is processed in a background queue (in-memory with a worker pool, extensible to Redis/BullMQ or GCP Cloud Tasks).
   - Status transitions: `queued` $\rightarrow$ `processing` $\rightarrow$ `completed` | `failed`.
3. **Status query & download:**
   - The client polls `GET /v1/steuerjahre/:jahr/ausdruck/jobs/:jobId`.
   - Once `completed`, the status returns the secure download URL.
4. **Backward compatibility:**
   - The existing synchronous endpoint `GET /v1/steuerjahre/:jahr/ausdruck` remains unchanged for simple individual cases and automated E2E tests.

## Consequences

- **Advantages:**
  - **Fault isolation:** PDF rendering can never crash the main API server.
  - **No HTTP timeouts:** The request is answered in $< 50\,\text{ms}$ with `202 Accepted`.
  - **Scalability:** Workers can be scaled horizontally and independently on dedicated serverless containers.
- **Disadvantages:**
  - The client needs a two-step query logic (trigger $\rightarrow$ polling/event).

## Addendum 2026-11-22: implementation status

The decision is not built the way it is described here. `apps/api/src/printout/printout-job.service.ts` keeps the jobs in a `Map` in process memory and starts them with `setImmediate`. There is no worker pool, no limit on concurrent jobs and no persistent storage. The printout of the Vordrucke renders with `pdf-lib`, not with headless Chromium; only the DSGVO (GDPR) export uses Chromium. On Cloud Run with up to ten instances, a status query therefore finds the job only by chance. The web app does not currently call the asynchronous routes. The finding is recorded as debt in [`docs/architecture.md` §11](../architecture.md#11-risks-and-technical-debt).
