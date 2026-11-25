import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ANNEXES } from '@steuereule/core'
import de from './locales/de.json'
import en from './locales/en.json'
import { GAP_LABEL } from '../screens/children/childrenModel'

// Every i18n key the app asks for exists in both languages (WEB-17, H2-3, H2-5): a missing key shows
// its raw id or a German inline default, also to an English user. Static keys are read from the source;
// keys built at run time are checked for the families whose members are known (annexes, printout
// fields, child gaps).
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO = path.resolve(SRC, '../../..')

type Tree = { readonly [key: string]: unknown }

function has(tree: Tree, key: string): boolean {
  let node: unknown = tree
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object' || !(part in (node as Tree))) return false
    node = (node as Tree)[part]
  }
  return true
}

/** A plural key (`count_one`, `count_other`) is used under its base name. */
const exists = (tree: Tree, key: string) => has(tree, key) || has(tree, `${key}_one`) || has(tree, `${key}_other`)

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : []
  })
}

/** `t('a.b')` / `tr("a.b", …)`: literal keys with a dot, outside another namespace (`ui:`). */
function staticKeys(): Map<string, string> {
  const keys = new Map<string, string>()
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/\b(?:t|tr)\(\s*(['"`])([A-Za-z0-9_.-]+)\1/g)) {
      const key = match[2]!
      if (key.includes('.') && !keys.has(key)) keys.set(key, path.relative(SRC, file))
    }
  }
  return keys
}

function printoutFieldIds(): string[] {
  return [2024, 2025].flatMap((year) => {
    const set = JSON.parse(readFileSync(path.join(REPO, `apps/api/src/printout/felder-${year}.json`), 'utf8')) as { felder: { id: string }[] }
    return set.felder.map((field) => field.id)
  })
}

describe('every i18n key the app uses exists', () => {
  const used = staticKeys()

  it('finds the keys it checks', () => {
    expect(used.size).toBeGreaterThan(1000)
  })

  for (const [name, locale] of [['de.json', de], ['en.json', en]] as const) {
    it(`static keys in ${name}`, () => {
      const missing = [...used].filter(([key]) => !exists(locale, key)).map(([key, file]) => `${key} (${file})`)
      expect(missing).toEqual([])
    })

    it(`run-time families in ${name}: annexes, printout field names, child gaps`, () => {
      const keys = [
        ...ANNEXES.map((annex) => `bestaetigung.anlagen.${annex}`),
        ...[...new Set(printoutFieldIds())].map((id) => `ausdruck.feldNamen.${id.replace('.', '_')}`),
        ...Object.keys(GAP_LABEL).map((gap) => `kinder.lueckeFeld.${gap}`),
      ]
      expect(keys.filter((key) => !exists(locale, key))).toEqual([])
    })
  }
})

/**
 * The key families built at run time: `pattern` is the key with `*` for each part that is computed (one path
 * segment or a piece of one), `builtIn` the file that builds it. A key no source names in full must belong
 * to one of these, or it is dead and is deleted from both locale files, not listed here.
 *
 * Each row is checked against its file: the file has to contain a template literal (or a `'prefix.' + x`)
 * that the pattern is an instance of, and the pattern has to cover a key nothing names in full.
 */
const DYNAMIC_FAMILIES: ReadonlyArray<{ readonly pattern: string; readonly builtIn: string }> = [
  { pattern: 'advisor.chat.connection.*', builtIn: 'screens/advisor/chat/ConnectionStatus.tsx' },
  { pattern: 'advisor.chat.connection.explain.*', builtIn: 'screens/advisor/chat/ConnectionStatus.tsx' },
  { pattern: 'advisor.chat.feedback.reasons.*', builtIn: 'screens/advisor/chat/FeedbackButtons.tsx' },
  { pattern: 'advisor.chat.notes.change.*', builtIn: 'screens/advisor/chat/ProjectNotes.tsx' },
  { pattern: 'advisor.chat.receiptProgress.*', builtIn: 'screens/advisor/OwlModeChat.tsx' },
  { pattern: 'advisor.chat.skills.items.*.description', builtIn: 'screens/advisor/chat/SkillsMenu.tsx' },
  { pattern: 'advisor.chat.skills.items.*.start', builtIn: 'screens/advisor/useAdvisorChat.ts' },
  { pattern: 'advisor.chat.skills.items.*.title', builtIn: 'screens/advisor/AdvisorChatComposer.tsx' },
  { pattern: 'advisor.chat.thinkingPhrases.*', builtIn: 'screens/advisor/chat/ThoughtBlock.tsx' },
  { pattern: 'advisor.plan.status.*', builtIn: 'screens/advisor/chat/PlanChecklist.tsx' },
  { pattern: 'arbeitstage.feiertage.regionen.*', builtIn: 'screens/shared/PostalCodeHint.tsx' },
  { pattern: 'arbeitstage.weekdayNames.*', builtIn: 'screens/workdays/WorkdaysScreen.tsx' },
  { pattern: 'arbeitstage.weg.mittel.*', builtIn: 'screens/workdays/WorkdaysScreen.tsx' },
  { pattern: 'ausdruck.anlagen.*', builtIn: 'screens/printout/PrintoutScreen.tsx' },
  { pattern: 'ausdruck.direkteingabe.ungueltig.*', builtIn: 'screens/printout/AcroFormLiveViewer.tsx' },
  { pattern: 'ausdruck.feldNamen.*', builtIn: 'screens/printout/PrintoutScreen.tsx' },
  { pattern: 'ausdruck.glasErklaerung.zeilen.arbeitsmittel', builtIn: 'screens/printout/liveFormRows.ts' },
  { pattern: 'ausdruck.glasErklaerung.zeilen.berufsverbaende', builtIn: 'screens/printout/liveFormRows.ts' },
  { pattern: 'ausdruck.glasErklaerung.zeilen.chfUndEur', builtIn: 'screens/printout/liveFormRows.ts' },
  { pattern: 'ausdruck.glasErklaerung.zeilen.fortbildung', builtIn: 'screens/printout/liveFormRows.ts' },
  { pattern: 'ausdruck.glasErklaerung.zeilen.nGre.*', builtIn: 'screens/printout/liveFormRows.ts' },
  { pattern: 'ausdruck.glasErklaerung.zeilen.sonstiges', builtIn: 'screens/printout/liveFormRows.ts' },
  { pattern: 'ausdruck.glasErklaerung.zeilen.vorsorge.kz3*', builtIn: 'screens/printout/liveFormRows.ts' },
  { pattern: 'ausdruck.glasErklaerung.zeilen.weg', builtIn: 'screens/printout/liveFormRows.ts' },
  { pattern: 'ausdruck.glasErklaerung.zeilen.wegOhneOrt', builtIn: 'screens/printout/liveFormRows.ts' },
  { pattern: 'ausdruck.glasErklaerung.zeilen.zeile', builtIn: 'screens/printout/liveFormRows.ts' },
  { pattern: 'ausdruck.glasErklaerung.zeilen.zeilenVonBis', builtIn: 'screens/printout/liveFormRows.ts' },
  { pattern: 'ausdruck.kinderFelder.*', builtIn: 'screens/printout/PrintoutScreen.tsx' },
  { pattern: 'auth.err*', builtIn: 'screens/LoginScreen.tsx' },
  { pattern: 'belege.grund.*', builtIn: 'screens/receipts/ReceiptOutcomeLines.tsx' },
  { pattern: 'belege.grundSatz.*', builtIn: 'screens/receipts/ReceiptOutcomeLines.tsx' },
  { pattern: 'bescheid.einspruch.ergebnis.*', builtIn: 'screens/assessment/AssessmentScreen.tsx' },
  { pattern: 'bescheid.status.*', builtIn: 'screens/assessment/AssessmentScreen.tsx' },
  { pattern: 'bestaetigung.anlagen.*', builtIn: 'screens/cockpit/CockpitNotices.tsx' },
  { pattern: 'bestaetigung.aufgaben.art.*', builtIn: 'screens/confirmation/ConfirmationScreen.tsx' },
  { pattern: 'bestaetigung.fragen.*', builtIn: 'screens/confirmation/confirmationText.ts' },
  { pattern: 'bestaetigung.instanz.*', builtIn: 'screens/confirmation/confirmationText.ts' },
  { pattern: 'bestaetigung.instanz.*Ohne', builtIn: 'screens/confirmation/confirmationText.ts' },
  { pattern: 'bestaetigung.masken.*', builtIn: 'screens/confirmation/ConfirmationScreen.tsx' },
  { pattern: 'bestaetigung.werte.filingType.*', builtIn: 'screens/confirmation/confirmationText.ts' },
  { pattern: 'bestaetigung.werte.wochentage.*', builtIn: 'screens/confirmation/confirmationText.ts' },
  { pattern: 'business.anlagen.gebaeudeDatum.*', builtIn: 'screens/business/AssetsPage.tsx' },
  { pattern: 'business.anlagen.methodeArt.*', builtIn: 'screens/business/AssetsPage.tsx' },
  { pattern: 'business.anlagen.nutzungArt.*', builtIn: 'screens/business/AssetsPage.tsx' },
  { pattern: 'business.art.*', builtIn: 'screens/business/BusinessHome.tsx' },
  { pattern: 'business.bank.quelle.*', builtIn: 'screens/business/BankPage.tsx' },
  { pattern: 'business.beleg.richtung.*', builtIn: 'screens/business/BusinessReceiptUpload.tsx' },
  { pattern: 'business.elster.formular.*', builtIn: 'screens/business/ElsterPage.tsx' },
  { pattern: 'business.elster.gruppe.*', builtIn: 'screens/business/ElsterPage.tsx' },
  { pattern: 'business.erfassung.zeile.*', builtIn: 'screens/business/QuickEntryPage.tsx' },
  { pattern: 'business.export.platzhalter.*', builtIn: 'screens/business/ExportPage.tsx' },
  { pattern: 'business.gewerbedaten.feld.*', builtIn: 'screens/business/TradeInputsPage.tsx' },
  { pattern: 'business.kfz.antrieb.*', builtIn: 'screens/business/CompanyCarPage.tsx' },
  { pattern: 'business.kfz.feld.*', builtIn: 'screens/business/CompanyCarPage.tsx' },
  { pattern: 'business.kfz.methoden.*', builtIn: 'screens/business/CompanyCarPage.tsx' },
  { pattern: 'business.lohn.art.*', builtIn: 'screens/business/PayrollPage.tsx' },
  { pattern: 'business.lohn.feld.*', builtIn: 'screens/business/PayrollPage.tsx' },
  { pattern: 'business.lohn.kirche.*', builtIn: 'screens/business/PayrollPage.tsx' },
  { pattern: 'business.lohn.kz.*', builtIn: 'screens/business/PayrollPage.tsx' },
  { pattern: 'business.lohn.zeitraum.*', builtIn: 'screens/business/PayrollPage.tsx' },
  { pattern: 'business.profil.frage.*', builtIn: 'screens/business/ProfilePage.tsx' },
  { pattern: 'business.profil.versteuerungArt.*', builtIn: 'screens/business/ProfilePage.tsx' },
  { pattern: 'business.profil.vorschlag.*', builtIn: 'screens/business/ProfilePage.tsx' },
  { pattern: 'business.sonder.art.*', builtIn: 'screens/business/SpecialTariffsPage.tsx' },
  { pattern: 'business.sonder.feld.*', builtIn: 'screens/business/SpecialTariffsPage.tsx' },
  { pattern: 'business.sonder.methode.*', builtIn: 'screens/business/SpecialTariffsPage.tsx' },
  { pattern: 'business.steuerschluessel.*', builtIn: 'screens/advisor/chat/BookingDraftCard.tsx' },
  { pattern: 'business.va.kz.*', builtIn: 'screens/business/VatPrepaymentsPage.tsx' },
  { pattern: 'business.va.periode.*', builtIn: 'screens/business/VatPrepaymentsPage.tsx' },
  { pattern: 'business.va.quelle.*', builtIn: 'screens/business/VatPrepaymentsPage.tsx' },
  { pattern: 'business.va.wahl.*', builtIn: 'screens/business/VatPrepaymentsPage.tsx' },
  { pattern: 'cockpit.erstattung.fehlt.*', builtIn: 'screens/capital/CapitalScreen.tsx' },
  { pattern: 'cockpit.erstattung.grund.*', builtIn: 'screens/capital/CapitalScreen.tsx' },
  { pattern: 'cockpit.erstattung.kirchensteuerOffen.*', builtIn: 'screens/cockpit/CockpitRefund.tsx' },
  { pattern: 'cockpit.kachel.*.formular', builtIn: 'screens/cockpit/CockpitTiles.tsx' },
  { pattern: 'funnel.kontoWand.pfad.*', builtIn: 'screens/cockpit/useCockpit.ts' },
  { pattern: 'funnel.kontoWand.schritte.*', builtIn: 'screens/funnel/KontoWandScreen.tsx' },
  { pattern: 'grenzgaenger.interview.*.help', builtIn: 'screens/cross-border/CrossBorderInterviewStep.tsx' },
  { pattern: 'grenzgaenger.interview.*.titleAfter', builtIn: 'screens/cross-border/CrossBorderInterviewStep.tsx' },
  { pattern: 'grenzgaenger.interview.*.titleBefore', builtIn: 'screens/cross-border/CrossBorderInterviewStep.tsx' },
  { pattern: 'grenzgaenger.interview.*.titleMark', builtIn: 'screens/cross-border/CrossBorderInterviewStep.tsx' },
  { pattern: 'grenzgaenger.lohnausweis.felder.*', builtIn: 'screens/cross-border/ChFieldInput.tsx' },
  { pattern: 'grenzgaenger.nGre.felder.*', builtIn: 'screens/cross-border/CrossBorderNGreSection.tsx' },
  { pattern: 'grenzgaenger.nGre.taggeld.ahv.*', builtIn: 'screens/cross-border/DailyBenefitQuestion.tsx' },
  { pattern: 'grenzgaenger.nGre.taggeld.betrag.*', builtIn: 'screens/cross-border/DailyBenefitQuestion.tsx' },
  { pattern: 'grenzgaenger.nGre.taggeld.betragHilfe.*', builtIn: 'screens/cross-border/DailyBenefitQuestion.tsx' },
  { pattern: 'grenzgaenger.nGre.taggeld.quelle.*', builtIn: 'screens/cross-border/DailyBenefitQuestion.tsx' },
  { pattern: 'grenzgaenger.vorsorge.*', builtIn: 'screens/cross-border/CrossBorderProvisionSection.tsx' },
  { pattern: 'interview.*.titleAfter', builtIn: 'screens/interview/QuestionScreen.tsx' },
  { pattern: 'interview.*.titleBefore', builtIn: 'screens/interview/QuestionScreen.tsx' },
  { pattern: 'interview.*.titleMark', builtIn: 'screens/interview/QuestionScreen.tsx' },
  { pattern: 'interview.postError.*', builtIn: 'screens/interview/PostErrorNotice.tsx' },
  { pattern: 'kapital.felder.*', builtIn: 'screens/capital/CapitalScreen.tsx' },
  { pattern: 'kapital.guenstigerpruefung.**', builtIn: 'screens/capital/CapitalScreen.tsx' },
  { pattern: 'kapital.inhaber.*', builtIn: 'screens/capital/CapitalScreen.tsx' },
  { pattern: 'katalog.hints.*', builtIn: 'screens/catalog/CatalogScreen.tsx' },
  { pattern: 'katalog.options.*', builtIn: 'screens/catalog/CatalogScreen.tsx' },
  { pattern: 'katalog.questions.*', builtIn: 'screens/catalog/CatalogScreen.tsx' },
  { pattern: 'kinder.lueckeFeld.*', builtIn: 'screens/children/ChildCard.tsx' },
  { pattern: 'lstb.scan.field.reason.*', builtIn: 'screens/lstb/LstbScreen.tsx' },
  { pattern: 'lstb.scan.progress.*', builtIn: 'screens/lstb/scan/LstbScanPanel.tsx' },
  { pattern: 'lstb.widerspruch.*', builtIn: 'screens/lstb/LstbScreen.tsx' },
  { pattern: 'onboarding.summary.submitError.network', builtIn: 'screens/onboarding/profileSaveFailure.ts' },
  { pattern: 'onboarding.summary.submitError.validation', builtIn: 'screens/onboarding/profileSaveFailure.ts' },
  { pattern: 'plausibilitaet.hinweis.*', builtIn: 'screens/plausibility/PlausibilityScreen.tsx' },
  { pattern: 'plausibilitaet.widerspruch.*', builtIn: 'screens/plausibility/PlausibilityScreen.tsx' },
  { pattern: 'profil.assistenten.verbinden.art.*', builtIn: 'screens/profile/AssistantConnectForm.tsx' },
  { pattern: 'profil.devices.loadError.*', builtIn: 'screens/device/DeviceListSection.tsx' },
  { pattern: 'profil.saveError.network', builtIn: 'screens/onboarding/profileSaveFailure.ts' },
  { pattern: 'profil.saveError.validation', builtIn: 'screens/onboarding/profileSaveFailure.ts' },
  { pattern: 'rente.arten.*', builtIn: 'screens/confirmation/confirmationText.ts' },
  { pattern: 'rueckfrage.*.bestaetigen', builtIn: 'confirm/useConfirmAction.tsx' },
  { pattern: 'rueckfrage.*.text', builtIn: 'confirm/useConfirmAction.tsx' },
  { pattern: 'rueckfrage.*.titel', builtIn: 'confirm/useConfirmAction.tsx' },
  { pattern: 'stammdaten.*', builtIn: 'screens/master-data/MasterDataScreen.tsx' },
  { pattern: 'stammdaten.familienstaende.*', builtIn: 'screens/master-data/MasterDataScreen.tsx' },
  { pattern: 'stammdaten.ibanPruefung.*', builtIn: 'screens/master-data/MasterDataScreen.tsx' },
  { pattern: 'stammdaten.religionen.*', builtIn: 'screens/master-data/MasterDataScreen.tsx' },
  { pattern: 'stepUp.withProvider.*', builtIn: 'auth/StepUpOptions.tsx' },
  { pattern: 'strom.art.*', builtIn: 'screens/strom/StromPages.tsx' },
  { pattern: 'strom.formular.*', builtIn: 'screens/strom/StromPages.tsx' },
  { pattern: 'strom.gruppe.*', builtIn: 'screens/strom/StromPages.tsx' },
  { pattern: 'strom.maske.*', builtIn: 'screens/strom/stromTitles.ts' },
  { pattern: 'strom.maskePartner.*', builtIn: 'screens/strom/stromTitles.ts' },
  { pattern: 'strom.partnerSchritt.*', builtIn: 'screens/strom/PartnerPage.tsx' },
  { pattern: 'strom.thema.*', builtIn: 'screens/strom/StromPages.tsx' },
  { pattern: 'verlauf.abgleich.gruppe.*', builtIn: 'screens/history/AssessmentDiffView.tsx' },
  { pattern: 'verlauf.delta.keins.*', builtIn: 'screens/history/historyFormat.ts' },
  { pattern: 'verlauf.ereignis.*', builtIn: 'screens/history/historyInsights.ts' },
  { pattern: 'verlauf.fehlt.*', builtIn: 'screens/history/historyFormat.ts' },
  { pattern: 'verlauf.fehltKurz.*', builtIn: 'screens/history/historyTimeline.ts' },
  { pattern: 'verlauf.frage.*', builtIn: 'screens/history/FiledElsewhereQuestion.tsx' },
  { pattern: 'verlauf.frage.*A11y', builtIn: 'screens/history/FiledElsewhereQuestion.tsx' },
  { pattern: 'verlauf.gruppe.tab.*', builtIn: 'screens/history/HistoryDevelopment.tsx' },
  { pattern: 'verlauf.jahr.lstb.**', builtIn: 'screens/history/historyTimeline.ts' },
  { pattern: 'verlauf.jetzt.*', builtIn: 'screens/history/HistoryScreen.tsx' },
  { pattern: 'verlauf.jetzt.*A11y', builtIn: 'screens/history/HistoryScreen.tsx' },
  { pattern: 'verlauf.kennzahl.*.label', builtIn: 'screens/history/HistoryDevelopment.tsx' },
  { pattern: 'verlauf.kennzahl.*.sub', builtIn: 'screens/history/HistoryDevelopment.tsx' },
  { pattern: 'verlauf.kennzahl.*.titel', builtIn: 'screens/history/HistoryDevelopment.tsx' },
  { pattern: 'verlauf.lehre.hinweis.*', builtIn: 'screens/history/AssessmentDiffView.tsx' },
  { pattern: 'verlauf.maske.*', builtIn: 'screens/history/AssessmentDiffView.tsx' },
  { pattern: 'verlauf.person.*', builtIn: 'screens/history/AssessmentDiffView.tsx' },
  { pattern: 'verlauf.position.*', builtIn: 'screens/history/positionLabels.ts' },
  { pattern: 'verlauf.segment.*', builtIn: 'screens/history/HistoryDevelopment.tsx' },
  { pattern: 'verlauf.teil.*', builtIn: 'screens/history/owlSentences.ts' },
  { pattern: 'verlauf.unterlagen.ergebnis.*', builtIn: 'screens/history/HistoryDocumentsScreen.tsx' },
  { pattern: 'vermietung.felder.*', builtIn: 'screens/rental/RentalScreen.tsx' },
]

const TEST_FILE = /\.test\.tsx?$|^test-/

function productionFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return productionFiles(full)
    return /\.tsx?$/.test(entry.name) && !TEST_FILE.test(entry.name) ? [full] : []
  })
}

/** Every leaf key; a list of texts counts per entry (`key.0`, `key.1`), the way i18next addresses it. */
function leafKeys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([name, value]) => {
    const key = prefix ? `${prefix}.${name}` : name
    if (Array.isArray(value)) return value.map((_, index) => `${key}.${index}`)
    return value !== null && typeof value === 'object' ? leafKeys(value as Tree, key) : [key]
  })
}

/** Every quoted string that could be a key, anywhere in production source: a `t()` argument or an entry of a map of keys. */
function namedInFull(): Set<string> {
  const named = new Set<string>()
  for (const root of [SRC, path.join(REPO, 'packages/ui/src'), path.join(REPO, 'packages/core/src')]) {
    for (const file of productionFiles(root)) {
      for (const match of readFileSync(file, 'utf8').matchAll(/['"`]([A-Za-z0-9_.-]+)['"`]/g)) named.add(match[1]!)
    }
  }
  return named
}

const pluralBase = (key: string) => key.replace(/_(one|other|zero)$/, '')
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** `*` as a part of one path segment: what a family covers. */
const coverage = (pattern: string) => new RegExp(`^${pattern.split('*').map(escaped).join('[^.]*')}$`)
/** `*` as anything: a template whose variable holds a whole key prefix still builds the declared pattern. */
const instanceOf = (template: string) => new RegExp(`^${template.split('*').map(escaped).join('.*')}$`)

/** The key shapes a file builds: its template literals and `'prefix.' + x` concatenations, each `${…}` as `*`. */
function builtShapes(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const hole = /\$\{(?:[^{}`]|\{[^{}`]*\})*\}/g
  const templates = [...source.matchAll(/`((?:[A-Za-z0-9_.-]|\$\{(?:[^{}`]|\{[^{}`]*\})*\})+)`/g)].map((m) => m[1]!).filter((raw) => raw.includes('${')).map((raw) => raw.replace(hole, '*'))
  const concatenations = [...source.matchAll(/['"]([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*\.)['"]\s*\+/g)].map((m) => `${m[1]!}*`)
  // A shape without a fixed word (`*.*`) says nothing about which keys it builds.
  return [...templates, ...concatenations].filter((shape) => /[A-Za-z]{3,}/.test(shape))
}

describe('every German text is used (no dead i18n keys)', () => {
  const named = namedInFull()
  const usedInFull = (key: string) => named.has(key) || named.has(pluralBase(key)) || named.has(key.replace(/\.\d+$/, ''))
  const notNamed = leafKeys(de).filter((key) => !usedInFull(key))
  const families = DYNAMIC_FAMILIES.map((family) => ({ ...family, covers: coverage(family.pattern) }))
  const inFamily = (key: string) => families.some(({ covers }) => covers.test(key) || covers.test(pluralBase(key)))

  it('finds the keys it checks', () => {
    expect(leafKeys(de).length).toBeGreaterThan(3000)
    expect(named.size).toBeGreaterThan(1000)
  })

  it('every key of de.json is named in the source or belongs to a declared run-time family', () => {
    expect(notNamed.filter((key) => !inFamily(key))).toEqual([])
  })

  it('every declared family is built where the table says', () => {
    const unproven = DYNAMIC_FAMILIES.filter(({ pattern, builtIn }) => !builtShapes(path.join(SRC, builtIn)).some((shape) => instanceOf(shape).test(pattern)))
    expect(unproven).toEqual([])
  })

  it('every declared family covers a key that nothing names in full', () => {
    const idle = families.filter(({ covers }) => !notNamed.some((key) => covers.test(key) || covers.test(pluralBase(key)))).map(({ pattern }) => pattern)
    expect(idle).toEqual([])
  })

  it('no family is declared twice', () => {
    const patterns = DYNAMIC_FAMILIES.map(({ pattern }) => pattern)
    expect(patterns.filter((pattern, index) => patterns.indexOf(pattern) !== index)).toEqual([])
  })
})

describe('texts that state figures take them from @steuereule/core', () => {
  it('the owl consent names its providers through a placeholder, never one fixed company (LEGAL-2)', () => {
    for (const key of ['owlPersonalData.card.body', 'owlPersonalData.section.body', 'advisor.chat.privacyNotice'] as const) {
      const [group, ...rest] = key.split('.')
      const text = rest.reduce<unknown>((node, part) => (node as Tree)[part], (de as Tree)[group!]) as string
      expect(text, key).toContain('{{providers}}')
      expect(text, key).not.toMatch(/Gemini|Anthropic|OpenAI/)
    }
  })

  it('no text writes a file size of its own; the receipt limit is the `receiptFileSize` placeholder', () => {
    for (const locale of [de, en]) {
      expect(JSON.stringify(locale)).not.toMatch(/\d\s?(MB|GB)\b/)
      expect((locale as Tree as { apiFehler: { tooLarge: string } }).apiFehler.tooLarge).toContain('{{receiptFileSize}}')
    }
  })

  it('the deletion warning prints backup and hold periods through placeholders (LEGAL-4)', () => {
    const text = de.datenschutz.delete.offer.warning1
    for (const placeholder of ['{{backupDays}}', '{{paymentYears}}', '{{filingYears}}']) expect(text).toContain(placeholder)
  })
})
