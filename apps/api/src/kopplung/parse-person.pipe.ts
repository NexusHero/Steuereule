import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'

/** `?person=B` lets Person A record Person B's figures (ADR-0054); absent means the caller's own. */
@Injectable()
export class ParsePersonPipe implements PipeTransform<unknown, 'A' | 'B'> {
  transform(value: unknown): 'A' | 'B' {
    if (value === undefined || value === '' || value === 'A') return 'A'
    if (value === 'B') return 'B'
    throw new BadRequestException('person must be A or B')
  }
}
