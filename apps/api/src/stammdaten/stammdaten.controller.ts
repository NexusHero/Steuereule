import { Body, Controller, Get, HttpCode, Inject, Put, UseGuards } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBody, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { PutStammdatenDto, StammdatenResponseDto } from './dto/stammdaten.dto.js'
import { StammdatenService } from './stammdaten.service.js'

@ApiTags('stammdaten')
@Controller('v1/stammdaten')
@UseGuards(UserContextGuard)
export class StammdatenController {
  constructor(@Inject(StammdatenService) private readonly service: StammdatenService) {}

  @Get()
  @RequiresAccount()
  @ApiOkResponse({ type: StammdatenResponseDto, description: 'All null with every required field in `fehlend` when nothing is saved yet.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  lese(@CurrentUser() userId: string): Promise<StammdatenResponseDto> {
    return this.service.lese(userId)
  }

  @Put()
  @HttpCode(200)
  @RequiresAccount()
  @ApiBody({ type: PutStammdatenDto })
  @ApiOkResponse({ type: StammdatenResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid field, or a religion without explicit consent (Art. 9 DSGVO).' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  speichere(@CurrentUser() userId: string, @Body() dto: PutStammdatenDto): Promise<StammdatenResponseDto> {
    return this.service.speichere(userId, dto)
  }
}
