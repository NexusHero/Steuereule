// WEB-40 lock: a navigator without the guarded layout would remove a route with a pending save unseen (the defect
// of the masks outside the cockpit stack). Every `<X.Navigator` in the app names guardedRoute or guardedStackRoute.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')
const APP = join(SRC, '..', 'App.tsx')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full) ? [full] : []
  })
}

/** Each opening `<Name.Navigator …>` tag with its attributes, up to the closing `>` of the tag. */
export function navigatorTags(text: string): string[] {
  return [...text.matchAll(/<\w+\.Navigator\b([\s\S]*?)>\s*\n/g)].map((match) => match[0])
}

describe('every navigator guards its routes (WEB-40)', () => {
  const files = [...sourceFiles(SRC), APP]
  const tags = files.flatMap((file) => navigatorTags(readFileSync(file, 'utf8')).map((tag) => ({ file: relative(SRC, file), tag })))

  it('finds the navigators', () => {
    expect(tags.length).toBeGreaterThanOrEqual(5)
  })

  it('each one has screenLayout={guardedRoute} or {guardedStackRoute}', () => {
    const unguarded = tags.filter(({ tag }) => !/screenLayout=\{guarded(?:Stack)?Route\}/.test(tag)).map(({ file }) => file)
    expect(unguarded).toEqual([])
  })

  it('the rule sees a navigator without it', () => {
    expect(navigatorTags('<Stack.Navigator initialRouteName="A">\n').every((tag) => /screenLayout=\{guarded/.test(tag))).toBe(false)
  })
})
