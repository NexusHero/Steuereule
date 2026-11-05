import { BadRequestException, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { UebernahmeService } from './uebernahme.service.js'
import { RolloverResponseDto } from './dto/uebernahme-response.dto.js'

function parseVon(raw: unknown): number {
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException('von must be a whole year (the source year of the take-over).')
  }
  return parsed
}

@ApiTags('uebernahme')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class UebernahmeController {
  constructor(@Inject(UebernahmeService) private readonly uebernahmeService: UebernahmeService) {}

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
  get(@CurrentUser() userId: string, @Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<RolloverResponseDto> {
    return this.uebernahmeService.getState(userId, jahr)
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
  uebernehme(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Query('von') vonRaw: unknown,
  ): Promise<RolloverResponseDto> {
    return this.uebernahmeService.uebernehme(userId, jahr, parseVon(vonRaw))
  }
}
