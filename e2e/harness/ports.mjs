// Ports and origins of a BOOT-mode stack (#114). Precedence: explicit option, then environment, then the default.
// Two worktrees (or two agents) can therefore boot side by side by setting E2E_API_PORT / E2E_WEB_PORT /
// E2E_POSTGRES_PORT, and the origins, the API's PORT and the database URL always follow the ports instead of
// each being a separate default that can disagree.

const DEFAULT_PORTS = { api: 3301, web: 4173, postgres: 5432 }

function toPort(value, label) {
  const text = String(value)
  const port = Number(text)
  if (!/^\d+$/.test(text) || port < 1 || port > 65535) {
    throw new Error(`stack.mjs: ${label} must be a TCP port (1-65535), got ${JSON.stringify(text)}.`)
  }
  return port
}

function portOfOrigin(origin) {
  const { port } = new URL(origin)
  return port === '' ? undefined : Number(port)
}

/** `{ apiPort, webPort, postgresPort, apiOrigin, webOrigin, databaseUrl }` for a BOOT-mode run. */
export function resolveBootConfig(options = {}, env = process.env) {
  const pick = (explicit, envName, derived, fallback) => {
    if (explicit !== undefined) return toPort(explicit, `option for ${envName}`)
    if (env[envName] !== undefined && env[envName] !== '') return toPort(env[envName], envName)
    return derived ?? fallback
  }
  const apiPort = pick(options.apiPort, 'E2E_API_PORT', options.apiOrigin ? portOfOrigin(options.apiOrigin) : undefined, DEFAULT_PORTS.api)
  const webPort = pick(options.webPort, 'E2E_WEB_PORT', options.webOrigin ? portOfOrigin(options.webOrigin) : undefined, DEFAULT_PORTS.web)
  const databaseUrl = options.databaseUrl
  const postgresPort = pick(undefined, 'E2E_POSTGRES_PORT', databaseUrl ? Number(new URL(databaseUrl).port || 5432) : undefined, DEFAULT_PORTS.postgres)
  return {
    apiPort,
    webPort,
    postgresPort,
    apiOrigin: options.apiOrigin ?? `http://localhost:${apiPort}`,
    webOrigin: options.webOrigin ?? `http://localhost:${webPort}`,
    databaseUrl: databaseUrl ?? `postgres://steuereule:steuereule@localhost:${postgresPort}/steuereule`,
  }
}
