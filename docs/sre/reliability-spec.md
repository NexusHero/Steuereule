# Steuereule — SRE & Reliability Specification

> **Google SRE Framework Standard:** Service Level Indicators (SLIs), Service Level Objectives (SLOs), Error Budget Policies, and Incident Escalation for Production.

---

## 1. Service Level Indicators (SLIs) & Objectives (SLOs)

Steuereule classifies operations into two distinct critical user journeys (CUJs): **Deterministic Financial Calculations** and **Heavy PDF Document Synthesis**.

| Category | Service Level Indicator (SLI) | Service Level Objective (SLO) | Window |
|:---|:---|:---|:---|
| **API Availability** | $\frac{\text{Successful HTTP 2xx/3xx Requests}}{\text{Total Non-4xx Requests}}$ | **$\ge 99.9\%$** | 30-day rolling |
| **Calculation Latency** | Time spent inside `@steuereule/core` calculation engine | **$p95 \le 50\,\mu\text{s}$, $p99 \le 150\,\mu\text{s}$** | 30-day rolling |
| **HTTP Response Latency** | Total roundtrip for `/v1/steuerjahre/:jahr/cockpit` | **$p95 \le 120\,\text{ms}$, $p99 \le 250\,\text{ms}$** | 30-day rolling |
| **Asynchronous PDF Export** | $\frac{\text{Successful Completed Jobs}}{\text{Total Enqueued Jobs}}$ (ADR-0056) | **$\ge 99.5\%$** | 30-day rolling |
| **PDF Synthesis Latency** | Time from job enqueue to completed AcroForm PDF | **$p95 \le 3.5\,\text{s}$, $p99 \le 6.0\,\text{s}$** | 30-day rolling |

---

## 2. Error Budget Policy

Each 30-day rolling window provides a discrete error budget:

$$\text{Error Budget} = 100\% - 99.9\% = 0.1\% \quad (\approx 43.2 \text{ minutes of downtime per month})$$

### Action Triggers

* **Burn Rate $> 2\times$ (Alerting):**
  * PagerDuty / SRE notification to on-call engineer.
  * Triage of root cause (database pool starvation, memory leak, upstream payment gateway).
* **50% of Monthly Budget Consumed:**
  * Engineering velocity review: non-critical feature pull requests require SRE approval.
  * Bug fixes and reliability hardening prioritized over new domain verticals.
* **100% of Budget Consumed (Exhausted):**
  * Immediate feature deployment freeze on `main`.
  * Mandatory blameless Post-Mortem (Root Cause Analysis, Action Items with tracked GitHub issues).
  * Only P0 hotfixes and security patches permitted.

---

## 3. Fault Isolation & Backpressure Mechanisms

1. **Async Worker Isolation (ADR-0056):**  
   Heavy Headless Chromium instances run decoupled from the primary HTTP event loop. CPU/RAM saturation during PDF compilation cannot degrade interactive calculation latency.
2. **Adaptive Database Pool Throttling:**  
   `withAdaptiveDatabasePoolUrl()` dynamically caps maximum active Prisma connections to provisioned container CPU quotas, preventing PostgreSQL connection storms during Cloud Run autoscale spikes.
3. **Graceful Termination (SIGTERM/SIGINT):**  
   `app.enableShutdownHooks()` ensures that in-flight requests and database transactions complete before the container terminates during Cloud Run revision draining.
4. **Resilient Health Probes:**  
   * `/v1/health/live`: Lightweight process check (does not hit the database; prevents container restart loops during transient DB blips).
   * `/v1/health/ready`: Active pooled database reachability check (tells ingress proxy when to pause traffic routing).
