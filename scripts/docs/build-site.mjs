#!/usr/bin/env node
// Builds the architecture documentation as a small static site in the app's design: docs/site/.
// The Markdown stays the one source (docs/architecture.md, docs/architecture-subsystems.md); this
// script only lays it out. `--check` builds in memory and fails when docs/site/ differs, so a page
// cannot fall behind its source unnoticed.
//
//   node scripts/docs/build-site.mjs           # write docs/site/
//   node scripts/docs/build-site.mjs --check   # exit 1 when docs/site/ is stale
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Marked } from 'marked'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DOCS = path.join(ROOT, 'docs')
const OUT = path.join(DOCS, 'site')
const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'site')
const read = (file) => fs.readFileSync(file, 'utf8')

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The anchor GitHub gives a heading, so links written for the Markdown keep working here. */
function slugOf(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-')
}

/** Splits a document at its `# ` headings: what stands before the first numbered one is the preamble. */
function splitChapters(markdown) {
  const lines = markdown.split('\n')
  const parts = []
  let current = { title: null, lines: [] }
  let fenced = false
  for (const line of lines) {
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

function renderMarkdown(markdown) {
  const headings = []
  const marked = new Marked({ gfm: true })
  marked.use({
    renderer: {
      heading({ tokens, depth, text }) {
        const id = slugOf(text)
        headings.push({ depth, id, text: this.parser.parseInline(tokens) })
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${this.parser.parseInline(tokens)}</h${depth}>\n`
      },
    },
  })
  // A wide table scrolls inside its own frame instead of widening the page.
  const html = marked.parse(markdown).replace(/<table>/g, '<div class="table"><table>').replace(/<\/table>/g, '</table></div>')
  return { html, headings }
}

const PAGES_BY_SOURCE = { 'architecture.md': 'index.html', 'architecture-subsystems.md': 'subsystems.html' }

/**
 * Links and pictures in the Markdown are written relative to docs/. The pages live one folder
 * deeper, and a heading may now be on another page.
 */
function rewriteReferences(html, page, pageOfAnchor) {
  const rewriteUrl = (url) => {
    if (/^(?:[a-z]+:|\/\/|data:)/i.test(url)) return url
    if (url.startsWith('#')) {
      const target = pageOfAnchor.get(`architecture.md${url}`) ?? pageOfAnchor.get(`architecture-subsystems.md${url}`)
      return target !== undefined && target !== page.file ? `${target}${url}` : url
    }
    const [file, anchor] = url.split('#')
    if (file in PAGES_BY_SOURCE) {
      if (anchor === undefined) return PAGES_BY_SOURCE[file]
      return `${pageOfAnchor.get(`${file}#${anchor}`) ?? PAGES_BY_SOURCE[file]}#${anchor}`
    }
    return path.posix.normalize(`../${url}`)
  }
  return html
    .replace(/\b(href|src)="([^"]*)"/g, (_all, attr, url) => `${attr}="${rewriteUrl(url)}"`)
    .replace(/\bsrcset="([^"]*)"/g, (_all, url) => `srcset="${rewriteUrl(url)}"`)
}

/** The first sentence of a chapter's prose, for its card on the start page. */
function leadOf(html) {
  const paragraph = /<p>(.*?)<\/p>/s.exec(html)?.[1] ?? ''
  const text = paragraph.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  const sentence = /^.*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text
  return sentence.length > 180 ? `${sentence.slice(0, 177).trimEnd()}…` : sentence
}

function collectPages() {
  const pages = []
  const [preamble, ...chapters] = splitChapters(read(path.join(DOCS, 'architecture.md')).replace(/^# .*\n/, ''))
  pages.push({ file: 'index.html', source: 'architecture.md', kind: 'start', number: null, title: 'Architecture', markdown: preamble.body })
  for (const chapter of chapters) {
    const match = /^(\d+)\.\s+(.*)$/.exec(chapter.title)
    if (!match) throw new Error(`architecture.md: chapter without a number: "${chapter.title}"`)
    const number = Number(match[1])
    pages.push({
      file: `${String(number).padStart(2, '0')}-${slugOf(match[2])}.html`,
      source: 'architecture.md',
      kind: 'chapter',
      number,
      title: match[2],
      // The chapter heading keeps its anchor, so `architecture.md#4-solution-strategy` finds the page.
      anchor: slugOf(chapter.title),
      markdown: chapter.body,
    })
  }
  const subsystems = read(path.join(DOCS, 'architecture-subsystems.md'))
  pages.push({
    file: 'subsystems.html',
    source: 'architecture-subsystems.md',
    kind: 'companion',
    number: null,
    title: 'Backend modules from the inside',
    markdown: subsystems.replace(/^# .*\n/, '').trim(),
  })
  return pages
}

function navigation(pages, current) {
  const item = (page) => {
    const label = page.kind === 'start' ? 'Overview' : page.title
    const number = page.number === null ? '' : `<span class="nav-number">${String(page.number).padStart(2, '0')}</span>`
    const active = page.file === current.file
    return `<li><a class="nav-item${active ? ' is-active' : ''}" href="${page.file}"${active ? ' aria-current="page"' : ''}>${number}<span>${escapeHtml(label)}</span></a></li>`
  }
  const chapters = pages.filter((page) => page.kind !== 'companion')
  const companions = pages.filter((page) => page.kind === 'companion')
  return `<nav class="nav" aria-label="Chapters">
      <p class="eyebrow">arc42</p>
      <ul>${chapters.map(item).join('')}</ul>
      <p class="eyebrow">Companion</p>
      <ul>${companions.map(item).join('')}</ul>
    </nav>`
}

function layout({ page, pages, body, asOf }) {
  const title = page.kind === 'start' ? 'SteuerEule — Architecture' : `${page.title} — SteuerEule Architecture`
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="../../images/steuereule-logo.svg">
  <link rel="stylesheet" href="assets/site.css">
</head>
<body>
  <a class="skip" href="#content">Skip to the content</a>
  <div class="shell">
    <aside class="rail">
      <a class="brand" href="index.html">
        <img src="../../images/steuereule-logo.svg" width="36" height="36" alt="">
        <span><strong>SteuerEule</strong><span class="eyebrow">Architecture</span></span>
      </a>
      <details class="menu" open>
        <summary>Chapters</summary>
        ${navigation(pages, page)}
      </details>
      <p class="rail-foot">As of ${escapeHtml(asOf)}<br>Built from <code>docs/architecture.md</code></p>
    </aside>
    <main id="content" class="content">
${body}
    </main>
  </div>
  <script src="assets/site.js"></script>
</body>
</html>
`
}

function chapterBody(page, pages, html, headings) {
  const index = pages.indexOf(page)
  const previous = pages[index - 1]
  const next = pages[index + 1]
  const sections = headings.filter((heading) => heading.depth === 2)
  const eyebrow = page.kind === 'chapter' ? `Chapter ${page.number} of ${pages.filter((p) => p.kind === 'chapter').length}` : 'Companion document'
  const step = (target, label) =>
    target
      ? `<a class="step step-${label}" href="${target.file}"><span class="eyebrow">${label === 'next' ? 'Next' : 'Previous'}</span><span>${escapeHtml(target.kind === 'start' ? 'Overview' : target.title)}</span></a>`
      : '<span></span>'
  return `      <header class="page-head">
        <p class="eyebrow">${eyebrow}</p>
        <h1${page.anchor ? ` id="${page.anchor}"` : ''}>${escapeHtml(page.title)}</h1>
        ${sections.length > 1 ? `<ul class="chips" aria-label="On this page">${sections.map((s) => `<li><a class="chip" href="#${s.id}">${s.text}</a></li>`).join('')}</ul>` : ''}
      </header>
      <article class="prose">
${html}
      </article>
      <nav class="steps" aria-label="Previous and next chapter">${step(previous, 'previous')}${step(next, 'next')}</nav>`
}

function startBody(page, pages, html, leads) {
  const cards = pages
    .filter((p) => p.kind !== 'start')
    .map(
      (p) => `<li><a class="card" href="${p.file}">
          <span class="eyebrow">${p.number === null ? 'Companion' : String(p.number).padStart(2, '0')}</span>
          <strong>${escapeHtml(p.title)}</strong>
          <span class="card-lead">${escapeHtml(leads.get(p.file) ?? '')}</span>
        </a></li>`,
    )
    .join('\n        ')
  return `      <header class="page-head hero">
        <p class="eyebrow">SteuerEule · arc42</p>
        <h1>Architecture</h1>
        <p class="lead">A pure tax core, use cases around it, the database and every SDK in named adapter files. Dependencies point inward, and two architecture tests check it on every run.</p>
      </header>
      <figure class="figure">
        <img src="../../images/architecture-hexagon.svg" alt="Ports and Adapters: the pure @steuereule/core in the centre, the application services around it, driving adapters on the left, driven adapters on the right. Every dependency points inward.">
      </figure>
      <article class="prose">
${html}
      </article>
      <h2 class="section-title">Chapters</h2>
      <ul class="cards">
        ${cards}
      </ul>`
}

function buildCss() {
  // The app's tokens, with the "dunkel" theme following the reader's system setting.
  const tokens = read(path.join(ROOT, 'packages/tokens/dist/tokens.css'))
  const dark = /\[data-theme="dunkel"\] \{([\s\S]*?)\n\}/.exec(tokens)
  if (!dark) throw new Error('packages/tokens/dist/tokens.css: no [data-theme="dunkel"] block found')
  const themed = tokens.replace(dark[0], `@media (prefers-color-scheme: dark) {\n  :root {${dark[1].replace(/\n/g, '\n  ')}\n  }\n}`)
  return `${themed}\n${read(path.join(TEMPLATE, 'site.css'))}`
}

function build() {
  const pages = collectPages()
  const asOf = /\*\*As of\*\* \| (\S+)/.exec(read(path.join(DOCS, 'architecture.md')))?.[1] ?? 'unknown'
  const rendered = pages.map((page) => ({ page, ...renderMarkdown(page.markdown) }))

  // Where each heading of the two documents lives now, by the anchor it has in the Markdown.
  const pageOfAnchor = new Map()
  for (const { page, headings } of rendered) {
    if (page.anchor) pageOfAnchor.set(`${page.source}#${page.anchor}`, page.file)
    for (const heading of headings) pageOfAnchor.set(`${page.source}#${heading.id}`, page.file)
  }

  const leads = new Map(rendered.map(({ page, html }) => [page.file, leadOf(html)]))
  const files = new Map()
  for (const { page, html, headings } of rendered) {
    const content = rewriteReferences(html, page, pageOfAnchor)
    const body = page.kind === 'start' ? startBody(page, pages, content, leads) : chapterBody(page, pages, content, headings)
    files.set(page.file, layout({ page, pages, body, asOf }))
  }
  files.set('assets/site.css', buildCss())
  files.set('assets/site.js', read(path.join(TEMPLATE, 'site.js')))
  return files
}

function existingFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? existingFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')]
  })
}

const files = build()
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
}
