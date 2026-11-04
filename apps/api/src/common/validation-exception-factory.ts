import { BadRequestException } from '@nestjs/common'
import type { ValidationError } from 'class-validator'

interface FieldError {
  field: string
  message: string
}

function flatten(errors: ValidationError[], parentPath = ''): FieldError[] {
  return errors.flatMap((error) => {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property
    const own = error.constraints
      ? Object.values(error.constraints).map((message) => ({ field: path, message }))
      : []
    const nested = error.children && error.children.length > 0 ? flatten(error.children, path) : []
    return [...own, ...nested]
  })
}

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const fields = flatten(errors)
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    fields,
  })
}
