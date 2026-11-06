import { Body, Controller, Get, HttpCode, Inject, Put, UseGuards } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBody, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { PutMasterDataDto, MasterDataResponseDto } from './dto/stammdaten.dto.js'
import { MasterDataService } from './stammdaten.service.js'

@ApiTags('stammdaten')
@Controller('v1/stammdaten')
@UseGuards(UserContextGuard)
export class MasterDataController {
  constructor(@Inject(MasterDataService) private readonly service: MasterDataService) {}

  @Get()
  @RequiresAccount()
  @ApiOkResponse({ type: MasterDataResponseDto, description: 'All null with every required field in `fehlend` when nothing is saved yet.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  read(@CurrentUser() userId: string): Promise<MasterDataResponseDto> {
    return this.service.read(userId)
  }

  @Put()
  @HttpCode(200)
  @RequiresAccount()
  @ApiBody({ type: PutMasterDataDto })
  @ApiOkResponse({ type: MasterDataResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid field, or a religion without explicit consent (Art. 9 DSGVO).' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  save(@CurrentUser() userId: string, @Body() dto: PutMasterDataDto): Promise<MasterDataResponseDto> {
    return this.service.save(userId, dto)
  }
}
