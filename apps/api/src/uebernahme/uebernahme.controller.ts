import { BadRequestException, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { TakeoverService } from './uebernahme.service.js'
import { RolloverResponseDto } from './dto/uebernahme-response.dto.js'

function parseFrom(raw: unknown): number {
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException('von must be a whole year (the source year of the take-over).')
  }
  return parsed
}

@ApiTags('uebernahme')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class TakeoverController {
  constructor(@Inject(TakeoverService) private readonly takeoverService: TakeoverService) {}

  @Get(':jahr/uebernahme')
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The target tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiOkResponse({ type: RolloverResponseDto, description: 'The take-over Kennzeichnungen of this tax year.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  get(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<RolloverResponseDto> {
    return this.takeoverService.getState(userId, year)
  }

  @Post(':jahr/uebernahme')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The target tax year (Steuerjahr).',
  })
  @ApiQuery({
    name: 'von',
    required: true,
    type: Number,
    example: 2025,
    description: 'The source year to copy from (M1: the LStB row). Must be strictly before the target year.',
  })
  @ApiOkResponse({ type: RolloverResponseDto, description: 'The LStB was copied (UNBESTÄTIGT, ADR-021) and the Kennzeichnung recorded.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  takeOver(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Query('von') fromRaw: unknown,
  ): Promise<RolloverResponseDto> {
    return this.takeoverService.takeOver(userId, year, parseFrom(fromRaw))
  }
}
