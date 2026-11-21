import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ADR-0052 amendment 4: an assistant's OAuth token opens the MCP endpoint and nothing else. The guard
// refuses it wherever the controller is not marked; this test keeps the mark from spreading unnoticed.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : entry.name.endsWith('.ts') ? [join(dir, entry.name)] : []))
}

describe('the assistant token is accepted on the MCP controller only', () => {
  it('no other file under src uses @AcceptsAssistantToken()', () => {
    const src = join(import.meta.dirname, '..', 'src')
    const marked = sourceFiles(src)
      .filter((file) => /^@AcceptsAssistantToken\(\)/m.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(src.length + 1))
    expect(marked).toEqual(['mcp/mcp.controller.ts'])
  })
})
