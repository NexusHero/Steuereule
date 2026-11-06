import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
import { ChildrenService } from './children.service.js'
import { CreateChildDto, ChildrenResponseDto, UpdateChildDto } from './dto/child.dto.js'

@ApiTags('kinder')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class ChildrenController {
  constructor(@Inject(ChildrenService) private readonly kinderService: ChildrenService) {}

  @Get(':jahr/kinder')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: ChildrenResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  list(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<ChildrenResponseDto> {
    return this.kinderService.list(userId, year)
  }

  @Post(':jahr/kinder')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiBody({ type: CreateChildDto })
  @ApiCreatedResponse({ type: ChildrenResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  create(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: CreateChildDto,
  ): Promise<ChildrenResponseDto> {
    return this.kinderService.create(userId, year, dto)
  }

  @Put(':jahr/kinder/:id')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiParam({ name: 'id', type: String, example: 'uuid' })
  @ApiBody({ type: UpdateChildDto })
  @ApiOkResponse({ type: ChildrenResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  update(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('id') id: string,
    @Body() dto: UpdateChildDto,
  ): Promise<ChildrenResponseDto> {
    return this.kinderService.update(userId, year, id, dto)
  }

  @Delete(':jahr/kinder/:id')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiParam({ name: 'id', type: String, example: 'uuid' })
  @ApiOkResponse({ type: ChildrenResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  delete(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('id') id: string,
  ): Promise<ChildrenResponseDto> {
    return this.kinderService.delete(userId, year, id)
  }
}
