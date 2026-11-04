import { UnauthenticatedError } from './domain-error.js'

export class GuestCannotUseThisEndpointError extends UnauthenticatedError {
  constructor() {
    super('ACCOUNT_REQUIRED', 'This endpoint requires a signed-in account, not a guest session.')
  }
}
