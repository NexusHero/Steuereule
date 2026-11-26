// Control proofs (ADR-0021: a control counts once it has been seen to fail). Each entry of control-proofs.json
// plants one regression in the API source and names the gate that must catch it. CI runs every proof on every
// pull request as its own entry of the e2e-gates matrix: apply the mutation, rebuild the API, boot the stack, run
// the gate, and require that it fails with the expected message. A gate that passes on its mutant has stopped
// guarding what it claims to guard, and that turns the pull request red.
//
//   node e2e/run-control-proofs.mjs --check          validate control-proofs.json against the sources (exit 1 on a problem)
//   node e2e/run-control-proofs.mjs --apply <id>     write the mutation into the working tree (CI only; never commit it)
//   node e2e/run-control-proofs.mjs --run <id>       run the gate against the booted mutant stack and judge the result
//
// A mutation is a literal find/replace that must match its file exactly once, so a refactoring that moves the
// line fails `--check` in the plan job with the proof's name instead of silently mutating nothing.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const fromRoot = { read: (file) => readFileSync(join(ROOT, file), 'utf8'), exists: (file) => existsSync(join(ROOT, file)) }

export function loadProofs(file = join(HERE, 'control-proofs.json')) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

const occurrences = (source, find) => (find === '' ? 0 : source.split(find).length - 1)

/** Problems in the proof list; empty when every mutation still matches its file exactly once. */
export function validateProofs(config, { read, exists } = fromRoot) {
  const problems = []
  const ids = new Set()
  for (const proof of config.proofs) {
    const name = `proof "${proof.id}"`
    if (ids.has(proof.id)) problems.push(`duplicate proof id "${proof.id}"`)
    ids.add(proof.id)
    const { file, find, replace } = proof.mutation
    if (!file.startsWith('apps/api/src/')) {
      problems.push(`${name}: the mutation must be in apps/api/src (the proof job rebuilds the API only)`)
      continue
    }
    const count = exists(file) ? occurrences(read(file), find) : 0
    if (count !== 1) problems.push(`${name}: the mutation matches ${file} ${count} times, it must match exactly once`)
    if (find === replace) problems.push(`${name}: the mutation changes nothing`)
    for (const [, script] of proof.command.matchAll(/((?:e2e|scripts)\/[\w./-]+\.m?js)/g)) {
      if (!exists(script)) problems.push(`${name}: the command runs ${script}, which does not exist`)
    }
    if (!proof.expect) problems.push(`${name}: expect is empty; without it any failure would count as the gate catching the mutant`)
  }
  return problems
}

/** The source with the mutation applied; throws unless it matches exactly once. */
export function applyMutation(source, { find, replace }) {
  const count = occurrences(source, find)
  if (count !== 1) throw new Error(`the mutation matches ${count} times, it must match exactly once`)
  return source.replace(find, () => replace)
}

/**
 * Problems that mean the tree is not the mutant. The run step comes after `--apply`, so the pristine-source check
 * of validateProofs does not hold there; what must hold is that the planted text is gone from the file.
 */
export function mutantProblems(proof, source) {
  return occurrences(source, proof.mutation.find) === 0 ? [] : [`proof "${proof.id}": ${proof.mutation.file} is not mutated; run --apply and rebuild the API first`]
}

/** `killed`: the gate failed and said why. `survived`: the gate passed on the mutant. `failed-differently`: red for another reason. */
export function verdict(status, output, expect) {
  if (status === 0) return 'survived'
  return output.includes(expect) ? 'killed' : 'failed-differently'
}

/** One entry of the e2e-gates matrix per proof (ci.yml reads `mutant` to switch the job into proof mode). */
export function proofMatrixEntries(config) {
  return config.proofs.map((proof) => ({ group: `control-proof-${proof.id}`, title: `control proof: ${proof.title}`, stack: true, fake_ki: false, mutant: proof.id }))
}

function main(argv) {
  const config = loadProofs()
  const mode = ['--check', '--apply', '--run'].find((flag) => argv.includes(flag))
  const proof = mode === undefined || mode === '--check' ? undefined : config.proofs.find((p) => p.id === argv[argv.indexOf(mode) + 1])
  if (mode === undefined || (mode !== '--check' && proof === undefined)) {
    console.error(`usage: run-control-proofs.mjs --check | --apply <id> | --run <id>   (ids: ${config.proofs.map((p) => p.id).join(', ')})`)
    return 2
  }
  // --check and --apply see the pristine source; --run sees the tree after --apply and checks that instead.
  const problems = mode === '--run' ? mutantProblems(proof, fromRoot.read(proof.mutation.file)) : validateProofs(config)
  if (problems.length > 0) {
    for (const p of problems) console.error(`control-proofs.json: ${p}`)
    return 1
  }
  if (mode === '--check') {
    console.log(`control-proofs.json ok: ${config.proofs.length} proof(s)`)
    return 0
  }
  if (mode === '--apply') {
    const path = join(ROOT, proof.mutation.file)
    writeFileSync(path, applyMutation(readFileSync(path, 'utf8'), proof.mutation))
    console.log(`mutant "${proof.id}" applied to ${proof.mutation.file}: ${proof.title}`)
    return 0
  }
  console.log(`control proof "${proof.id}": ${proof.title}\nwhy: ${proof.why}\n$ ${proof.command}\n(the gate below is expected to FAIL)`)
  const result = spawnSync('bash', ['-e', '-c', proof.command], { cwd: ROOT, encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  process.stdout.write(output)
  const outcome = verdict(result.status, output, proof.expect)
  if (outcome === 'killed') {
    console.log(`\ncontrol proof "${proof.id}" holds: the gate failed on the mutant with the expected message.`)
    return 0
  }
  console.log(
    outcome === 'survived'
      ? `\n::error title=Control proof failed::${proof.command} PASSED on the mutant "${proof.id}" (${proof.title}). The gate no longer catches this regression.`
      : `\n::error title=Control proof inconclusive::${proof.command} failed on the mutant "${proof.id}", but not with "${proof.expect}". Red for another reason proves nothing about this gate.`,
  )
  return 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)))
