// The collaborators of the MCP tools are gathered by one provider, each from the token of its name, and every
// token is provided where `McpModule` can see it: a wiring regression fails here, not as a tool that quietly
// lost a collaborator.
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { InjectionToken, Provider } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { describe, expect, it } from 'vitest'
import { McpRateLimiter } from '../src/mcp/mcp-rate-limit.js'
import { MCP_DEPS, type McpDeps } from '../src/mcp/mcp-session.js'
import { MCP_DEP_TOKENS, McpModule, mcpDepsProvider } from '../src/mcp/mcp.module.js'
import { McpService } from '../src/mcp/mcp.service.js'

const names = Object.keys(MCP_DEP_TOKENS) as (keyof McpDeps)[]
const tokenOf = (provider: Provider): InjectionToken => (typeof provider === 'function' ? provider : provider.provide)

/** What a module lets its importers see, through modules it re-exports. */
function exportedBy(module: object, seen = new Set<object>()): InjectionToken[] {
  if (seen.has(module)) return []
  seen.add(module)
  const exported = (Reflect.getMetadata('exports', module) ?? []) as (InjectionToken | object)[]
  return exported.flatMap((entry) => (typeof entry === 'function' && Reflect.hasMetadata('imports', entry) ? exportedBy(entry, seen) : [entry as InjectionToken]))
}

describe('McpModule wiring', () => {
  it('McpService is built from one McpDeps, each field the instance behind the token of its name', async () => {
    const instances = new Map(names.map((name) => [name, { collaborator: name }]))
    const module = await Test.createTestingModule({
      providers: [McpService, mcpDepsProvider, { provide: McpRateLimiter, useValue: new McpRateLimiter() }, ...names.map((name) => ({ provide: MCP_DEP_TOKENS[name], useValue: instances.get(name) }))],
    }).compile()

    const deps = module.get<McpDeps>(MCP_DEPS)
    expect(Object.keys(deps).sort()).toEqual([...names].sort())
    for (const name of names) expect(deps[name], name).toBe(instances.get(name))
    expect(module.get(McpService)).toBeInstanceOf(McpService)
  })

  it('every collaborator and the limiter are provided by McpModule or exported by a module it imports', () => {
    const imports = (Reflect.getMetadata('imports', McpModule) ?? []) as object[]
    const own = ((Reflect.getMetadata('providers', McpModule) ?? []) as Provider[]).map(tokenOf)
    const visible = new Set<InjectionToken>([...own, ...imports.flatMap((module) => exportedBy(module))])
    const needed = [...names.map((name) => MCP_DEP_TOKENS[name]), McpRateLimiter]
    expect(needed.filter((token) => !visible.has(token)).map(String)).toEqual([])
  })

  it('no class of the MCP module takes an optional dependency', () => {
    const directory = fileURLToPath(new URL('../src/mcp/', import.meta.url))
    const files = readdirSync(directory, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(10)
    expect(files.filter((file) => readFileSync(`${directory}${file}`, 'utf8').includes('@Optional('))).toEqual([])
  })
})
