import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { API_PRODUCTION_SETTINGS, DEPLOY_VARIABLES, WEB_BUILD_ARGS } from '../../src/config/production-config.js'

/**
 * The lock of beta package P1: a production value that has no way to reach the runtime fails here, in the unit
 * tier, instead of on the first real deployment. Compares the declared list (src/config/production-config.ts)
 * with every stage a value passes: GitHub variables and deploy.yml, OpenTofu (Secret Manager, IAM), the
 * Dockerfiles, the local production-shaped compose stack and its .env.example, the setup wizard.
 */

const repoFile = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url))
const read = (path: string) => readFileSync(repoFile(path), 'utf8')

const deployYml = read('.github/workflows/deploy.yml')
const mainTf = read('infra/gcp/main.tf')
const variablesTf = read('infra/gcp/variables.tf')
const apiDockerfile = read('apps/api/Dockerfile')
const webDockerfile = read('apps/mobile-web/Dockerfile')
const composeProd = read('docker-compose.prod.yml')
const envExample = read('.env.example')
const wizard = read('scripts/infra/gcp-setup.sh')

/** The words of a YAML folded scalar `KEY: >-` (every occurrence in the file, joined). */
function foldedList(yaml: string, key: string): string[] {
  const words: string[] = []
  const lines = yaml.split('\n')
  lines.forEach((line, index) => {
    const match = new RegExp(`^(\\s*)${key}: >-\\s*$`).exec(line)
    if (!match) return
    const indent = (match[1] ?? '').length
    for (let next = index + 1; next < lines.length; next += 1) {
      const continuation = lines[next] ?? ''
      if (continuation.trim() === '' || continuation.search(/\S/) <= indent) break
      words.push(...continuation.trim().split(/\s+/))
    }
  })
  return words
}

/** The quoted strings of an HCL list `name = [ ... ]`. */
function hclList(hcl: string, name: string): string[] {
  const body = new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\n\\s*\\]`).exec(hcl)?.[1] ?? ''
  return [...body.matchAll(/^\s*"([A-Z0-9_]+)",?/gm)].map((match) => match[1] ?? '')
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort()
}

/**
 * The workflow names under `workflow_run: workflows:` of one workflow file, in inline (`[a, b]`) or block (`- a`)
 * form. Comment lines and other keys may stand between `workflow_run:` and `workflows:`.
 */
function workflowRunNames(yaml: string): string[] {
  const lines = yaml.split('\n').filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
  const indentOf = (line: string | undefined) => (line ?? '').search(/\S/)
  const start = lines.findIndex((line) => /^\s+workflow_run:\s*$/.test(line))
  if (start < 0) return []
  const names: string[] = []
  for (let index = start + 1; index < lines.length && indentOf(lines[index]) > indentOf(lines[start]); index += 1) {
    const key = /^(\s+)workflows:\s*(.*)$/.exec(lines[index] ?? '')
    if (!key) continue
    const inline = /^\[(.*)\]/.exec(key[2] ?? '')
    if (inline) {
      const entries = [...(inline[1] ?? '').matchAll(/'([^']*)'|"([^"]*)"|([^,\s][^,]*)/g)]
      names.push(...entries.map((entry) => (entry[1] ?? entry[2] ?? entry[3] ?? '').trim()))
      continue
    }
    for (let item = index + 1; item < lines.length && indentOf(lines[item]) > (key[1] ?? '').length; item += 1) {
      const entry = /^\s+-\s+(?:'([^']*)'|"([^"]*)"|([^#]+))/.exec(lines[item] ?? '')
      if (entry) names.push((entry[1] ?? entry[2] ?? entry[3] ?? '').trim())
    }
  }
  return names
}

/**
 * What `gcloud --update-env-vars "^<sep>^K=V<sep>K=V"` sets: gcloud splits the list on the separator named between
 * the carets, then each pair on its first "=". Throws for a piece without "=", as gcloud does.
 */
function gcloudEnvPairs(flagValue: string): Record<string, string> {
  const custom = /^\^([^^]+)\^([\s\S]*)$/.exec(flagValue)
  const pieces = (custom ? (custom[2] ?? '') : flagValue).split(custom ? (custom[1] ?? ',') : ',')
  return Object.fromEntries(
    pieces.map((piece) => {
      if (!piece.includes('=')) throw new Error(`"${piece}" is not KEY=VALUE`)
      return [piece.slice(0, piece.indexOf('=')), piece.slice(piece.indexOf('=') + 1)]
    }),
  )
}

/** The value of the API deploy's --update-env-vars flag, as written in the workflow. */
const apiEnvFlag = /gcloud run deploy steuereule-api[\s\S]*?--update-env-vars "([^"]+)"/.exec(deployYml)?.[1] ?? ''

const secretSettings = API_PRODUCTION_SETTINGS.filter((setting) => setting.source === 'secret-manager')
/** Needed on every deployment: always/deployment, plus the self-employment price (the switch is on by default). */
const requiredOnDeployment = (name: string) =>
  name === 'STRIPE_PRICE_ID_SELBSTSTAENDIG' || API_PRODUCTION_SETTINGS.find((setting) => setting.name === name)?.need !== 'optional'

describe('deployment wiring: every production value reaches the runtime (beta P1)', () => {
  it('OPS-2: every workflow_run trigger names a workflow that exists', () => {
    const files = readdirSync(repoFile('.github/workflows')).filter((name) => /\.ya?ml$/.test(name))
    const texts = new Map(files.map((name) => [name, read(`.github/workflows/${name}`)]))
    const names = new Set([...texts.values()].map((text) => /^name:\s*['"]?(.+?)['"]?\s*$/m.exec(text)?.[1] ?? ''))
    const waiting = [...texts].filter(([, text]) => /^\s+workflow_run:/m.test(text))
    expect(waiting.map(([file]) => file)).toContain('deploy.yml')
    for (const [file, text] of waiting) {
      const referenced = workflowRunNames(text)
      // A trigger this test cannot read is a failure, not a pass: that is how deploy.yml went unchecked.
      expect(referenced.length, `${file}: workflow_run without readable workflows`).toBeGreaterThan(0)
      for (const name of referenced) expect(names, `${file} waits for "${name}"`).toContain(name)
    }
    expect(workflowRunNames(texts.get('deploy.yml') ?? '')).toEqual(['Build & E2E'])
  })

  it('OPS-2: the trigger reader sees inline lists, block lists and comments between the keys', () => {
    expect(workflowRunNames("on:\n  workflow_run:\n    # why\n    workflows: ['A & B', \"C\"]\n    types: [completed]\n")).toEqual(['A & B', 'C'])
    expect(workflowRunNames('on:\n  workflow_run:\n    types: [completed]\n    workflows:\n      - A\n      - "B, C" # note\n  push:\n')).toEqual(['A', 'B, C'])
    expect(workflowRunNames('on:\n  workflow_run:\n    types: [completed]\n  push:\n    workflows: [X]\n')).toEqual([])
  })

  it('OPS-10: Secret Manager, the deploy and the declared list name the same secrets, with the same required ones', () => {
    const declared = sorted(secretSettings.map((setting) => setting.name))
    const tfRequired = hclList(mainTf, 'required_secrets')
    const tfOptional = hclList(mainTf, 'optional_secrets')
    const deployRequired = foldedList(deployYml, 'REQUIRED_SECRETS')
    const deployOptional = foldedList(deployYml, 'OPTIONAL_SECRETS')
    expect(sorted([...tfRequired, ...tfOptional])).toEqual(declared)
    expect(sorted([...deployRequired, ...deployOptional])).toEqual(declared)
    expect(sorted(tfRequired)).toEqual(sorted(deployRequired))
    expect(sorted(deployRequired)).toEqual(sorted(declared.filter(requiredOnDeployment)))
  })

  it('OPS-10: every value the deploy sets is declared, and every declared deploy value is set', () => {
    const setByDeploy = sorted(Object.keys(gcloudEnvPairs(apiEnvFlag)))
    const declared = API_PRODUCTION_SETTINGS.filter((setting) => setting.source === 'deploy-env').map((setting) => setting.name)
    expect(setByDeploy).toEqual(sorted([...declared, 'NODE_ENV']))
  })

  it('the deploy sets each value whole: an address with "@", proxies with ",", origins with ":" survive the list', () => {
    // What the values really look like. With "@" as the separator, EMAIL_FROM was cut at its "@" and the rest had
    // no "=", so gcloud refused the deploy after the migration had already run.
    const samples: Record<string, string> = {
      API_ORIGIN: 'https://api.example.org',
      WEB_ORIGIN: 'https://www.example.org',
      TRUSTED_PROXIES: '169.254.0.0/16,35.191.0.0/16,2600:1901::/48',
      EMAIL_FROM: 'SteuerEule <noreply@example.org>',
    }
    const expanded = apiEnvFlag.replace(/\$([A-Z_]+)/g, (_match, name: string) => {
      expect(samples, `sample for $${name}`).toHaveProperty(name)
      return samples[name] ?? ''
    })
    expect(gcloudEnvPairs(expanded)).toEqual({
      NODE_ENV: 'production',
      BETTER_AUTH_URL: samples.API_ORIGIN,
      CORS_ALLOWED_ORIGINS: samples.WEB_ORIGIN,
      WEB_APP_URL: samples.WEB_ORIGIN,
      TRUSTED_PROXIES: samples.TRUSTED_PROXIES,
      EMAIL_FROM: samples.EMAIL_FROM,
    })
    // The step refuses a value that holds the separator before gcloud runs.
    const separator = /^\^([^^]+)\^/.exec(apiEnvFlag)?.[1] ?? ''
    const deployStep = deployYml.slice(deployYml.indexOf('- name: Deploy API'), deployYml.indexOf('gcloud run deploy steuereule-api'))
    expect(deployStep).toContain(`*'${separator}'*) echo "::error::`)
    for (const name of Object.keys(samples)) expect(deployStep, name).toContain(`"$${name}"`)
  })

  it('OPS-12: the API service is updated, never replaced, so hand-set values survive a deploy', () => {
    const apiDeploy = deployYml.slice(deployYml.indexOf('gcloud run deploy steuereule-api'), deployYml.indexOf('- name: Build and push web image'))
    expect(apiDeploy).toMatch(/--update-secrets "\$API_SECRETS"/)
    expect(apiDeploy).toMatch(/--update-env-vars/)
    expect(apiDeploy).not.toMatch(/--set-env-vars|--set-secrets/)
  })

  it('the image carries what is baked into it (NODE_ENV, APP_VERSION from the commit, the street data)', () => {
    for (const setting of API_PRODUCTION_SETTINGS.filter((candidate) => candidate.source === 'image')) {
      expect(apiDockerfile, setting.name).toMatch(new RegExp(`^ENV ${setting.name}=`, 'm'))
    }
    expect(apiDockerfile).toMatch(/^ARG APP_VERSION/m)
    expect(deployYml).toMatch(/docker build -f apps\/api\/Dockerfile --build-arg "APP_VERSION=\$APP_VERSION"/)
    expect(apiDockerfile).toMatch(/STREET_DATA_PATH=\/repo\/apps\/api\/data\/streets\.csv pnpm --filter @steuereule\/api streets:fetch/)
  })

  it('the local production-shaped stack sets every value a production run always needs', () => {
    const apiEnv = composeProd.slice(composeProd.indexOf('x-api-env'), composeProd.indexOf('\nservices:'))
    for (const setting of API_PRODUCTION_SETTINGS.filter((candidate) => candidate.need === 'always' && candidate.source !== 'image')) {
      expect(apiEnv, setting.name).toMatch(new RegExp(`^\\s+${setting.name}:`, 'm'))
    }
    const interpolated = [...composeProd.matchAll(/\$\{([A-Z_]+)\}/g)].map((match) => match[1] ?? '')
    for (const name of sorted(interpolated)) expect(envExample, `${name} used by docker-compose.prod.yml`).toMatch(new RegExp(`^${name}=`, 'm'))
  })

  it('WEB-2: every web build arg reaches expo export from the deploy, the compose stack and .env.example', () => {
    const buildStage = webDockerfile.slice(0, webDockerfile.indexOf('RUN pnpm --filter @steuereule/mobile-web exec expo export'))
    const webArgs = composeProd.slice(composeProd.indexOf('dockerfile: apps/mobile-web/Dockerfile'))
    for (const name of WEB_BUILD_ARGS) {
      expect(buildStage, `ARG ${name}`).toMatch(new RegExp(`^ARG ${name}\\b`, 'm'))
      expect(buildStage, `ENV ${name}`).toMatch(new RegExp(`\\b${name}=\\$\\{${name}\\}`))
      expect(deployYml, `--build-arg ${name}`).toMatch(new RegExp(`--build-arg "${name}=`))
      expect(webArgs, `compose arg ${name}`).toMatch(new RegExp(`^\\s+${name}:`, 'm'))
      if (name !== 'EXPO_PUBLIC_API_BASE_URL') expect(envExample, `.env.example ${name}`).toMatch(new RegExp(`^#? ?${name}=`, 'm'))
    }
  })

  it('SITE-1: the marketing site is built with the app origin, served with a CSP, and deployed', () => {
    const websiteDockerfile = read('apps/website/Dockerfile')
    expect(websiteDockerfile).toMatch(/ARG WEBSITE_APP_ORIGIN/)
    expect(websiteDockerfile).toMatch(/ARG API_ORIGIN/)
    expect(websiteDockerfile).toMatch(/static-server\.mjs/)
    expect(deployYml).toMatch(/-f apps\/website\/Dockerfile/)
    expect(deployYml).toMatch(/--build-arg "WEBSITE_APP_ORIGIN=\$WEB_ORIGIN"/)
    expect(deployYml).toMatch(/--build-arg "API_ORIGIN=\$API_ORIGIN"/)
    expect(deployYml).toMatch(/gcloud run deploy steuereule-website/)
    // Deployed is not reachable: the wizard maps the bare domain to it, and the smoke test asks it for its CSP.
    expect(wizard).toContain('"$APP_DOMAIN:steuereule-website"')
    expect(deployYml).toMatch(/gcloud run services describe steuereule-website/)
  })

  it('OPS-13: every deploy variable is read in the environment-bound job, required ones are gated, none has a fallback', () => {
    const scoped = foldedList(deployYml, 'DEPLOY_VARIABLES')
    const required = foldedList(deployYml, 'REQUIRED_VARIABLES')
    expect(sorted(scoped)).toEqual(sorted(DEPLOY_VARIABLES.map((variable) => variable.name)))
    expect(sorted(required)).toEqual(sorted(DEPLOY_VARIABLES.filter((variable) => variable.need === 'required').map((variable) => variable.name)))
    expect(deployYml).not.toMatch(/vars\.[A-Z_]+\s*\|\|/)
    const workflowLevel = deployYml.slice(0, deployYml.indexOf('\njobs:'))
    expect(workflowLevel).not.toMatch(/vars\./)
    const deployJob = deployYml.slice(deployYml.indexOf('\n  deploy:'))
    for (const variable of DEPLOY_VARIABLES.filter((candidate) => candidate.name !== 'GCP_ENVIRONMENT')) {
      expect(deployJob, variable.name).toMatch(new RegExp(`\\$\\{\\{ vars\\.${variable.name} \\}\\}`))
    }
  })

  it('OPS-3: an unconfigured automatic run skips its jobs instead of succeeding, and a configured one never skips silently', () => {
    const jobConditions = [...deployYml.matchAll(/\n {4}if: >-\n((?: {6}.*\n)+)/g)].map((match) => match[1] ?? '')
    expect(jobConditions).toHaveLength(2)
    for (const condition of jobConditions) expect(condition).toMatch(/vars\.DEPLOY_STAGING_AUTO == 'true'/)
    expect(deployYml).not.toMatch(/ready=false|steps\.gate\.outputs\.ready/)
    expect(wizard).toMatch(/gh variable set DEPLOY_STAGING_AUTO --body true/)
  })

  it('OPS-11: the deployer may create the Cloud SQL backup the deploy takes before migrating, and no more', () => {
    expect(deployYml).toMatch(/gcloud sql backups create/)
    const role = /resource "google_project_iam_custom_role" "pre_deploy_backup" \{([\s\S]*?)\n\}/.exec(mainTf)?.[1] ?? ''
    expect(role).toMatch(/"cloudsql\.backupRuns\.create"/)
    expect(role).not.toMatch(/instances\.(update|delete|restart)/)
    expect(mainTf).toMatch(/role\s+=\s+google_project_iam_custom_role\.pre_deploy_backup\.id\n\s+member\s+=\s+"serviceAccount:\$\{google_service_account\.deployer\.email\}"/)
  })

  it('OPS-14, H2-4, H2-31: the wizard sets every deploy variable, every secret and every OpenTofu input that matters', () => {
    for (const variable of DEPLOY_VARIABLES) expect(wizard, `set_var ${variable.name}`).toMatch(new RegExp(`set_var ${variable.name} `))
    for (const name of ['STRIPE_PRICE_ID', 'STRIPE_PRICE_ID_SELBSTSTAENDIG', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'BREVO_API_KEY']) {
      expect(wizard, `stores ${name}`).toMatch(new RegExp(`(put_secret|ask_stored_secret) ${name} `))
    }
    const inputs = [...variablesTf.matchAll(/variable "([a-z_]+)"/g)].map((match) => match[1])
    for (const name of ['alert_email', 'api_hostname', 'monthly_budget_eur', 'environment', 'github_environments', 'project_id', 'billing_account_id', 'region']) {
      expect(inputs).toContain(name)
      expect(wizard, `-var ${name}`).toMatch(new RegExp(`-var "${name}=`))
    }
    expect(wizard).toMatch(/checkout\.session\.completed/)
    expect(wizard).toMatch(/checkout\.session\.async_payment_succeeded/)
    expect(wizard).toMatch(/rechtliches\/agb/)
    expect(wizard).toMatch(/repos\/\$GITHUB_REPOSITORY\/environments\/\$GH_ENVIRONMENT/)
  })

  it('H2-32: every check docs/ci-pipeline.md lists as required is a job that reports under exactly that name', () => {
    const doc = read('docs/ci-pipeline.md')
    const section = doc.slice(doc.indexOf('## Required checks'), doc.indexOf('## Categories'))
    const listed = [...section.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1] ?? '')
    const jobNames = readdirSync(repoFile('.github/workflows'))
      .filter((name) => name.endsWith('.yml'))
      .flatMap((name) => [...read(`.github/workflows/${name}`).matchAll(/^ {4}name: '?(.+?)'?$/gm)].map((match) => match[1] ?? ''))
      .flatMap((name) => (name.includes('${{ matrix.shard }}') ? ['1/4', '2/4', '3/4', '4/4'].map((shard) => name.replace('${{ matrix.shard }}', shard)) : [name]))
    expect(listed.length).toBeGreaterThanOrEqual(24)
    for (const check of listed.filter((name) => name !== 'SonarCloud Code Analysis')) expect(jobNames, check).toContain(check)
    expect(read('.github/workflows/ci-overview.yml')).not.toMatch(/pre-rename/)
  })

  it('H2-35: the nightly evaluation skips its job until enabled, and fails rather than passing without its key', () => {
    const nightly = read('.github/workflows/ai-eval-nightly.yml')
    expect(nightly).toMatch(/^ {4}if: github\.event_name == 'workflow_dispatch' \|\| vars\.AI_EVAL_ENABLED == 'true'$/m)
    expect(nightly).toMatch(/AI_EVAL_GEMINI_API_KEY is not set[\s\S]*?exit 1/)
    expect(nightly).not.toMatch(/present=false/)
  })
})
