// Command construction for stack.mjs's native-Postgres fallback (#264). `initdb` and `pg_ctl` refuse to run as root
// (a Postgres restriction, not ours), and root-uid sandboxes are where this fallback is needed. As root the two are
// run through an unprivileged account instead; this module only DECIDES and BUILDS the command strings, so the
// decision is unit-testable without root, Postgres or a shell.

export const UNPRIVILEGED_USER = 'postgres'

/** POSIX single-quote escaping, for passing a whole command to `su -c`. */
export function shellQuote(text) {
  return `'${String(text).replace(/'/g, `'\\''`)}'`
}

/**
 * Decides how the server-owning commands run.
 * `env`: { euid, hasCommand(name) -> boolean, userExists(name) -> boolean }
 * Returns { runAs: null } when the current user may run them itself, otherwise { runAs: { tool, user } }.
 * Throws an actionable error when the process is root and no unprivileged route exists.
 */
export function planPrivilege({ euid, hasCommand, userExists }, user = UNPRIVILEGED_USER) {
  if (euid !== 0) return { runAs: null }
  if (!userExists(user)) {
    throw new Error(
      `stack.mjs: the native Postgres fallback is running as root, and initdb/pg_ctl refuse to run as root. ` +
        `It needs an unprivileged account to run them as, and "${user}" does not exist. ` +
        `Install the \`postgresql\` package (it creates "${user}"), or create an unprivileged user named "${user}", ` +
        `or run the harness as a non-root user.`,
    )
  }
  const tool = ['runuser', 'su'].find((candidate) => hasCommand(candidate))
  if (!tool) {
    throw new Error(
      `stack.mjs: the native Postgres fallback is running as root and needs \`runuser\` (util-linux) or \`su\` to drop ` +
        `to "${user}", and neither is on PATH. Install util-linux, or run the harness as a non-root user.`,
    )
  }
  return { runAs: { tool, user } }
}

/** Wraps one shell command so it runs as the plan's unprivileged user (or unchanged when no drop is needed). */
export function asUnprivileged(plan, command) {
  if (!plan.runAs) return command
  const { tool, user } = plan.runAs
  return tool === 'runuser' ? `runuser -u ${user} -- sh -c ${shellQuote(command)}` : `su -s /bin/sh ${user} -c ${shellQuote(command)}`
}

/**
 * The commands that own the data directory. `bin` holds absolute paths of initdb and pg_ctl (an unprivileged account
 * may not have the distribution's versioned bin directory on its PATH). `chown` runs as the current (root) user and
 * hands the freshly created directory to the unprivileged account before initdb touches it.
 */
export function nativePostgresCommands({ plan, bin, dataDir, dbUser, port }) {
  const chown = plan.runAs ? `chown -R ${plan.runAs.user} "${dataDir}"` : null
  return {
    chown,
    initdb: asUnprivileged(plan, `"${bin.initdb}" -D "${dataDir}" -U ${dbUser} --auth=trust --no-locale --encoding=UTF8`),
    start: asUnprivileged(plan, `"${bin.pg_ctl}" -D "${dataDir}" -l "${dataDir}/postgres.log" -o "-p ${port}" start`),
    stop: asUnprivileged(plan, `"${bin.pg_ctl}" -D "${dataDir}" stop -m fast`),
  }
}
