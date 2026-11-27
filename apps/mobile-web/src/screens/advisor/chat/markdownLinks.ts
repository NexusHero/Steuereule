import { ADVISOR_LEGAL_SOURCES, type OwlSourceId } from '@steuereule/core'

/** Link scheme the chat uses internally for a verified legal source chip. */
// Letters only: react-native-marked treats `^[a-z]+:` as absolute and prefixes anything else.
export const SOURCE_LINK_SCHEME = 'eulequelle:'

const SOURCE_TAG = /\[(estg-[a-z0-9-]+|ao-355)\](?!\()/g
/** A code span or fenced block: a run of backticks, the text, the same run again. */
const CODE = /(`+)([\s\S]*?)\1/g
/** A code span that holds one citation and nothing else. */
const CITATION_ONLY = /^\s*\[(estg-[a-z0-9-]+|ao-355)\]\s*$/

/**
 * Rewrites the citations of `content`. Markdown shows a code span as it is written, so a link put into one
 * would appear as its source text: code is left alone, except a span that is nothing but a citation, which
 * some models write for an id. That span becomes the citation itself.
 */
function replaceCitations(content: string, render: (id: OwlSourceId) => string): string {
  const cite = (whole: string, id: string): string => (ADVISOR_LEGAL_SOURCES[id as OwlSourceId] ? render(id as OwlSourceId) : whole)
  const outsideCode = (text: string): string => text.replace(SOURCE_TAG, cite)
  let result = ''
  let rest = 0
  for (const code of content.matchAll(CODE)) {
    result += outsideCode(content.slice(rest, code.index))
    const only = CITATION_ONLY.exec(code[2] ?? '')
    result += only ? cite(code[0], only[1] ?? '') : code[0]
    rest = code.index + code[0].length
  }
  return result + outsideCode(content.slice(rest))
}

/**
 * Turns the model's `[estg-9-1]` citations into Markdown links on our own scheme, so the renderer
 * can draw them as law chips. Unknown ids stay as they are.
 */
export function linkLegalSources(content: string): string {
  return replaceCitations(content, (id) => `[${ADVISOR_LEGAL_SOURCES[id].paragraph}](${SOURCE_LINK_SCHEME}${id})`)
}

/** The legal source a chip link points at, or null. */
export function sourceFromLink(href: string): OwlSourceId | null {
  if (!href.startsWith(SOURCE_LINK_SCHEME)) return null
  const id = href.slice(SOURCE_LINK_SCHEME.length) as OwlSourceId
  return ADVISOR_LEGAL_SOURCES[id] ? id : null
}

/** Official sources the app itself cites; a link to one of these opens on tap. Subdomains count. */
const TRUSTED_HOSTS: readonly string[] = [
  'gesetze-im-internet.de',
  'bundesfinanzministerium.de',
  'bmf-steuerrechner.de',
  'formulare-bfinv.de',
  'elster.de',
  'bzst.de',
  'bundesbank.de',
]

/** Longest query + fragment a model link may carry; more could be smuggled data, not a page address. */
export const MAX_LINK_QUERY_LENGTH = 200

export type LinkClass =
  /** Not a link a user may follow: rendered as plain text. */
  | { readonly kind: 'plain' }
  /** An official source: opens on tap. */
  | { readonly kind: 'trusted'; readonly url: string; readonly host: string }
  /** Any other destination: opens only after the user saw where it goes and confirmed. */
  | { readonly kind: 'confirm'; readonly url: string; readonly host: string }

function isTrustedHost(host: string): boolean {
  return TRUSTED_HOSTS.some((trusted) => host === trusted || host.endsWith(`.${trusted}`))
}

/**
 * Model output is untrusted, and with personal-data consent the model sees real data: a link it
 * writes could carry some of it out. So only http(s) and mailto links are links at all; one with
 * credentials in the address or a long query is text; and only an official source opens without
 * the user first confirming the destination host. Nothing ever opens by itself.
 */
export function classifyLink(href: string): LinkClass {
  let url: URL
  try {
    url = new URL(href.trim())
  } catch {
    return { kind: 'plain' }
  }
  if (url.username !== '' || url.password !== '') return { kind: 'plain' }
  if (url.search.length + url.hash.length > MAX_LINK_QUERY_LENGTH) return { kind: 'plain' }
  if (url.protocol === 'mailto:') {
    return url.pathname === '' ? { kind: 'plain' } : { kind: 'confirm', url: url.toString(), host: url.pathname }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'plain' }
  const host = url.hostname.replace(/\.$/, '')
  if (host === '') return { kind: 'plain' }
  const kind = url.protocol === 'https:' && isTrustedHost(host) ? 'trusted' : 'confirm'
  return { kind, url: url.toString(), host: url.host }
}

/** What „Kopieren“ puts on the clipboard: the Markdown text, citations spelled out. */
export function plainTextForCopy(content: string): string {
  return replaceCitations(content, (id) => `(${ADVISOR_LEGAL_SOURCES[id].paragraph})`)
}
