# Incident runbook

What each alert means and the first three things to check. The alerts are defined in
[`infra/gcp/monitoring.tf`](../../infra/gcp/monitoring.tf) (Google Cloud Monitoring, email only, one
project per environment: staging and production). They exist only when the OpenTofu variable
`alert_email` is set; the uptime check also needs `api_hostname`.

Useful commands (replace the region if you changed it; the service names are fixed by `deploy.yml`):

```bash
gcloud run services describe steuereule-api --region europe-west4 --format='value(status.latestReadyRevisionName)'
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="steuereule-api" AND severity>=ERROR' --limit 20 --freshness 1h
gcloud run services update-traffic steuereule-api --region europe-west4 --to-revisions=<previous-revision>=100
```

## API down (uptime check on `/v1/health/live`)

Fires when the check fails from every location for 3 minutes. `live` does not touch the database, so a
failure means the process or the route to it is gone, not a database blip.

1. Is it the latest deploy? Compare the time of the alert with the last run of the Deploy workflow; if it
   matches, roll back with the traffic command above.
2. Does the Cloud Run URL (not the custom domain) answer `/v1/health/live`? If yes, the problem is the
   domain mapping or DNS/certificate, not the app.
3. Read the ERROR logs of the last hour. A boot failure shows as a crash loop (see Container crash): a
   missing secret or a Redis URL the instance cannot reach are the usual causes.

## 5xx ratio (more than 5 percent of requests for 5 minutes)

1. Group the ERROR logs by message: one failing route or a general failure?
2. Check `/v1/health/ready`: a failing database check points to Cloud SQL (see below); a ready API with
   5xx points to a code path or an upstream (Stripe, Brevo, the AI providers).
3. Started with a deploy? Roll back, then investigate. Started without one? Check Cloud SQL and Redis.

## Container crash (instance killed or exited)

Counts the Cloud Run log lines "Memory limit of ... exceeded", "Container terminated on signal" and
"Container called exit". The API runs with 2 GiB; the PDF export (Chromium) is the largest consumer.

1. Open the log lines around the first hit: memory limit (look at which request ran: PDF export?) or a
   signal/exit at boot (configuration)?
2. Is the instance count high? A memory kill under load is a capacity problem, not a bug in one request.
3. If it began after a deploy, roll back; otherwise raise the memory limit in `deploy.yml` or limit the
   concurrent PDF renders (see `reliability-spec.md` section 4.1).

## Unhandled errors (3 or more in 5 minutes)

Counts ERROR log lines of the Nest `ExceptionsHandler` and the better-auth wrapper. These are 500s the
code did not expect, not validation errors.

1. Read the stack trace of the first occurrence (the log line has it) and find the route.
2. Is it one user or one input? The request id is in the log entry.
3. Check whether it started with a deploy; if the route is central (login, cockpit), roll back first.

## Cloud SQL disk above 80 percent / CPU above 80 percent for 15 minutes

Applies to both instances in the project (tax data and keystore).

1. Which instance? The alert names the database id. The tax-data instance autoresizes its disk; the
   keystore instance does not (`disk_autoresize = false`), so a full keystore disk needs a manual resize.
2. Disk: check for a large table or a runaway log (`log_connections` and `log_disconnections` are on).
   CPU: look at Query Insights and `pg_stat_activity` for a long-running query.
3. A migration running at the time? The deploy runs one before the API revision; wait for it to finish
   before acting.

## After the incident

Write what happened, what you did and one change that would have caught it earlier. A change to the
alerts belongs in `monitoring.tf`, not in the console.
