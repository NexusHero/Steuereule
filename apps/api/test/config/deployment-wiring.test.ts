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

const secretSettings = API_PRODUCTION_SETTINGS.filter((setting) => setting.source === 'secret-manager')
/** Needed on every deployment: always/deployment, plus the self-employment price (the switch is on by default). */
const requiredOnDeployment = (name: string) =>
  name === 'STRIPE_PRICE_ID_SELBSTSTAENDIG' || API_PRODUCTION_SETTINGS.find((setting) => setting.name === name)?.need !== 'optional'

describe('deployment wiring: every production value reaches the runtime (beta P1)', () => {
  it('OPS-2: every workflow_run trigger names a workflow that exists', () => {
    const files = readdirSync(repoFile('.github/workflows')).filter((name) => name.endsWith('.yml'))
    const texts = files.map((name) => read(`.github/workflows/${name}`))
    const names = new Set(texts.map((text) => /^name:\s*['"]?(.+?)['"]?\s*$/m.exec(text)?.[1] ?? ''))
    const referenced = texts.flatMap((text) =>
      [...text.matchAll(/workflow_run:\s*\n\s+workflows:\s*\[([^\]]*)\]/g)].flatMap((match) =>
        (match[1] ?? '').split(',').map((entry) => entry.trim().replace(/^['"]|['"]$/g, '')),
      ),
    )
    expect(referenced).toContain('Build & E2E')
    for (const name of referenced) expect(names, `workflow_run names "${name}"`).toContain(name)
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
    const line = /--update-env-vars "\^@\^([^"]+)"/.exec(deployYml)?.[1] ?? ''
    const setByDeploy = sorted(line.split('@').map((pair) => pair.slice(0, pair.indexOf('='))))
    const declared = API_PRODUCTION_SETTINGS.filter((setting) => setting.source === 'deploy-env').map((setting) => setting.name)
    expect(setByDeploy).toEqual(sorted([...declared, 'NODE_ENV']))
  })

  it('OPS-12: the API service is updated, never replaced, so hand-set values survive a deploy', () => {
    const apiDeploy = deployYml.slice(deployYml.indexOf('gcloud run deploy steuereule-api'), deployYml.indexOf('- name: Build and push web image'))
    expect(apiDeploy).toMatch(/--update-secrets "\$API_SECRETS"/)
    expect(apiDeploy).toMatch(/--update-env-vars/)
    expect(apiDeploy).not.toMatch(/--set-env-vars|--set-secrets/)
  })

  it('OPS-12: every value set by hand is listed in infra/README.md, and the list names nothing else', () => {
    const infraReadme = read('infra/README.md')
    const section = infraReadme.slice(infraReadme.indexOf('### Values set by hand'), infraReadme.indexOf('### Network and database size'))
    const operatorSettings = API_PRODUCTION_SETTINGS.filter((setting) => setting.source === 'operator').map((setting) => setting.name)
    expect(operatorSettings.length).toBeGreaterThan(0)
    const secretNames = new Set(secretSettings.map((setting) => setting.name))
    const listed = [...section.matchAll(/`([A-Z][A-Z0-9_]+)`/g)].map((match) => match[1] ?? '').filter((name) => !secretNames.has(name))
    expect(sorted(listed)).toEqual(sorted(operatorSettings))
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
