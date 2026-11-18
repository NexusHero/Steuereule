import { Controller, Get, Inject, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiProperty, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { KnownEmployersService } from './known-employers.service.js'

export class KnownEmployerDto {
  @ApiProperty({ type: String, example: 'Cilag AG' })
  name!: string

  @ApiProperty({ type: String, example: 'Hochstrasse 201' })
  strasse!: string

  @ApiProperty({ type: String, example: '8205 Schaffhausen' })
  plzOrt!: string
}

@ApiTags('ch-lohnausweis')
@Controller('v1/arbeitgeber')
@UseGuards(UserContextGuard)
export class KnownEmployersController {
  constructor(@Inject(KnownEmployersService) private readonly service: KnownEmployersService) {}

  @Get()
  @RequiresAccount()
  @ApiOkResponse({ type: KnownEmployerDto, isArray: true, description: 'The employers recorded on the Swiss salary certificates of the user and their Person B, over all years.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  async list(@CurrentUser() userId: string): Promise<KnownEmployerDto[]> {
    return [...(await this.service.list(userId))]
  }
}
