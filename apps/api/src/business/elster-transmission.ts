import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'

/**
 * The transmission of the E-Bilanz to ELSTER (ADR-0101 §17, §22), built up to the edge: the app hands
 * the XBRL instance to an ERiC sidecar of the operator, which wraps it in the ELSTER transfer format,
 * validates it with ERiC and sends it with the operator's certificate. ERiC is a native library with its
 * own licence (Herstellerregistrierung); it does not ship with the app. Without the sidecar and the
 * certificate the switch stays off and the app says so.
 *
 * Contract of the sidecar (`ELSTER_ERIC_CLI`): `<cli> <validieren|senden> --verfahren ElsterBilanz
 * --hersteller-id <id>`, the XBRL on stdin, the certificate path and PIN in the environment
 * (`ERIC_CERT_PATH`, `ERIC_CERT_PIN`, never on the command line); on stdout one JSON object
 * `{ "ok": true, "ticket": "…", "protokoll": "…" }` or `{ "ok": false, "meldungen": ["…"] }`.
 */

export type TransmissionMode = 'validieren' | 'senden'

export type TransmissionResult =
  | { readonly status: 'ok'; readonly mode: TransmissionMode; readonly ticket: string | null; readonly protocol: string | null }
  | { readonly status: 'abgelehnt'; readonly messages: readonly string[] }
  | { readonly status: 'nicht_eingerichtet'; readonly missing: readonly string[] }

export interface ElsterTransmissionConfig {
  readonly enabled: boolean
  readonly cli: string | null
  readonly certPath: string | null
  readonly certPin: string | null
  readonly herstellerId: string | null
}

/** Read on every call, like the self-employment switch, so the operator's change applies after a restart of the env. */
export function elsterTransmissionConfig(env: NodeJS.ProcessEnv = process.env): ElsterTransmissionConfig {
  const value = (key: string) => {
    const v = env[key]?.trim()
    return v ? v : null
  }
  const raw = env.ELSTER_TRANSMISSION_ENABLED?.trim().toLowerCase()
  return {
    enabled: raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on',
    cli: value('ELSTER_ERIC_CLI'),
    certPath: value('ELSTER_CERT_PATH'),
    certPin: value('ELSTER_CERT_PIN'),
    herstellerId: value('ELSTER_HERSTELLER_ID'),
  }
}

/** What is missing before anything can be transmitted; empty = ready. */
export function missingForTransmission(config: ElsterTransmissionConfig): string[] {
  return [
    ...(config.enabled ? [] : ['ELSTER_TRANSMISSION_ENABLED']),
    ...(config.cli ? [] : ['ELSTER_ERIC_CLI']),
    ...(config.certPath ? [] : ['ELSTER_CERT_PATH']),
    ...(config.certPin ? [] : ['ELSTER_CERT_PIN']),
    ...(config.herstellerId ? [] : ['ELSTER_HERSTELLER_ID']),
  ]
}

const TIMEOUT_MS = 120_000
const MAX_OUTPUT = 5 * 1024 * 1024

/** Runs the sidecar; the XBRL goes on stdin, the secrets in the child's environment only. */
export async function transmitEBilanz(xbrl: string, mode: TransmissionMode, config: ElsterTransmissionConfig = elsterTransmissionConfig()): Promise<TransmissionResult> {
  const missing = missingForTransmission(config)
  if (missing.length > 0) return { status: 'nicht_eingerichtet', missing }
  try {
    await access(config.cli!, constants.X_OK)
  } catch {
    return { status: 'nicht_eingerichtet', missing: ['ELSTER_ERIC_CLI (nicht ausführbar)'] }
  }
  const output = await new Promise<{ stdout: string; failed: string | null }>((resolve) => {
    const child = execFile(
      config.cli!,
      [mode, '--verfahren', 'ElsterBilanz', '--hersteller-id', config.herstellerId!],
      { timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT, env: { PATH: process.env.PATH ?? '', ERIC_CERT_PATH: config.certPath!, ERIC_CERT_PIN: config.certPin! } },
      // Only a clean exit counts: `{ ok: true }` after a non-zero exit is no transmission.
      (error, stdout) => resolve({ stdout: String(stdout), failed: error ? error.message : null }),
    )
    child.stdin?.end(xbrl)
  })
  if (output.failed !== null) return { status: 'abgelehnt', messages: [`Die ERiC-Anbindung antwortete nicht: ${output.failed.slice(0, 300)}`] }
  let parsed: unknown
  try {
    parsed = JSON.parse(output.stdout)
  } catch {
    return { status: 'abgelehnt', messages: ['Die ERiC-Anbindung gab keine lesbare Antwort.'] }
  }
  const body = parsed as { ok?: unknown; ticket?: unknown; protokoll?: unknown; meldungen?: unknown }
  if (body.ok === true) return { status: 'ok', mode, ticket: typeof body.ticket === 'string' ? body.ticket : null, protocol: typeof body.protokoll === 'string' ? body.protokoll : null }
  const messages = Array.isArray(body.meldungen) ? body.meldungen.filter((m): m is string => typeof m === 'string').slice(0, 50) : []
  return { status: 'abgelehnt', messages: messages.length > 0 ? messages : ['ELSTER hat den Datensatz abgelehnt, ohne Begründung.'] }
}
