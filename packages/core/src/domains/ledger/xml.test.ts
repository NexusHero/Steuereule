import { describe, expect, it } from 'vitest'
import { at, childrenNamed, parseXml, textAt, XmlError } from './xml'

// The strict XML reader behind CAMT import and the tests of our own XML files.

describe('parseXml', () => {
  it('reads elements, attributes, namespaces, entities, CDATA and comments', () => {
    const root = parseXml('﻿<?xml version="1.0"?><!-- c --><a:Doc xmlns:a="urn:x" k=\'v &amp; w\'><a:B>x &lt; y &#65;&#x42;</a:B><C/><C><![CDATA[<raw>]]></C></a:Doc>')
    expect(root).toMatchObject({ qname: 'a:Doc', name: 'Doc', attrs: { 'xmlns:a': 'urn:x', k: 'v & w' } })
    expect(textAt(root, 'B')).toBe('x < y AB')
    expect(childrenNamed(root, 'C').map((c) => c.text)).toEqual(['', '<raw>'])
    expect(at(root, 'B/Missing')).toBeNull()
    expect(at(null, 'B')).toBeNull()
  })

  it('refuses unsafe or broken documents', () => {
    for (const bad of [
      '<!DOCTYPE x><x/>',
      '<x>&ext;</x>',
      '<x><y></x>',
      '<x>',
      '<x/><y/>',
      'text<x/>',
      '<x/>tail',
      '<x><!-- open</x>',
      '<?xml',
      '<x><![CDATA[open</x>',
      '<x a="1',
      '<x></',
      '< />',
      '<![CDATA[x]]>',
    ]) expect(() => parseXml(bad), bad).toThrow(XmlError)
  })

  it('caps nesting depth', () => {
    expect(() => parseXml('<a>'.repeat(70) + '</a>'.repeat(70))).toThrow(/verschachtelt/)
  })
})
