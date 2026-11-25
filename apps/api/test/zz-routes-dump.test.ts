import { RequestMethod } from '@nestjs/common'
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { ModulesContainer } from '@nestjs/core'
import { ThrottlerGuard } from '@nestjs/throttler'
import { it } from 'vitest'
import { buildTestApp } from './support/build-test-app.js'
it('dump', async () => {
  const app = (await buildTestApp({ sessionsByToken: {} })).app
  const out: string[] = []
  for (const module of app.get(ModulesContainer).values()) for (const wrapper of module.controllers.values()) {
    const c = wrapper.metatype as unknown as { name: string; prototype: object }
    for (const h of Object.getOwnPropertyNames(c.prototype)) {
      const fn: unknown = Object.getOwnPropertyDescriptor(c.prototype, h)?.value
      if (typeof fn !== 'function') continue
      const m = Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod | undefined
      if (m === undefined) continue
      const guards = [...(Reflect.getMetadata(GUARDS_METADATA, fn) ?? []), ...(Reflect.getMetadata(GUARDS_METADATA, c) ?? [])] as Array<{ prototype?: unknown }>
      const tg = guards.some((g) => g === ThrottlerGuard || g.prototype instanceof ThrottlerGuard)
      const lim = Reflect.getMetadata('THROTTLER:LIMITdefault', fn)
      out.push(`${c.name}.${h}\t${RequestMethod[m]} ${String(Reflect.getMetadata(PATH_METADATA, c))}/${String(Reflect.getMetadata(PATH_METADATA, fn))}\t${tg ? 'G' : '-'}${lim !== undefined ? 'L' : '-'}`)
    }
  }
  console.log(out.join('\n'))
  await app.close()
})
