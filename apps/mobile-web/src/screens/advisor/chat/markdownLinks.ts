import { ADVISOR_LEGAL_SOURCES, type OwlSourceId } from '@steuereule/core'

/** Link scheme the chat uses internally for a verified legal source chip. */
// Letters only: react-native-marked treats `^[a-z]+:` as absolute and prefixes anything else.
export const SOURCE_LINK_SCHEME = 'eulequelle:'

const SOURCE_TAG = /\[(estg-[a-z0-9-]+|ao-355)\](?!\()/g

/**
 * Turns the model's `[estg-9-1]` citations into Markdown links on our own scheme, so the renderer
 * can draw them as law chips. Unknown ids stay as they are.
 */
export function linkLegalSources(content: string): string {
  return content.replace(SOURCE_TAG, (whole, id: string) => {
    const source = ADVISOR_LEGAL_SOURCES[id as OwlSourceId]
    return source ? `[${source.paragraph}](${SOURCE_LINK_SCHEME}${id})` : whole
  })
}

/** The legal source a chip link points at, or null. */
export function sourceFromLink(href: string): OwlSourceId | null {
  if (!href.startsWith(SOURCE_LINK_SCHEME)) return null
  const id = href.slice(SOURCE_LINK_SCHEME.length) as OwlSourceId
  return ADVISOR_LEGAL_SOURCES[id] ? id : null
}

/**
 * Only http(s) and mailto links may open; anything else (javascript:, data:, file:, intent: …)
 * renders as plain text. Model output is untrusted.
 */
export function safeLinkTarget(href: string): string | null {
  let url: URL
  try {
    url = new URL(href.trim())
  } catch {
    return null
  }
  return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:' ? url.toString() : null
}

/** What „Kopieren“ puts on the clipboard: the Markdown text, citations spelled out. */
export function plainTextForCopy(content: string): string {
  return content.replace(SOURCE_TAG, (whole, id: string) => {
    const source = ADVISOR_LEGAL_SOURCES[id as OwlSourceId]
    return source ? `(${source.paragraph})` : whole
  })
}
