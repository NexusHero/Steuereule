// The tool definitions the model sees are part of the cached prompt prefix: any byte that changes
// in a name, description or argument schema invalidates the provider's prompt cache. This pins them.
import { convertToOpenAITool } from '@langchain/core/utils/function_calling'
import { describe, expect, it } from 'vitest'
import { buildToolSchemas } from '../src/ki/advisor-tools.js'

describe('advisor tool schemas', () => {
  it('stay byte-identical to the committed snapshot', async () => {
    const serialized = JSON.stringify(buildToolSchemas().map((schema) => convertToOpenAITool(schema)), null, 2)
    await expect(serialized).toMatchFileSnapshot('./__snapshots__/advisor-tool-schemas.json')
  })
})
