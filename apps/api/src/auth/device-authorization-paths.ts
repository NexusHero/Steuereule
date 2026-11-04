export const DEVICE_AUTHORIZATION_DISABLED_PATHS = ['/device/code', '/device/token', '/device', '/device/approve', '/device/deny']

/** Structural shape of a constructed better-call/better-auth endpoint. */
interface ConstructedPluginEndpoint {
  path?: unknown
}

/** Structural shape of what `deviceAuthorization` returns — only `.endpoints` is needed here. */
export interface DeviceAuthorizationPluginLike {
  endpoints?: Record<string, ConstructedPluginEndpoint>
}

export function deviceAuthorizationPluginPaths(plugin: DeviceAuthorizationPluginLike): string[] {
  return Object.values(plugin.endpoints ?? {})
    .filter((endpoint): endpoint is ConstructedPluginEndpoint & { path: string } => typeof endpoint?.path === 'string')
    .map((endpoint) => endpoint.path)
}

export function assertDeviceAuthorizationDisabledPathsComplete(plugin: DeviceAuthorizationPluginLike): void {
  const registeredEndpointCount = Object.keys(plugin.endpoints ?? {}).length
  const pluginPaths = deviceAuthorizationPluginPaths(plugin)

  if (registeredEndpointCount === 0 || pluginPaths.length === 0) {
    throw new Error(
      `device-authorization plugin registered ${registeredEndpointCount} endpoint(s), of which ` +
        `${pluginPaths.length} yielded a readable string .path — the introspection ` +
        '`deviceAuthorizationPluginPaths` relies on has almost certainly broken outright (a ' +
        'better-auth/better-call internal shape changed), not genuinely become empty. Re-check `.endpoints`/' +
        '`.path` against the installed better-auth version before trusting DEVICE_AUTHORIZATION_DISABLED_PATHS ' +
        'is still correct.',
    )
  }

  if (pluginPaths.length < registeredEndpointCount) {
    throw new Error(
      `device-authorization plugin registered ${registeredEndpointCount} endpoint(s), but only ` +
        `${pluginPaths.length} yielded a readable string .path — the introspection is partially broken (a ` +
        'better-auth/better-call internal shape changed for some, not all, endpoints). Coverage against ' +
        'DEVICE_AUTHORIZATION_DISABLED_PATHS cannot be determined from an incomplete read — this is neither ' +
        'proven safe nor proven stale, only unverifiable, which is reason enough to refuse to start. Re-check ' +
        '`.endpoints`/`.path` against the installed better-auth version before trusting this control at all.',
    )
  }

  const declared = new Set(pluginPaths)
  const disabled = new Set(DEVICE_AUTHORIZATION_DISABLED_PATHS)
  const declaredButNotDisabled = pluginPaths.filter((path) => !disabled.has(path))
  const disabledButNotDeclared = DEVICE_AUTHORIZATION_DISABLED_PATHS.filter((path) => !declared.has(path))

  if (declaredButNotDisabled.length > 0 || disabledButNotDeclared.length > 0) {
    const problems: string[] = []
    if (declaredButNotDisabled.length > 0) {
      problems.push(
        `the plugin now declares ${JSON.stringify(declaredButNotDisabled)}, which ` +
          'DEVICE_AUTHORIZATION_DISABLED_PATHS does not cover — reachable directly by a browser, bypassing ' +
          'the controller checks this whole design exists to interpose',
      )
    }
    if (disabledButNotDeclared.length > 0) {
      problems.push(
        `DEVICE_AUTHORIZATION_DISABLED_PATHS still names ${JSON.stringify(disabledButNotDeclared)}, which the ` +
          'plugin no longer declares — a stale entry, not itself a hole, but worth removing',
      )
    }
    throw new Error(
      'DEVICE_AUTHORIZATION_DISABLED_PATHS has drifted from the device-authorization ' +
        `plugin's own declared routes: ${problems.join('; ')}. Re-check device-authorization-api.ts too, per ` +
        'its own header comment.',
    )
  }
}
