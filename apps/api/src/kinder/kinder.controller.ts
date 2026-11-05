import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { ChildrenService } from './kinder.service.js'
import { CreateKindDto, KinderResponseDto, UpdateKindDto } from './dto/kind.dto.js'

@ApiTags('kinder')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class KinderController {
  constructor(@Inject(ChildrenService) private readonly kinderService: ChildrenService) {}

  @Get(':jahr/kinder')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: KinderResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  list(@CurrentUser() userId: string, @Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<KinderResponseDto> {
    return this.kinderService.list(userId, jahr)
  }

  @Post(':jahr/kinder')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiBody({ type: CreateKindDto })
  @ApiCreatedResponse({ type: KinderResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  create(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Body() dto: CreateKindDto,
  ): Promise<KinderResponseDto> {
    return this.kinderService.create(userId, jahr, dto)
  }

  @Put(':jahr/kinder/:id')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiParam({ name: 'id', type: String, example: 'uuid' })
  @ApiBody({ type: UpdateKindDto })
  @ApiOkResponse({ type: KinderResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  update(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Param('id') id: string,
    @Body() dto: UpdateKindDto,
  ): Promise<KinderResponseDto> {
    return this.kinderService.update(userId, jahr, id, dto)
  }

  @Delete(':jahr/kinder/:id')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiParam({ name: 'id', type: String, example: 'uuid' })
  @ApiOkResponse({ type: KinderResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  delete(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Param('id') id: string,
  ): Promise<KinderResponseDto> {
    return this.kinderService.delete(userId, jahr, id)
  }
}
