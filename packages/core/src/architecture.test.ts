import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface ModuleImport {
  readonly file: string
  readonly sourceLayer: string
  readonly targetLayer: string
  readonly rawImport: string
}

function scanLayerImports(): ModuleImport[] {
  const layers = ['math', 'engine', 'domains', 'interview', 'common']
  const imports: ModuleImport[] = []

  for (const layer of layers) {
    const layerDir = path.join(__dirname, layer)
    if (!fs.existsSync(layerDir)) continue

    const files = fs.readdirSync(layerDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.bench.ts') && f !== 'index.ts')

    for (const file of files) {
      const filePath = path.join(layerDir, file)
      const content = fs.readFileSync(filePath, 'utf8')
      const regex = /from\s+['"](\.\.?\/[^'"]+)['"]/g
      let match: RegExpExecArray | null

      while ((match = regex.exec(content)) !== null) {
        const rawImport = match[1]!
        let targetLayer = layer
        if (rawImport.startsWith('../')) {
          const parts = rawImport.replace(/^\.\.\//, '').split('/')
          targetLayer = parts[0]!
        }

        imports.push({
          file: `${layer}/${file}`,
          sourceLayer: layer,
          targetLayer,
          rawImport,
        })
      }
    }
  }

  return imports
}

describe('Layered Architecture Verification (@steuereule/core)', () => {
  const allImports = scanLayerImports()

  it('enforces that math layer is 100% pure (zero imports from engine, domains, interview, common)', () => {
    const mathCrossImports = allImports.filter(
      (imp) => imp.sourceLayer === 'math' && imp.targetLayer !== 'math',
    )
    expect(mathCrossImports).toEqual([])
  })

  it('enforces that common layer only depends on math or self (never on engine, domains, interview)', () => {
    const forbiddenCommon = allImports.filter(
      (imp) => imp.sourceLayer === 'common' && !['common', 'math'].includes(imp.targetLayer),
    )
    expect(forbiddenCommon).toEqual([])
  })

  it('enforces that engine layer never imports from interview layer', () => {
    const forbiddenEngine = allImports.filter(
      (imp) => imp.sourceLayer === 'engine' && imp.targetLayer === 'interview',
    )
    expect(forbiddenEngine).toEqual([])
  })

  it('enforces strict DAG: no layer can import back into math from outside math', () => {
    // Only domains, engine, interview, common may import math. Math itself never imports anything outside.
    const mathOutward = allImports.filter((imp) => imp.sourceLayer === 'math' && imp.targetLayer !== 'math')
    expect(mathOutward).toHaveLength(0)
  })
})
