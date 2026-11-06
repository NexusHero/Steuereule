import { GUARDS_METADATA } from '@nestjs/common/constants'
import { describe, expect, it } from 'vitest'
import { RequiresAccountGuard } from '../src/auth/requires-account.guard.js'
import { UserContextGuard } from '../src/auth/user-context.guard.js'
import { UnlockController } from '../src/unlock/unlock.controller.js'

describe('FreischaltungController', () => {
  it('resolves who is calling before it demands an account', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, UnlockController.prototype.status) as unknown[]

    expect(guards.indexOf(UserContextGuard)).toBeLessThan(guards.indexOf(RequiresAccountGuard))
  })
})
