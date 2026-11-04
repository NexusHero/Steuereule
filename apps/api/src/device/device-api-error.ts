import { HttpException } from '@nestjs/common'
import { APIError } from 'better-auth'

export function translateDeviceApiError(error: unknown): never {
  if (error instanceof APIError) {
    throw new HttpException(error.body ?? { message: error.message }, error.statusCode)
  }
  throw error
}
