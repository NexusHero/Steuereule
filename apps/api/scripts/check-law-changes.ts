/**
 * Watches the laws the owl relies on (ADR-0069 §33). Every norm the steuerberater skill cites and
 * every source of the owl's catalog is fetched from gesetze-im-internet.de, and its wording is
 * compared with the fingerprint taken when it was last checked (skills/steuerberater/law-watch.json).
 * A change means: read it, update the skill and, where a figure moved, the tax core, then run
 * `--update`. Nightly in CI (law-watch.yml), which opens an issue on a change.
 *
 *   pnpm --filter @steuereule/api run laws:check            # compare, exit 1 on a change
 *   pnpm --filter @steuereule/api run laws:check --update   # take today's wording as checked
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ADVISOR_LEGAL_SOURCES } from '@steuereule/core'
import { LAWS, LAW_IDS, fetchLawText, lawFingerprint, lawUrl, type LawId } from '../src/ki/law-text.js'

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILL_DIR = join(API_ROOT, 'skills/steuerberater')
export const LAW_WATCH_FILE = join(SKILL_DIR, 'law-watch.json')

export interface LawWatch {
  /** When the wording below was last read and taken as checked. */
  readonly checkedOn: string
  /** "EStG § 9" → fingerprint of wording and footnotes. */
  readonly norms: Readonly<Record<string, string>>
}

export const normKey = (law: LawId, paragraph: string): string => `${law} § ${paragraph}`

/** A bare "§ 33" means the law the file is about. */
const DEFAULT_LAW: Readonly<Record<string, LawId | null>> = {
  'verfahren.md': 'AO',
  'erbschaft-schenkung.md': 'ErbStG',
  'selbststaendige-ust.md': null,
  'grenzgaenger-ausland.md': null,
}

/**
 * The norms a text cites: "§ 9 Abs. 1 EStG", "§§ 26, 26a EStG", and a bare "§ 33" for the file's
 * own law. Superset on purpose: a norm watched for nothing costs one request a night.
 */
export function citedNorms(text: string, defaultLaw: LawId | null): Set<string> {
  const acts = new RegExp(`\\b(${LAW_IDS.join('|')})\\b`)
  const norms = new Set<string>()
  for (const match of text.matchAll(/§§?\s*(\d+[a-z]?(?:\s*(?:,|und|bis|–|-)\s*\d+[a-z]?)*)/g)) {
    // The law named right after the citation, before the next § or the end of the clause.
    const after = text.slice(match.index! + match[0].length).split(/[§\n;()]/)[0]!.slice(0, 45)
    const law = (acts.exec(after)?.[1] as LawId | undefined) ?? defaultLaw
    if (!law) continue
    for (const paragraph of match[1]!.match(/\d+[a-z]?/g) ?? []) norms.add(normKey(law, paragraph))
  }
  return norms
}

/** Every norm to watch: the skill's citations and the owl's catalog of legal sources. */
export function watchedNorms(): string[] {
  const norms = new Set<string>()
  const files = [join(SKILL_DIR, 'SKILL.md'), ...readdirSync(join(SKILL_DIR, 'references')).filter((f) => f.endsWith('.md') && f !== 'quellen.md').map((f) => join(SKILL_DIR, 'references', f))]
  for (const file of files) {
    const name = file.split('/').pop()!
    for (const norm of citedNorms(readFileSync(file, 'utf8'), name in DEFAULT_LAW ? DEFAULT_LAW[name]! : 'EStG')) norms.add(norm)
  }
  for (const source of Object.values(ADVISOR_LEGAL_SOURCES)) {
    const match = /gesetze-im-internet\.de\/([^/]+)\/__([^.]+)\.html/.exec(source.url)
    const law = LAW_IDS.find((id) => LAWS[id] === match?.[1])
    if (law && match) norms.add(normKey(law, match[2]!))
  }
  return [...norms].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))
}

export function readLawWatch(): LawWatch {
  return JSON.parse(readFileSync(LAW_WATCH_FILE, 'utf8')) as LawWatch
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main(update: boolean): Promise<number> {
  const watch: LawWatch = (() => {
    try {
      return readLawWatch()
    } catch {
      return { checkedOn: '', norms: {} }
    }
  })()
  const fresh: Record<string, string> = {}
  const changed: string[] = []
  const added: string[] = []
  const unreachable: string[] = []
  for (const norm of watchedNorms()) {
    const [, law, paragraph] = /^(\S+) § (\S+)$/.exec(norm)!
    const url = lawUrl(law as LawId, paragraph!)
    try {
      fresh[norm] = await lawFingerprint(await fetchLawText(url))
      if (watch.norms[norm] === undefined) added.push(`${norm} (${url})`)
      else if (watch.norms[norm] !== fresh[norm]) changed.push(`${norm} (${url})`)
    } catch (error) {
      unreachable.push(`${norm} (${url}): ${error instanceof Error ? error.message : String(error)}`)
    }
    // One request at a time, gently: it is a public service.
    await pause(250)
  }
  const report = [
    `# Rechtsquellen-Wächter (${new Date().toISOString().slice(0, 10)})`,
    `Zuletzt geprüft: ${watch.checkedOn || 'nie'} · beobachtet: ${Object.keys(fresh).length + unreachable.length} Normen`,
    '',
    changed.length > 0 ? `## Geändert seit der letzten Prüfung\n${changed.map((n) => `- ${n}`).join('\n')}\n\nWortlaut lesen, Skill (\`apps/api/skills/steuerberater\`) und wo nötig Rechenkern anpassen, dann \`pnpm --filter @steuereule/api run laws:check --update\`.` : '## Keine Änderung',
    added.length > 0 ? `\n## Neu beobachtet (noch nie geprüft)\n${added.map((n) => `- ${n}`).join('\n')}` : '',
    unreachable.length > 0 ? `\n## Nicht erreichbar\n${unreachable.map((n) => `- ${n}`).join('\n')}` : '',
  ].join('\n')
  console.log(report)
  if (process.env.LAW_WATCH_REPORT) writeFileSync(process.env.LAW_WATCH_REPORT, report)
  if (update) {
    if (unreachable.length > 0) {
      console.error('Nicht aktualisiert: einige Normen waren nicht erreichbar.')
      return 2
    }
    writeFileSync(LAW_WATCH_FILE, `${JSON.stringify({ checkedOn: new Date().toISOString().slice(0, 10), norms: fresh }, null, 2)}\n`)
    return 0
  }
  if (changed.length > 0 || added.length > 0) return 1
  return unreachable.length > 0 ? 2 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv.includes('--update'))
}
