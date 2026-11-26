// Runs the E2E gates of one CI group against the stack that is already booted (API_ORIGIN, WEB_ORIGIN,
// DATABASE_URL in the environment). The list of gates and their groups is e2e/gates.json; CI builds its job
// matrix from the same file, so a gate cannot exist without running and a group cannot be forgotten.
//
//   node e2e/run-gates.mjs --group <group>   run every gate of the group, then report (exit 1 if any failed)
//   node e2e/run-gates.mjs --matrix          the GitHub Actions matrix (JSON) of all groups that have gates
//   node e2e/run-gates.mjs --list            every gate with its group
//   node e2e/run-gates.mjs --check           validate gates.json (exit 1 on a problem)
//
// A failing gate does not hide the gates after it: every gate of the group runs, and the summary names each
// failure — one red group says everything that is red in it, not only the first thing.
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

export function loadGates(file = join(HERE, 'gates.json')) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** Problems in the gate list; empty when it is sound. */
export function validate(config, root = ROOT) {
  const problems = []
  const ids = new Set()
  const used = new Set()
  for (const gate of config.gates) {
    if (ids.has(gate.id)) problems.push(`duplicate gate id "${gate.id}"`)
    ids.add(gate.id)
    if (!config.groups[gate.group]) problems.push(`gate "${gate.id}" names the unknown group "${gate.group}"`)
    used.add(gate.group)
    if (!Array.isArray(gate.commands) || gate.commands.length === 0) problems.push(`gate "${gate.id}" has no command`)
    for (const command of gate.commands ?? []) {
      for (const [, script] of command.matchAll(/((?:e2e|scripts)\/[\w./-]+\.m?js)/g)) {
        if (!existsSync(join(root, script))) problems.push(`gate "${gate.id}" runs ${script}, which does not exist`)
      }
    }
  }
  for (const group of Object.keys(config.groups)) {
    if (!used.has(group)) problems.push(`group "${group}" has no gate`)
  }
  return problems
}

/** The GitHub Actions matrix: one entry per group that has gates. */
export function matrix(config) {
  const include = Object.entries(config.groups)
    .filter(([name]) => config.gates.some((g) => g.group === name))
    .map(([group, g]) => ({ group, title: g.title, stack: g.stack, fake_ki: g.fakeKi }))
  return { include }
}

function runGate(gate) {
  const started = Date.now()
  console.log(`::group::${gate.name}`)
  if (gate.why) console.log(`why: ${gate.why}`)
  let ok = true
  for (const command of gate.commands) {
    console.log(`$ ${command}`)
    const result = spawnSync('bash', ['-e', '-c', command], { stdio: 'inherit', env: { ...process.env, ...gate.env }, cwd: ROOT })
    if (result.status !== 0) {
      ok = false
      break // the commands of one gate belong together (test, then measure): stop at the first red one
    }
  }
  console.log('::endgroup::')
  const seconds = Math.round((Date.now() - started) / 1000)
  if (!ok) console.log(`::error title=Gate failed::${gate.name}`)
  return { gate, ok, seconds }
}

function main(argv) {
  const config = loadGates()
  const problems = validate(config)
  if (problems.length > 0) {
    for (const p of problems) console.error(`gates.json: ${p}`)
    return 1
  }
  if (argv.includes('--check')) {
    console.log(`gates.json ok: ${config.gates.length} gates in ${Object.keys(config.groups).length} groups`)
    return 0
  }
  if (argv.includes('--matrix')) {
    console.log(JSON.stringify(matrix(config)))
    return 0
  }
  if (argv.includes('--list')) {
    for (const g of config.gates) console.log(`${g.group.padEnd(24)} ${g.id.padEnd(40)} ${g.name}`)
    return 0
  }
  const at = argv.indexOf('--group')
  const group = at === -1 ? undefined : argv[at + 1]
  if (!group || !config.groups[group]) {
    console.error(`usage: run-gates.mjs --group <${Object.keys(config.groups).join('|')}> | --matrix | --list | --check`)
    return 2
  }
  const gates = config.gates.filter((g) => g.group === group)
  const results = gates.map(runGate)
  const failed = results.filter((r) => !r.ok)
  console.log(`\nGroup ${group}: ${results.length - failed.length}/${results.length} gates passed`)
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${String(r.seconds).padStart(4)}s  ${r.gate.name}`)
  return failed.length === 0 ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)))
