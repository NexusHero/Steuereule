# ADR-0056 — Asynchrone PDF-Generierung & Job-Entkopplung (Fault Isolation)

- **Status:** Accepted (FAANG Scalability Standard)
- **Date:** 2026-11-08
- **Deciders:** Steuereule Engineering
- **Applies to:** `apps/api/src/printout/`, Google Cloud Run Worker Pool

## Kontext

Der Export amtlicher BMF-Steuervordrucke erfordert das Ausfüllen von bis zu 8 PDF-Formularen und das Rendering über Headless Chromium via Playwright. Dieser Prozess ist CPU- und speicherintensiv (~300–800 MB RAM pro Chromium-Instanz, 1–3 Sekunden Rechenzeit).

Wird dieser Vorgang synchron im HTTP-Request-Lifecycle ausgeführt (`GET /v1/steuerjahre/:jahr/ausdruck`), führen Lastspitzen (z. B. am steuerlichen Abgabetermin 31. Juli) zu:
1. **Event-Loop-Blockierung:** Hohe CPU-Auslastung verlangsamt zeitkritische REST-Endpunkte (Login, Cockpit, Interview).
2. **Container-Abstürze durch OOM:** Gleichzeitige Chromium-Starts überschreiten das Speicherkontingent des Containers.
3. **HTTP Timeouts:** Proxies und Load Balancer brechen langsame Requests nach 30–60 Sekunden hart ab.

## Entscheidung

Wir entkoppeln die rechenintensive PDF-Generierung durch ein **asynchrones Job-Muster (Fault Isolation)**:

1. **Job-Erzeugung:**
   - Client initiiert den Export über `POST /v1/steuerjahre/:jahr/ausdruck/async`.
   - Die API antwortet sofort mit **`202 Accepted`** und einem `PrintoutJobDto` (`{ jobId, status: 'queued', statusUrl: '...' }`).
2. **Entkoppelte Hintergrund-Verarbeitung:**
   - Der Job wird in einer Hintergrund-Warteschlange (in-memory mit Worker-Pool, erweiterbar auf Redis/BullMQ oder GCP Cloud Tasks) verarbeitet.
   - Statusübergänge: `queued` $\rightarrow$ `processing` $\rightarrow$ `completed` | `failed`.
3. **Status-Abfrage & Download:**
   - Der Client pollt `GET /v1/steuerjahre/:jahr/ausdruck/jobs/:jobId`.
   - Sobald `completed`, liefert der Status die sichere Download-URL.
4. **Abwärtskompatibilität:**
   - Der bestehende synchrone Endpunkt `GET /v1/steuerjahre/:jahr/ausdruck` bleibt für einfache Einzelfälle und automatisierte E2E-Tests unverändert bestehen.

## Konsequenzen

- **Vorteile:**
  - **Fault Isolation:** PDF-Rendering kann niemals den Haupt-API-Server zum Absturz bringen.
  - **Keine HTTP-Timeouts:** Die Anfrage wird in $< 50\,\text{ms}$ mit `202 Accepted` beantwortet.
  - **Skalierbarkeit:** Worker können auf dedizierten Serverless-Containern horizontal unabhängig skaliert werden.
- **Nachteile:**
  - Client benötigt eine 2-stufige Abfragelogik (Trigger $\rightarrow$ Polling/Event).
