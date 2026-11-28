#!/usr/bin/env node
// Builds the documentation as a static site in the app's design: docs/site/.
// The Markdown under docs/ stays the one source; this script only lays it out. The architecture
// document becomes one page per arc42 chapter, every other document one page, every ADR one page,
// with two overviews (Decisions, Documents). `--check` builds in memory and fails when docs/site/
// differs, so a page cannot fall behind its source unnoticed.
//
//   node scripts/docs/build-site.mjs           # write docs/site/
//   node scripts/docs/build-site.mjs --check   # exit 1 when docs/site/ is stale
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Marked } from 'marked'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'docs/site')
const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'site')
const posix = path.posix
const read = (file) => fs.readFileSync(file, 'utf8')
/** A file of the repository by its path from the root, e.g. `docs/adr/index.md`. */
const readSource = (source) => read(path.join(ROOT, source))

const ARCHITECTURE = 'docs/architecture.md'
const SUBSYSTEMS = 'docs/architecture-subsystems.md'

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const twoDigits = (number) => String(number).padStart(2, '0')

// The text helpers below walk their input once. A lazy or unanchored pattern over a whole document
// can take quadratic time, and these run over every page of the site.

/** The text without its tags: everything from a `<` to the next `>` is left out. */
function stripTags(html) {
  let text = ''
  let at = 0
  while (at < html.length) {
    const open = html.indexOf('<', at)
    if (open === -1) return text + html.slice(at)
    const close = html.indexOf('>', open)
    if (close === -1) return text + html.slice(at)
    text += html.slice(at, open)
    at = close + 1
  }
  return text
}

/** What stands between the first `open` and the `close` that follows it; empty when either is missing. */
function between(text, open, close) {
  const start = text.indexOf(open)
  if (start === -1) return ''
  const end = text.indexOf(close, start + open.length)
  return end === -1 ? '' : text.slice(start + open.length, end)
}

const isDigits = (text) => text !== '' && [...text].every((char) => char >= '0' && char <= '9')

/** `file.ts:351` and `file.ts:351:7` name a place in a file; this is the file. */
function withoutLineSuffix(filePath) {
  let result = filePath
  for (let round = 0; round < 2; round += 1) {
    const colon = result.lastIndexOf(':')
    if (colon === -1 || !isDigits(result.slice(colon + 1))) break
    result = result.slice(0, colon)
  }
  return result
}

/** The anchor GitHub gives a heading, so links written for the Markdown keep working here. */
function slugOf(text) {
  return stripTags(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-')
}

/** Splits a document at its `# ` headings: what stands before the first one is the preamble. */
function splitChapters(markdown) {
  const parts = []
  let current = { title: null, lines: [] }
  let fenced = false
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced
    if (!fenced && line.startsWith('# ')) {
      parts.push(current)
      current = { title: line.slice(2).trim(), lines: [] }
      continue
    }
    current.lines.push(line)
  }
  parts.push(current)
  return parts.map((part) => ({ title: part.title, body: part.lines.join('\n').trim() })).filter((part) => part.title !== null || part.body !== '')
}

/** A document's own title (its first `# ` heading) and the text below it. */
function titleAndBody(source) {
  const [first, ...rest] = splitChapters(readSource(source))
  const titled = first.title === null ? rest[0] : first
  if (!titled || titled.title === null) throw new Error(`${source}: no "# " heading to take the title from`)
  const later = (first.title === null ? rest.slice(1) : rest).map((part) => `# ${part.title}\n\n${part.body}`)
  return { title: ownAnchor(titled.title).text, markdown: [first.title === null ? first.body : '', titled.body, ...later].filter((text) => text !== '').join('\n\n') }
}

/** A heading may name its own anchor: `## Use cases {#section-use-cases}`. */
function ownAnchor(heading) {
  const trimmed = heading.trimEnd()
  const open = trimmed.lastIndexOf('{#')
  if (open === -1 || !trimmed.endsWith('}')) return { text: heading, id: null }
  const id = trimmed.slice(open + 2, -1)
  return /^[\w-]+$/.test(id) ? { text: trimmed.slice(0, open).trimEnd(), id } : { text: heading, id: null }
}

const decodeEntities = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

const inline = new Marked({ gfm: true })
const inlineHtml = (markdown) => inline.parseInline(markdown)
const plainText = (markdown) => decodeEntities(stripTags(inlineHtml(markdown)))

function renderMarkdown(markdown) {
  const headings = []
  const marked = new Marked({ gfm: true })
  marked.use({
    renderer: {
      heading({ tokens, depth, text }) {
        const own = ownAnchor(text)
        const id = own.id ?? slugOf(text)
        const label = own.id === null ? this.parser.parseInline(tokens) : inlineHtml(own.text)
        headings.push({ depth, id, text: label })
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${label}</h${depth}>\n`
      },
    },
  })
  // A row that starts with an id of its own (REQ-002, UC-01) can be linked to, as the documents already do.
  const rowIds = new Set()
  const withRowIds = marked.parse(markdown).replace(/<tr>\n<td>(?:<strong>)?([A-Z]{2,}-\d+)(?:<\/strong>)?<\/td>/g, (row, id) => {
    if (rowIds.has(id) || headings.some((heading) => heading.id === id)) return row
    rowIds.add(id)
    return row.replace('<tr>', `<tr id="${id}">`)
  })
  // A wide table scrolls inside its own frame instead of widening the page.
  const html = withRowIds.replace(/<table>/g, '<div class="table"><table>').replace(/<\/table>/g, '</table></div>')
  return { html, headings, rowIds }
}

/** The first sentence of a page's prose, for its card on an overview. */
function leadOf(html) {
  const text = decodeEntities(stripTags(between(html, '<p>', '</p>'))).replace(/\s+/g, ' ').trim()
  // A sentence ends at a full stop, question or exclamation mark that a space or the end follows.
  let end = -1
  for (let at = 0; at < text.length && end === -1; at += 1) {
    if ('.!?'.includes(text[at]) && (at === text.length - 1 || text[at + 1] === ' ')) end = at
  }
  const sentence = end === -1 ? text : text.slice(0, end + 1)
  return sentence.length > 180 ? `${sentence.slice(0, 177).trimEnd()}…` : sentence
}

function markdownSources(dir = 'docs') {
  return fs
    .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((entry) => {
      const source = posix.join(dir, entry.name)
      if (entry.isDirectory()) return source === 'docs/site' ? [] : markdownSources(source)
      return entry.name.endsWith('.md') ? [source] : []
    })
    .sort()
}

/** What an ADR says about itself in its first lines: `**Status:** Accepted · 2026-07-22`. */
function statusOf(markdown) {
  const status = /\*\*Status:\*\*\s*([^\n·]+)/.exec(markdown)?.[1] ?? ''
  // The pill carries the state itself ("Accepted", "Superseded by 0009"); who decided and when stays in the record.
  const text = plainText(status)
  const cut = [...text].findIndex((char, at) => at > 0 && '—–('.includes(char) && text[at - 1] === ' ')
  return (cut === -1 ? text : text.slice(0, cut)).trim().replace(/[.;,]$/, '')
}

const FOLDER_LABELS = {
  docs: 'Overview documents',
  'docs/adr': 'Decision log',
  'docs/arc42': 'arc42',
  'docs/process': 'Process',
  'docs/requirements': 'Requirements',
  'docs/testing': 'Testing',
  'docs/testing/user-test': 'User tests',
  'docs/sre': 'Reliability',
  'docs/runtime': 'Runtime',
  'docs/legal': 'Legal',
  'docs/ux': 'UX',
  'docs/research': 'Research',
  'docs/research/grenzgaenger-switzerland': 'Research: cross-border commuters',
  'docs/agent-prompts': 'Agent prompts',
}

function collectPages() {
  const pages = []
  const [preamble, ...chapters] = splitChapters(readSource(ARCHITECTURE).replace(/^# .*\n/, ''))
  pages.push({ file: 'index.html', source: ARCHITECTURE, kind: 'start', title: 'Architecture', markdown: preamble.body })
  for (const chapter of chapters) {
    const match = /^(\d+)\.\s+(.*)$/.exec(chapter.title)
    if (!match) throw new Error(`${ARCHITECTURE}: chapter without a number: "${chapter.title}"`)
    pages.push({
      file: `${twoDigits(Number(match[1]))}-${slugOf(match[2])}.html`,
      source: ARCHITECTURE,
      kind: 'chapter',
      number: Number(match[1]),
      title: match[2],
      // The chapter heading keeps its anchor, so `architecture.md#4-solution-strategy` finds the page.
      anchor: slugOf(chapter.title),
      markdown: chapter.body,
    })
  }
  pages.push({ file: 'subsystems.html', source: SUBSYSTEMS, kind: 'companion', title: 'Backend modules from the inside', markdown: titleAndBody(SUBSYSTEMS).markdown })

  for (const source of markdownSources()) {
    if (source === ARCHITECTURE || source === SUBSYSTEMS) continue
    const { title, markdown } = titleAndBody(source)
    const file = source.slice('docs/'.length).replace(/\.md$/, '.html')
    const adr = /^docs\/adr\/(\d{4})-/.exec(source)
    if (adr) {
      pages.push({ file, source, kind: 'adr', adrNumber: adr[1], title: title.replace(/^ADR-\d{4}\s*[—–:-]\s*/, ''), status: statusOf(markdown), markdown })
    } else {
      pages.push({ file, source, kind: 'document', title, folder: posix.dirname(source), markdown })
    }
  }
  pages.push({ file: 'decisions.html', source: null, kind: 'decisions', title: 'Decisions', markdown: '' })
  pages.push({ file: 'documents.html', source: null, kind: 'documents', title: 'Documents', markdown: '' })
  return pages
}

/** The path from one page of the site to another file of the site. */
const fromPage = (page, file) => posix.relative(posix.dirname(page.file), file) || posix.basename(file)
/** The path from a page to a file of the repository that is not a page, e.g. a picture or a source file. */
const toRepoFile = (page, repoPath) => posix.relative(posix.join('docs/site', posix.dirname(page.file)), repoPath)

/**
 * Links and pictures in a document are written relative to that document. Its page lives elsewhere,
 * another document is a page of its own now, and a heading of the architecture is on one of twelve pages.
 */
function rewriteReferences(html, page, site) {
  const sourceDir = posix.dirname(page.source)
  const rewriteUrl = (url) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url) || url.startsWith('/')) return url
    const hashAt = url.indexOf('#')
    const filePart = hashAt === -1 ? url : url.slice(0, hashAt)
    const anchor = hashAt === -1 ? null : url.slice(hashAt + 1)
    if (filePart === '') {
      const target = site.pageOfAnchor.get(`${page.source}#${anchor}`)
      return target !== undefined && target !== page.file ? `${fromPage(page, target)}#${anchor}` : url
    }
    const repoPath = posix.normalize(posix.join(sourceDir, decodeURI(filePart)))
    if (repoPath.startsWith('..')) return url
    const targetFile = (anchor !== null && site.pageOfAnchor.get(`${repoPath}#${anchor}`)) || site.pageOfSource.get(repoPath)
    if (targetFile !== undefined) return anchor === null ? fromPage(page, targetFile) : `${fromPage(page, targetFile)}#${anchor}`
    // `file.ts:351` names a line for the reader; the link goes to the file.
    const filePath = withoutLineSuffix(repoPath)
    if (!fs.existsSync(path.join(ROOT, filePath))) site.deadLinks.push(`${page.source}: ${url}`)
    const href = toRepoFile(page, filePath)
    return anchor === null ? href : `${href}#${anchor}`
  }
  return html
    .replace(/\b(href|src)="([^"]*)"/g, (_all, attr, url) => `${attr}="${rewriteUrl(url)}"`)
    .replace(/\bsrcset="([^"]*)"/g, (_all, url) => `srcset="${rewriteUrl(url)}"`)
}

/** The log's own index and the tech radar sit beside the ADRs and belong to the Decisions overview. */
const inDecisionLog = (page) => page.kind === 'document' && page.folder === 'docs/adr'

function navigation(pages, current) {
  const item = (page, label, active, number = '') =>
    `<li><a class="nav-item${active ? ' is-active' : ''}" href="${fromPage(current, page.file)}"${active ? ' aria-current="page"' : ''}>${number}<span>${escapeHtml(label)}</span></a></li>`
  const chapters = pages
    .filter((page) => page.kind === 'start' || page.kind === 'chapter')
    .map((page) => item(page, page.kind === 'start' ? 'Overview' : page.title, page === current, page.kind === 'chapter' ? `<span class="nav-number">${twoDigits(page.number)}</span>` : ''))
  const companion = pages.filter((page) => page.kind === 'companion').map((page) => item(page, page.title, page === current))
  const byKind = (kind) => pages.find((page) => page.kind === kind)
  // An ADR or a document has no line of its own in the rail: its overview is marked instead.
  const library = [
    item(byKind('decisions'), 'Decisions', current.kind === 'decisions' || current.kind === 'adr' || inDecisionLog(current)),
    item(byKind('documents'), 'Documents', current.kind === 'documents' || (current.kind === 'document' && !inDecisionLog(current))),
  ]
  return `<nav class="nav" aria-label="Site">
        <p class="eyebrow">arc42</p>
        <ul>${chapters.join('')}</ul>
        <p class="eyebrow">Companion</p>
        <ul>${companion.join('')}</ul>
        <p class="eyebrow">Library</p>
        <ul>${library.join('')}</ul>
      </nav>`
}

function layout({ page, pages, body, asOf }) {
  const plain = plainText(page.title)
  const title = page.kind === 'start' ? 'SteuerEule — Architecture' : `${page.kind === 'adr' ? `ADR-${page.adrNumber} — ` : ''}${plain} — SteuerEule`
  const logo = toRepoFile(page, 'images/steuereule-logo.svg')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="${logo}">
  <link rel="stylesheet" href="${fromPage(page, 'assets/site.css')}">
</head>
<body>
  <a class="skip" href="#content">Skip to the content</a>
  <div class="shell">
    <aside class="rail">
      <a class="brand" href="${fromPage(page, 'index.html')}">
        <img src="${logo}" width="36" height="36" alt="">
        <span><strong>SteuerEule</strong><span class="eyebrow">Architecture</span></span>
      </a>
      <details class="menu" open>
        <summary>Contents</summary>
        ${navigation(pages, page)}
      </details>
      <p class="rail-foot">Architecture as of ${escapeHtml(asOf)}<br>Built from the Markdown under <code>docs/</code></p>
    </aside>
    <main id="content" class="content">
${body}
    </main>
  </div>
  <script src="${fromPage(page, 'assets/site.js')}"></script>
</body>
</html>
`
}

const step = (page, target, label, text) =>
  target ? `<a class="step step-${label}" href="${fromPage(page, target.file)}"><span class="eyebrow">${label === 'next' ? 'Next' : 'Previous'}</span><span>${text}</span></a>` : '<span></span>'

const sectionChips = (headings) => {
  const sections = headings.filter((heading) => heading.depth === 2)
  return sections.length > 1 ? `<ul class="chips" aria-label="On this page">${sections.map((s) => `<li><a class="chip" href="#${s.id}">${s.text}</a></li>`).join('')}</ul>` : ''
}

function statusPill(status) {
  if (status === '') return ''
  const tone = /^accepted/i.test(status) ? 'ok' : /superseded|deprecated|rejected|withdrawn/i.test(status) ? 'past' : 'open'
  return `<span class="status status-${tone}">${escapeHtml(status)}</span>`
}

function pageBody(page, pages, html, headings) {
  const readingOrder = pages.filter((p) => p.kind === 'start' || p.kind === 'chapter' || p.kind === 'companion')
  const adrs = pages.filter((p) => p.kind === 'adr')
  let eyebrow
  let steps = ''
  let heading = inlineHtml(page.title)
  if (page.kind === 'adr') {
    const at = adrs.indexOf(page)
    eyebrow = `Decision · ADR-${page.adrNumber}`
    steps = `${step(page, adrs[at - 1], 'previous', adrs[at - 1] ? `ADR-${adrs[at - 1].adrNumber}` : '')}${step(page, adrs[at + 1], 'next', adrs[at + 1] ? `ADR-${adrs[at + 1].adrNumber}` : '')}`
    heading = `${heading} ${statusPill(page.status)}`
  } else if (page.kind === 'document') {
    eyebrow = FOLDER_LABELS[page.folder] ?? page.folder
  } else {
    const at = readingOrder.indexOf(page)
    const label = (target) => (target ? escapeHtml(target.kind === 'start' ? 'Overview' : target.title) : '')
    eyebrow = page.kind === 'chapter' ? `Chapter ${page.number} of ${pages.filter((p) => p.kind === 'chapter').length}` : 'Companion document'
    steps = `${step(page, readingOrder[at - 1], 'previous', label(readingOrder[at - 1]))}${step(page, readingOrder[at + 1], 'next', label(readingOrder[at + 1]))}`
  }
  const back =
    page.kind === 'adr' || inDecisionLog(page)
      ? `<p class="back"><a href="${fromPage(page, 'decisions.html')}">All decisions</a></p>`
      : page.kind === 'document'
        ? `<p class="back"><a href="${fromPage(page, 'documents.html')}">All documents</a></p>`
        : ''
  return `      <header class="page-head">
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h1${page.anchor ? ` id="${page.anchor}"` : ''}>${heading}</h1>
        ${sectionChips(headings)}
      </header>
      <article class="prose">
${html}
      </article>
      ${back}
      ${steps === '' ? '' : `<nav class="steps" aria-label="Previous and next">${steps}</nav>`}`
}

const card = (page, target, eyebrow, lead) => `<li><a class="card" href="${fromPage(page, target.file)}">
          <span class="eyebrow">${escapeHtml(eyebrow)}</span>
          <strong>${inlineHtml(target.title)}</strong>
          <span class="card-lead">${escapeHtml(lead)}</span>
        </a></li>`

function startBody(page, pages, html, leads) {
  const cards = pages.filter((p) => p.kind === 'chapter' || p.kind === 'companion').map((p) => card(page, p, p.kind === 'chapter' ? twoDigits(p.number) : 'Companion', leads.get(p.file) ?? ''))
  const adrs = pages.filter((p) => p.kind === 'adr')
  const documents = pages.filter((p) => p.kind === 'document' && !inDecisionLog(p))
  return `      <header class="page-head hero">
        <p class="eyebrow">SteuerEule · arc42</p>
        <h1>Architecture</h1>
        <p class="lead">A pure tax core, use cases around it, the database and every SDK in named adapter files. Dependencies point inward, and two architecture tests check it on every run.</p>
      </header>
      <figure class="figure">
        <img src="${toRepoFile(page, 'images/architecture-hexagon.svg')}" alt="Ports and Adapters: the pure @steuereule/core in the centre, the application services around it, driving adapters on the left, driven adapters on the right. Every dependency points inward.">
      </figure>
      <article class="prose">
${html}
      </article>
      <h2 class="section-title">Chapters</h2>
      <ul class="cards">
        ${cards.join('\n        ')}
      </ul>
      <h2 class="section-title">Library</h2>
      <ul class="cards">
        <li><a class="card" href="decisions.html"><span class="eyebrow">${adrs.length} ADRs</span><strong>Decisions</strong><span class="card-lead">Every architecture decision of the engineering log, with its status.</span></a></li>
        <li><a class="card" href="documents.html"><span class="eyebrow">${documents.length} documents</span><strong>Documents</strong><span class="card-lead">Process, requirements, testing, reliability, research and the rest of docs/.</span></a></li>
      </ul>`
}

function decisionsBody(page, pages) {
  const adrs = pages.filter((p) => p.kind === 'adr')
  const log = pages.find((p) => p.source === 'docs/adr/index.md')
  const radar = pages.find((p) => p.source === 'docs/adr/tech-radar.md')
  const rows = adrs.map((adr) => `<tr><td class="mono">${adr.adrNumber}</td><td><a href="${fromPage(page, adr.file)}">${inlineHtml(adr.title)}</a></td><td>${statusPill(adr.status)}</td></tr>`)
  return `      <header class="page-head">
        <p class="eyebrow">Library · ${adrs.length} decisions</p>
        <h1>Decisions</h1>
        <p class="lead">The architecture decision records of the engineering log, oldest first. The status is the one each record states in its own header.</p>
      </header>
      <article class="prose">
        <p>${log ? `How the log is kept, and how it relates to the product log: <a href="${fromPage(page, log.file)}">${inlineHtml(log.title)}</a>.` : ''}${radar ? ` What is watched but not decided: <a href="${fromPage(page, radar.file)}">${inlineHtml(radar.title)}</a>.` : ''}</p>
        <div class="table"><table class="decisions">
          <thead><tr><th>#</th><th>Decision</th><th>Status</th></tr></thead>
          <tbody>
            ${rows.join('\n            ')}
          </tbody>
        </table></div>
      </article>`
}

function documentsBody(page, pages, leads) {
  const documents = pages.filter((p) => p.kind === 'document' && !inDecisionLog(p))
  const folders = [...new Set(documents.map((p) => p.folder))].sort((a, b) => (a === 'docs' ? -1 : b === 'docs' ? 1 : a.localeCompare(b)))
  const groups = folders.map((folder) => {
    const cards = documents.filter((p) => p.folder === folder).map((p) => card(page, p, p.source.slice('docs/'.length), leads.get(p.file) ?? ''))
    return `<h2 class="section-title" id="${slugOf(folder)}">${escapeHtml(FOLDER_LABELS[folder] ?? folder)}</h2>
      <ul class="cards">
        ${cards.join('\n        ')}
      </ul>`
  })
  return `      <header class="page-head">
        <p class="eyebrow">Library · ${documents.length} documents</p>
        <h1>Documents</h1>
        <p class="lead">Everything under <code>docs/</code> besides the architecture and the decisions, by folder.</p>
      </header>
      ${groups.join('\n      ')}`
}

function buildCss() {
  // The app's tokens, with the "dunkel" theme following the reader's system setting.
  const tokens = readSource('packages/tokens/dist/tokens.css')
  const opening = '[data-theme="dunkel"] {'
  const darkRules = between(tokens, opening, '\n}')
  if (darkRules === '') throw new Error('packages/tokens/dist/tokens.css: no [data-theme="dunkel"] block found')
  const themed = tokens.replace(`${opening}${darkRules}\n}`, `@media (prefers-color-scheme: dark) {\n  :root {${darkRules.replace(/\n/g, '\n  ')}\n  }\n}`)
  return `${themed}\n${read(path.join(TEMPLATE, 'site.css'))}`
}

function build() {
  const pages = collectPages()
  const asOf = /\*\*As of\*\* \| (\S+)/.exec(readSource(ARCHITECTURE))?.[1] ?? 'unknown'
  const rendered = pages.map((page) => ({ page, ...renderMarkdown(page.markdown) }))

  // Where each document and each of its headings lives now, by the path and anchor it has in the Markdown.
  const site = { pageOfSource: new Map(), pageOfAnchor: new Map(), deadLinks: [] }
  for (const { page, headings, rowIds } of rendered) {
    if (page.source === null) continue
    for (const id of rowIds) site.pageOfAnchor.set(`${page.source}#${id}`, page.file)
    if (!site.pageOfSource.has(page.source)) site.pageOfSource.set(page.source, page.file)
    if (page.anchor) site.pageOfAnchor.set(`${page.source}#${page.anchor}`, page.file)
    for (const heading of headings) site.pageOfAnchor.set(`${page.source}#${heading.id}`, page.file)
  }

  const leads = new Map(rendered.map(({ page, html }) => [page.file, leadOf(html)]))
  const files = new Map()
  for (const { page, html, headings } of rendered) {
    const content = page.source === null ? '' : rewriteReferences(html, page, site)
    let body
    if (page.kind === 'start') body = startBody(page, pages, content, leads)
    else if (page.kind === 'decisions') body = decisionsBody(page, pages)
    else if (page.kind === 'documents') body = documentsBody(page, pages, leads)
    else body = pageBody(page, pages, content, headings)
    if (files.has(page.file)) throw new Error(`two documents would become docs/site/${page.file}`)
    files.set(page.file, layout({ page, pages, body, asOf }))
  }
  files.set('assets/site.css', buildCss())
  files.set('assets/site.js', read(path.join(TEMPLATE, 'site.js')))
  return { files, deadLinks: site.deadLinks }
}

function existingFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? existingFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')]
  })
}

const { files, deadLinks } = build()
if (process.argv.includes('--check')) {
  const onDisk = existingFiles(OUT)
  const stale = [...files].filter(([file, content]) => !onDisk.includes(file) || read(path.join(OUT, file)) !== content).map(([file]) => file)
  const orphaned = onDisk.filter((file) => !files.has(file))
  if (stale.length > 0 || orphaned.length > 0) {
    console.error('docs/site/ is not what the Markdown builds. Run `pnpm docs:site` and commit the result.')
    for (const file of stale) console.error(`  stale or missing: docs/site/${file}`)
    for (const file of orphaned) console.error(`  no longer built: docs/site/${file}`)
    process.exit(1)
  }
  console.log(`docs-site: PASS — ${files.size} files match their sources.`)
} else {
  fs.rmSync(OUT, { recursive: true, force: true })
  for (const [file, content] of files) {
    fs.mkdirSync(path.dirname(path.join(OUT, file)), { recursive: true })
    fs.writeFileSync(path.join(OUT, file), content)
  }
  console.log(`docs-site: wrote ${files.size} files to docs/site/`)
  // A link that was already dead in the Markdown stays dead here; the source is where to mend it.
  if (deadLinks.length > 0) console.warn(`docs-site: ${deadLinks.length} links in the Markdown point at files that do not exist:\n${deadLinks.map((link) => `  ${link}`).join('\n')}`)
}
