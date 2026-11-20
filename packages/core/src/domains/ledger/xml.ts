/**
 * A small, strict XML reader for bank statements and our own generated files. It refuses DTDs and
 * entity declarations outright, so external entities and entity expansion attacks cannot happen, and
 * caps size and depth. Namespaces are kept as written (`qname`) and stripped (`name`).
 */

export interface XmlElement {
  readonly qname: string
  readonly name: string
  readonly attrs: Readonly<Record<string, string>>
  readonly children: readonly XmlElement[]
  readonly text: string
}

export class XmlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XmlError'
  }
}

const MAX_LENGTH = 50 * 1024 * 1024
const MAX_DEPTH = 64

const PREDEFINED: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decode(raw: string): string {
  return raw.replaceAll(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (match, ref: string) => {
    if (ref.startsWith('#x')) return String.fromCodePoint(Number.parseInt(ref.slice(2), 16))
    if (ref.startsWith('#')) return String.fromCodePoint(Number.parseInt(ref.slice(1), 10))
    const value = PREDEFINED[ref]
    if (value === undefined) throw new XmlError(`Unbekannte Entität ${match}`)
    return value
  })
}

const localName = (qname: string): string => qname.slice(qname.indexOf(':') + 1)

interface Building {
  qname: string
  attrs: Record<string, string>
  children: XmlElement[]
  text: string
}

export function parseXml(input: string): XmlElement {
  if (input.length > MAX_LENGTH) throw new XmlError('Datei zu groß')
  if (/<!DOCTYPE|<!ENTITY/i.test(input)) throw new XmlError('DTDs und Entitäten werden nicht gelesen')
  const stack: Building[] = []
  let root: XmlElement | null = null
  let i = 0
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  while (i < text.length) {
    const lt = text.indexOf('<', i)
    if (lt === -1) {
      if (text.slice(i).trim() !== '') throw new XmlError('Text außerhalb des Wurzelelements')
      break
    }
    if (lt > i) {
      const chunk = text.slice(i, lt)
      const top = stack.at(-1)
      if (top !== undefined) top.text += decode(chunk)
      else if (chunk.trim() !== '') throw new XmlError('Text außerhalb des Wurzelelements')
    }
    if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt)
      if (end === -1) throw new XmlError('Unvollständige Verarbeitungsanweisung')
      i = end + 2
    } else if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt)
      if (end === -1) throw new XmlError('Unvollständiger Kommentar')
      i = end + 3
    } else if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt)
      if (end === -1) throw new XmlError('Unvollständiger CDATA-Abschnitt')
      const top = stack.at(-1)
      if (top === undefined) throw new XmlError('CDATA außerhalb des Wurzelelements')
      top.text += text.slice(lt + 9, end)
      i = end + 3
    } else if (text.startsWith('</', lt)) {
      const end = text.indexOf('>', lt)
      if (end === -1) throw new XmlError('Unvollständiges End-Tag')
      const qname = text.slice(lt + 2, end).trim()
      const open = stack.pop()
      if (open?.qname !== qname) throw new XmlError(`End-Tag ${qname} passt nicht`)
      const element: XmlElement = { qname, name: localName(qname), attrs: open.attrs, children: open.children, text: open.text.trim() }
      const parent = stack.at(-1)
      if (parent === undefined) root = element
      else parent.children.push(element)
      i = end + 1
    } else {
      const end = findTagEnd(text, lt)
      const selfClosing = text[end - 1] === '/'
      const body = text.slice(lt + 1, selfClosing ? end - 1 : end)
      const nameMatch = /^[^\s/>]+/.exec(body)
      if (nameMatch === null) throw new XmlError('Element ohne Namen')
      const qname = nameMatch[0]
      const attrs: Record<string, string> = {}
      for (const [name, value] of parseAttributes(body.slice(qname.length))) attrs[name] = decode(value)
      if (root !== null) throw new XmlError('Mehr als ein Wurzelelement')
      if (selfClosing) {
        const element: XmlElement = { qname, name: localName(qname), attrs, children: [], text: '' }
        const parent = stack.at(-1)
        if (parent === undefined) root = element
        else parent.children.push(element)
      } else {
        if (stack.length >= MAX_DEPTH) throw new XmlError('Zu tief verschachtelt')
        stack.push({ qname, attrs, children: [], text: '' })
      }
      i = end + 1
    }
  }
  if (stack.length > 0 || root === null) throw new XmlError('Unvollständiges Dokument')
  return root
}

function findTagEnd(text: string, from: number): number {
  let quote: string | null = null
  for (let j = from + 1; j < text.length; j++) {
    const c = text[j]!
    if (quote !== null) {
      if (c === quote) quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '>') return j
  }
  throw new XmlError('Unvollständiges Tag')
}

export function childrenNamed(element: XmlElement, name: string): readonly XmlElement[] {
  return element.children.filter((c) => c.name === name)
}

/** Follows a path of local names (`Amt`, `NtryDtls/TxDtls`), taking the first match at each step. */
export function at(element: XmlElement | null, path: string): XmlElement | null {
  let current = element
  for (const step of path.split('/')) {
    if (current === null) return null
    current = current.children.find((c) => c.name === step) ?? null
  }
  return current
}

export function textAt(element: XmlElement | null, path: string): string | null {
  const found = at(element, path)
  return found === null ? null : found.text
}

/**
 * The attributes of a start tag (`name="value"` or `name='value'`), read in one pass: a bank file is
 * user input, and a backtracking pattern over a long tag would let one upload stall the parser.
 */
function parseAttributes(source: string): [string, string][] {
  const out: [string, string][] = []
  let i = 0
  const isSpace = (c: string | undefined) => c === ' ' || c === '\n' || c === '\r' || c === '\t'
  while (i < source.length) {
    while (isSpace(source[i])) i++
    const nameStart = i
    while (i < source.length && !isSpace(source[i]) && source[i] !== '=') i++
    const name = source.slice(nameStart, i)
    while (isSpace(source[i])) i++
    if (name === '' || source[i] !== '=') break
    i++
    while (isSpace(source[i])) i++
    const quote = source[i]
    if (quote !== '"' && quote !== "'") break
    const end = source.indexOf(quote, i + 1)
    if (end < 0) break
    out.push([name, source.slice(i + 1, end)])
    i = end + 1
  }
  return out
}
