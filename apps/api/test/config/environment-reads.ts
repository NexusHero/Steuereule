import { parseSync } from '@swc/core'

/**
 * Finds every environment variable a set of TypeScript sources reads, from their syntax trees.
 *
 * An environment object is `process.env` or anything bound to one: a binding named `env`, one typed
 * `NodeJS.ProcessEnv`, one initialised from an environment object, and a parameter an environment object is
 * passed to. A read is
 *
 *   - `env.NAME`, `env['NAME']`, `'NAME' in env`, `const { NAME } = env`;
 *   - `env[expression]`, where the expression resolves to names: a literal, a constant, a template of
 *     those, the element of a list of literals (`for … of`, `.filter((name) => …)`), or a parameter of a named
 *     function. In the last case the function is a helper and every call of it is a read of the name it passes
 *     (`positiveIntFromEnv('UPLOAD_MAX_IN_FLIGHT', 4, env)`).
 *
 * What does not resolve is reported as `unresolved`, never dropped: a name computed at run time, and anything
 * that enumerates the whole environment (spread, `Object.keys`, `for … in`).
 *
 * Limits: there is no type information. A helper is matched by its name (in its own file, or everywhere when
 * it is exported), and an environment object handed on under a name this module does not see as one (a
 * property of an untyped object, say) is not followed.
 */

export interface SourceFile {
  /** Path as it should appear in the result. */
  readonly file: string
  readonly text: string
}

export interface EnvironmentRead {
  readonly file: string
  readonly name: string
}

export interface EnvironmentReads {
  readonly reads: readonly EnvironmentRead[]
  /** `file: description` of every place that reads the environment under a name that could not be determined. */
  readonly unresolved: readonly string[]
}

interface Node {
  readonly type: string
  readonly [key: string]: unknown
}

interface Helper {
  readonly name: string
  readonly index: number
  /** The file that declares it; undefined for an exported helper, which any file may call. */
  readonly file: string | undefined
}

type Resolution = { readonly names: readonly string[] } | { readonly helper: Helper } | { readonly unresolved: string }

const LIST_CALLBACK_METHODS = new Set(['filter', 'map', 'forEach', 'some', 'every', 'find', 'flatMap'])
const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ClassMethod', 'PrivateMethod', 'Constructor', 'MethodProperty'])
const WRAPPER_TYPES = new Set(['ParenthesisExpression', 'TsAsExpression', 'TsNonNullExpression', 'TsSatisfiesExpression', 'TsConstAssertion', 'TsTypeAssertion'])

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'
}

/** The nodes directly below a node, looking through the untyped holders swc uses (arguments, a method's function). */
function children(node: Node): Node[] {
  const found: Node[] = []
  const collect = (value: unknown, key: string): void => {
    if (key === 'span' || typeof value !== 'object' || value === null) return
    if (isNode(value)) found.push(value)
    else if (Array.isArray(value)) for (const item of value) collect(item, '')
    else for (const [innerKey, inner] of Object.entries(value)) collect(inner, innerKey)
  }
  for (const [key, value] of Object.entries(node)) collect(value, key)
  return found
}

function unwrap(node: Node): Node {
  let current = node
  while (WRAPPER_TYPES.has(current.type) && isNode(current.expression)) current = current.expression
  return current
}

function identifierName(node: unknown): string | undefined {
  return isNode(node) && node.type === 'Identifier' && typeof node.value === 'string' ? node.value : undefined
}

function stringValue(node: Node): string | undefined {
  if (node.type === 'StringLiteral' && typeof node.value === 'string') return node.value
  if (node.type === 'TemplateLiteral' && Array.isArray(node.expressions) && node.expressions.length === 0) {
    const quasi = (node.quasis as { cooked?: string }[])[0]
    return quasi?.cooked
  }
  return undefined
}

/** A short rendering of an expression for the `unresolved` report. */
function describe(node: Node): string {
  const inner = unwrap(node)
  const name = identifierName(inner)
  if (name !== undefined) return name
  if (inner.type === 'ThisExpression') return 'this'
  const literal = stringValue(inner)
  if (literal !== undefined) return `'${literal}'`
  if (inner.type === 'TemplateLiteral') return '`…${…}…`'
  if (inner.type === 'MemberExpression' && isNode(inner.object) && isNode(inner.property)) {
    const property = identifierName(inner.property)
    return property !== undefined ? `${describe(inner.object)}.${property}` : `${describe(inner.object)}[…]`
  }
  return `<${inner.type}>`
}

/** The identifier a parameter or variable pattern binds, looking through a default value and a parameter property. */
function boundName(pattern: unknown): string | undefined {
  if (!isNode(pattern)) return undefined
  if (pattern.type === 'Identifier') return identifierName(pattern)
  if (pattern.type === 'AssignmentPattern') return boundName(pattern.left)
  if (pattern.type === 'Parameter') return boundName(pattern.pat)
  if (pattern.type === 'TsParameterProperty') return boundName(pattern.param)
  return undefined
}

/**
 * A type that is an environment object: `NodeJS.ProcessEnv`, a union with it (`ProcessEnv | undefined`), or a
 * generic over it (`Readonly<ProcessEnv>`, `Pick<ProcessEnv, …>`). An object type with an environment among its
 * properties (`{ env?: NodeJS.ProcessEnv }`) is not one; its property is matched by name instead.
 */
function mentionsProcessEnv(node: unknown): boolean {
  if (!isNode(node)) return false
  if (node.type === 'TsTypeAnnotation') return mentionsProcessEnv(node.typeAnnotation)
  if (node.type === 'TsUnionType' || node.type === 'TsIntersectionType') return Array.isArray(node.types) && node.types.some(mentionsProcessEnv)
  if (node.type === 'TsParenthesizedType' || node.type === 'TsTypeOperator') return mentionsProcessEnv(node.typeAnnotation)
  if (node.type !== 'TsTypeReference' || !isNode(node.typeName)) return false
  const typeName = node.typeName.type === 'TsQualifiedName' ? identifierName(node.typeName.right) : identifierName(node.typeName)
  if (typeName === 'ProcessEnv') return true
  const params = isNode(node.typeParams) && Array.isArray(node.typeParams.params) ? node.typeParams.params : []
  return params.some(mentionsProcessEnv)
}

class ParsedFile {
  readonly root: Node
  readonly parents = new Map<Node, Node>()
  readonly nodes: Node[] = []
  /** Names that stand for an environment object in this file. */
  readonly envNames = new Set<string>(['env'])

  constructor(readonly file: string, text: string) {
    this.root = parseSync(text, { syntax: 'typescript', tsx: file.endsWith('.tsx'), decorators: true, target: 'es2022' }) as unknown as Node
    const visit = (node: Node): void => {
      this.nodes.push(node)
      for (const child of children(node)) {
        this.parents.set(child, node)
        visit(child)
      }
    }
    visit(this.root)
  }

  isEnvObject(node: Node): boolean {
    const inner = unwrap(node)
    const name = identifierName(inner)
    if (name !== undefined) return this.envNames.has(name)
    if (inner.type !== 'MemberExpression') return false
    const property = identifierName(inner.property)
    return property !== undefined && this.envNames.has(property)
  }

  /** An environment object, or a choice between expressions of which one is (`options.env ?? process.env`). */
  yieldsEnvObject(node: unknown): boolean {
    if (!isNode(node)) return false
    const inner = unwrap(node)
    if (this.isEnvObject(inner)) return true
    if (inner.type === 'BinaryExpression' && (inner.operator === '??' || inner.operator === '||')) return this.yieldsEnvObject(inner.left) || this.yieldsEnvObject(inner.right)
    if (inner.type === 'ConditionalExpression') return this.yieldsEnvObject(inner.consequent) || this.yieldsEnvObject(inner.alternate)
    return false
  }

  /** Adds the names bound to an environment object by type or by value; true when one was new. */
  collectEnvNames(): boolean {
    const before = this.envNames.size
    const add = (name: string | undefined): void => {
      if (name !== undefined) this.envNames.add(name)
    }
    for (const node of this.nodes) {
      if (node.type === 'Identifier' && mentionsProcessEnv(node.typeAnnotation)) add(identifierName(node))
      if (node.type === 'VariableDeclarator' && this.yieldsEnvObject(node.init)) add(boundName(node.id))
      if (node.type === 'AssignmentPattern' && this.yieldsEnvObject(node.right)) add(boundName(node.left))
      if (node.type === 'ClassProperty' && (mentionsProcessEnv(node.typeAnnotation) || this.yieldsEnvObject(node.value))) add(identifierName(node.key))
      if (node.type === 'TsPropertySignature' && mentionsProcessEnv(node.typeAnnotation)) add(identifierName(node.key))
      if (node.type === 'AssignmentExpression' && this.yieldsEnvObject(node.right) && isNode(node.left)) {
        const target = unwrap(node.left)
        add(target.type === 'MemberExpression' ? identifierName(target.property) : identifierName(target))
      }
    }
    return this.envNames.size > before
  }

  params(fn: Node): unknown[] {
    const own = Array.isArray(fn.params) ? fn.params : undefined
    if (own) return own
    return isNode(fn.function) && Array.isArray(fn.function.params) ? fn.function.params : []
  }

  /** The name a function can be called by, and whether another file can call it. */
  functionName(fn: Node): { name: string; exported: boolean } | undefined {
    const parent = this.parents.get(fn)
    if (fn.type === 'FunctionDeclaration') {
      const name = identifierName(fn.identifier)
      if (name === undefined) return undefined
      return { name, exported: parent?.type === 'ExportDeclaration' || parent?.type === 'ExportDefaultDeclaration' }
    }
    if (fn.type === 'ClassMethod' || fn.type === 'MethodProperty') {
      const name = identifierName(fn.key)
      return name === undefined ? undefined : { name, exported: false }
    }
    if (parent?.type === 'VariableDeclarator' && parent.init === fn) {
      const name = boundName(parent.id)
      if (name === undefined) return undefined
      const statement = this.parents.get(this.parents.get(parent) ?? parent)
      return { name, exported: statement?.type === 'ExportDeclaration' }
    }
    return undefined
  }

  /** The literal strings of a list: an array literal, or a constant bound to one. */
  listOf(node: Node, lists: Constants<readonly string[]>): readonly string[] | undefined {
    const inner = unwrap(node)
    if (inner.type === 'ArrayExpression' && Array.isArray(inner.elements)) {
      const values = inner.elements.map((element: unknown) => {
        const expression = (element as { spread?: unknown; expression?: unknown } | null)?.expression
        const spread = (element as { spread?: unknown } | null)?.spread
        return isNode(expression) && !spread ? stringValue(unwrap(expression)) : undefined
      })
      return values.every((value): value is string => value !== undefined) ? values : undefined
    }
    const name = identifierName(inner)
    return name === undefined ? undefined : lists(this, name)
  }

  /** The names an expression used as an environment variable name can take. */
  resolve(expression: Node, lists: Constants<readonly string[]>, constants: Constants<readonly string[]>): Resolution {
    const inner = unwrap(expression)
    const literal = stringValue(inner)
    if (literal !== undefined) return { names: [literal] }

    if (inner.type === 'TemplateLiteral' && Array.isArray(inner.expressions) && Array.isArray(inner.quasis)) {
      let names = [(inner.quasis[0] as { cooked?: string }).cooked ?? '']
      for (const [index, part] of (inner.expressions as Node[]).entries()) {
        const resolved = this.resolve(part, lists, constants)
        if (!('names' in resolved)) return { unresolved: describe(inner) }
        const tail = (inner.quasis[index + 1] as { cooked?: string }).cooked ?? ''
        names = names.flatMap((head) => resolved.names.map((middle) => `${head}${middle}${tail}`))
      }
      return { names }
    }

    const name = identifierName(inner)
    if (name === undefined) return { unresolved: describe(inner) }

    for (let scope = this.parents.get(inner); scope !== undefined; scope = this.parents.get(scope)) {
      if (scope.type === 'ForOfStatement' && isNode(scope.left) && isNode(scope.right)) {
        const declared = scope.left.type === 'VariableDeclaration' ? boundName((scope.left.declarations as Node[])[0]?.id) : boundName(scope.left)
        if (declared !== name) continue
        const names = this.listOf(scope.right, lists)
        return names ? { names } : { unresolved: `${name} of ${describe(scope.right)}` }
      }
      if (!FUNCTION_TYPES.has(scope.type)) continue
      const index = this.params(scope).findIndex((param) => boundName(param) === name)
      if (index === -1) continue
      const call = this.parents.get(scope)
      if (call?.type === 'CallExpression' && index === 0 && isNode(call.callee)) {
        const callee = unwrap(call.callee)
        const method = callee.type === 'MemberExpression' ? identifierName(callee.property) : undefined
        if (method !== undefined && LIST_CALLBACK_METHODS.has(method) && isNode(callee.object)) {
          const names = this.listOf(callee.object, lists)
          return names ? { names } : { unresolved: `${name} of ${describe(callee.object)}` }
        }
      }
      const named = this.functionName(scope)
      return named ? { helper: { name: named.name, index, file: named.exported ? undefined : this.file } } : { unresolved: `${name}, a parameter of an unnamed function` }
    }

    const values = constants(this, name)
    return values !== undefined ? { names: values } : { unresolved: name }
  }
}

/** Looks a constant up by name: the file's own, or for a name the file does not declare (an import) every file's. */
type Constants<T> = (parsed: ParsedFile, name: string) => T | undefined

interface FileConstants {
  readonly declared: Set<string>
  readonly lists: Map<string, readonly string[]>
  readonly strings: Map<string, readonly string[]>
}

function constantsOf(parsed: ParsedFile): FileConstants {
  const found: FileConstants = { declared: new Set(), lists: new Map(), strings: new Map() }
  for (const node of parsed.nodes) {
    if (node.type !== 'VariableDeclarator') continue
    const name = boundName(node.id)
    if (name === undefined) continue
    found.declared.add(name)
    if (!isNode(node.init)) continue
    const init = unwrap(node.init)
    const literal = stringValue(init)
    if (literal !== undefined) found.strings.set(name, [...(found.strings.get(name) ?? []), literal])
    const list = init.type === 'ArrayExpression' ? parsed.listOf(init, () => undefined) : undefined
    if (list) found.lists.set(name, [...(found.lists.get(name) ?? []), ...list])
  }
  return found
}

export function findEnvironmentReads(sources: readonly SourceFile[]): EnvironmentReads {
  const files = sources.map((source) => new ParsedFile(source.file, source.text))
  const reads: EnvironmentRead[] = []
  const unresolved = new Set<string>()

  const perFile = new Map(files.map((parsed) => [parsed, constantsOf(parsed)]))
  const lookup = (kind: 'lists' | 'strings'): Constants<readonly string[]> => (parsed, name) => {
    const own = perFile.get(parsed)
    if (own?.declared.has(name)) return own[kind].get(name)
    const everywhere = [...perFile.values()].flatMap((entry) => entry[kind].get(name) ?? [])
    return everywhere.length > 0 ? everywhere : undefined
  }
  const lists = lookup('lists')
  const constants = lookup('strings')

  // Environment objects: by type and value in each file, then through the parameters they are passed to.
  let grew = true
  while (grew) {
    grew = false
    for (const parsed of files) while (parsed.collectEnvNames()) grew = true
    const passed = new Map<string, Set<number>>()
    for (const parsed of files) {
      for (const node of parsed.nodes) {
        if (node.type !== 'CallExpression' && node.type !== 'NewExpression') continue
        const callee = isNode(node.callee) ? unwrap(node.callee) : undefined
        const name = callee === undefined ? undefined : callee.type === 'MemberExpression' ? identifierName(callee.property) : identifierName(callee)
        if (name === undefined || !Array.isArray(node.arguments)) continue
        node.arguments.forEach((argument: { expression?: unknown }, index: number) => {
          if (!parsed.yieldsEnvObject(argument.expression)) return
          passed.set(name, (passed.get(name) ?? new Set()).add(index))
        })
      }
    }
    for (const parsed of files) {
      for (const node of parsed.nodes) {
        if (!FUNCTION_TYPES.has(node.type)) continue
        const named = node.type === 'Constructor' ? classNameOf(parsed, node) : parsed.functionName(node)?.name
        const indexes = named === undefined ? undefined : passed.get(named)
        if (!indexes) continue
        for (const index of indexes) {
          const bound = boundName(parsed.params(node)[index])
          if (bound !== undefined && !parsed.envNames.has(bound)) {
            parsed.envNames.add(bound)
            grew = true
          }
        }
      }
    }
  }

  const helpers: Helper[] = []
  const record = (parsed: ParsedFile, resolution: Resolution, where: string): void => {
    if ('names' in resolution) for (const name of resolution.names) reads.push({ file: parsed.file, name })
    else if ('unresolved' in resolution) unresolved.add(`${parsed.file}: ${where.replace('#', resolution.unresolved)}`)
    else if (!helpers.some((helper) => helper.name === resolution.helper.name && helper.index === resolution.helper.index && helper.file === resolution.helper.file)) {
      helpers.push(resolution.helper)
    }
  }

  for (const parsed of files) {
    for (const node of parsed.nodes) {
      if (node.type === 'MemberExpression' && isNode(node.object) && isNode(node.property) && parsed.yieldsEnvObject(node.object)) {
        const property = identifierName(node.property)
        if (property !== undefined) reads.push({ file: parsed.file, name: property })
        else if (node.property.type === 'Computed' && isNode(node.property.expression)) record(parsed, parsed.resolve(node.property.expression, lists, constants), `${describe(node.object)}[#]`)
        else unresolved.add(`${parsed.file}: ${describe(node.object)}.<${node.property.type}>`)
      }
      if (node.type === 'BinaryExpression' && node.operator === 'in' && isNode(node.left) && isNode(node.right) && parsed.isEnvObject(node.right)) {
        record(parsed, parsed.resolve(node.left, lists, constants), `# in ${describe(node.right)}`)
      }
      const pattern = node.type === 'VariableDeclarator' && parsed.yieldsEnvObject(node.init) ? node.id : node.type === 'AssignmentPattern' && parsed.yieldsEnvObject(node.right) ? node.left : node.type === 'ObjectPattern' && mentionsProcessEnv(node.typeAnnotation) ? node : undefined
      if (isNode(pattern) && pattern.type === 'ObjectPattern' && Array.isArray(pattern.properties)) {
        for (const property of pattern.properties as Node[]) {
          if (property.type === 'RestElement') unresolved.add(`${parsed.file}: the rest of the environment in a destructuring pattern`)
          else if (isNode(property.key) && property.key.type === 'Computed' && isNode(property.key.expression)) record(parsed, parsed.resolve(property.key.expression, lists, constants), 'const { [#]: … } = env')
          else if (isNode(property.key)) {
            const key = identifierName(property.key) ?? stringValue(property.key)
            if (key !== undefined) reads.push({ file: parsed.file, name: key })
          }
        }
      }
      if (node.type === 'SpreadElement' && isNode(node.arguments) && parsed.yieldsEnvObject(node.arguments)) unresolved.add(`${parsed.file}: ...${describe(node.arguments)}`)
      if (node.type === 'ForInStatement' && parsed.yieldsEnvObject(node.right)) unresolved.add(`${parsed.file}: for … in ${describe(node.right as Node)}`)
      if (node.type === 'CallExpression' && isNode(node.callee) && Array.isArray(node.arguments)) {
        const callee = unwrap(node.callee)
        const reflective = callee.type === 'MemberExpression' && ['Object', 'Reflect'].includes(identifierName(callee.object) ?? '')
        const takesEnv = (node.arguments as { expression?: unknown }[]).some((argument) => parsed.yieldsEnvObject(argument.expression))
        if (reflective && takesEnv) unresolved.add(`${parsed.file}: ${describe(callee)}(…) on the environment`)
      }
    }
  }

  // Every call of a helper reads the name it passes; a helper that passes its own parameter on is one more helper.
  for (let next = 0; next < helpers.length; next += 1) {
    const helper = helpers[next]
    if (!helper) continue
    for (const parsed of files) {
      if (helper.file !== undefined && helper.file !== parsed.file) continue
      for (const node of parsed.nodes) {
        if (node.type !== 'CallExpression' || !isNode(node.callee) || !Array.isArray(node.arguments)) continue
        const callee = unwrap(node.callee)
        const called = callee.type === 'MemberExpression' ? identifierName(callee.property) : identifierName(callee)
        if (called !== helper.name) continue
        const argument = (node.arguments as { spread?: unknown; expression?: unknown }[])[helper.index]
        const earlierSpread = (node.arguments as { spread?: unknown }[]).slice(0, helper.index + 1).some((entry) => entry.spread)
        if (!argument || !isNode(argument.expression) || earlierSpread) unresolved.add(`${parsed.file}: ${helper.name}(…) without a name in position ${helper.index + 1}`)
        else record(parsed, parsed.resolve(argument.expression, lists, constants), `${helper.name}(#)`)
      }
    }
  }

  return { reads, unresolved: [...unresolved].sort() }
}

function classNameOf(parsed: ParsedFile, constructorNode: Node): string | undefined {
  for (let scope = parsed.parents.get(constructorNode); scope !== undefined; scope = parsed.parents.get(scope)) {
    if (scope.type === 'ClassDeclaration' || scope.type === 'ClassExpression') return identifierName(scope.identifier)
  }
  return undefined
}
