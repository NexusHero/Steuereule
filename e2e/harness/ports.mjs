// Ports and origins of a BOOT-mode stack (#114). Precedence: explicit option (a port, or the port of an explicit
// origin / database URL), then environment, then the default.
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

/** The port a URL addresses, the scheme's default when it names none. */
function portOfUrl(url) {
  const { port, protocol } = new URL(url)
  if (port !== '') return Number(port)
  return { 'http:': 80, 'https:': 443, 'postgres:': 5432, 'postgresql:': 5432 }[protocol]
}

/** `{ apiPort, webPort, postgresPort, apiOrigin, webOrigin, databaseUrl }` for a BOOT-mode run. */
export function resolveBootConfig(options = {}, env = process.env) {
  // An origin or URL given as an option is as explicit as a port option: it beats the environment, so the
  // port a service binds and the address it is probed at can never disagree.
  const pick = (explicitPort, explicitPortName, explicitUrl, explicitUrlName, envName, fallback) => {
    const fromUrl = explicitUrl === undefined ? undefined : portOfUrl(explicitUrl)
    if (explicitPort !== undefined) {
      const port = toPort(explicitPort, explicitPortName)
      if (fromUrl !== undefined && fromUrl !== port) throw new Error(`stack.mjs: ${explicitPortName} ${port} contradicts ${explicitUrlName} ${explicitUrl}.`)
      return port
    }
    if (fromUrl !== undefined) return fromUrl
    if (env[envName] !== undefined && env[envName] !== '') return toPort(env[envName], envName)
    return fallback
  }
  const apiPort = pick(options.apiPort, 'apiPort', options.apiOrigin, 'apiOrigin', 'E2E_API_PORT', DEFAULT_PORTS.api)
  const webPort = pick(options.webPort, 'webPort', options.webOrigin, 'webOrigin', 'E2E_WEB_PORT', DEFAULT_PORTS.web)
  const databaseUrl = options.databaseUrl
  const postgresPort = pick(undefined, 'postgresPort', databaseUrl, 'databaseUrl', 'E2E_POSTGRES_PORT', DEFAULT_PORTS.postgres)
  return {
    apiPort,
    webPort,
    postgresPort,
    apiOrigin: options.apiOrigin ?? `http://localhost:${apiPort}`,
    webOrigin: options.webOrigin ?? `http://localhost:${webPort}`,
    databaseUrl: databaseUrl ?? `postgres://steuereule:steuereule@localhost:${postgresPort}/steuereule`,
  }
}
