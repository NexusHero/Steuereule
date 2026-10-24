import { Body, Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common'
import {
  ApiBody,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { BelegService } from './beleg.service.js'
import { BelegResponseDto } from './dto/beleg-response.dto.js'
import { CreateBelegDto } from './dto/create-beleg.dto.js'
import { SetZuordnungDto } from './dto/set-zuordnung.dto.js'

@ApiTags('belege')
@Controller('v1/belege')
@UseGuards(UserContextGuard)
export class BelegController {
  // Explicit token — see the comment on ProfileController's constructor.
  constructor(@Inject(BelegService) private readonly belegService: BelegService) {}

  @Get()
  @ApiOkResponse({ type: BelegResponseDto, isArray: true, description: 'The caller’s Beleg inbox, newest first.' })
  list(@CurrentUser() userId: string): Promise<BelegResponseDto[]> {
    return this.belegService.list(userId)
  }

  @Post()
  // A Beleg is a new resource → Nest's default 201 is correct here (unlike the interview
  // POST, which is an upsert on an existing tax-year resource and therefore uses 200).
  @ApiBody({ type: CreateBelegDto })
  @ApiCreatedResponse({ type: BelegResponseDto, description: 'The created, unbound Beleg with its derived Zuordnung.' })
  create(@CurrentUser() userId: string, @Body() dto: CreateBelegDto): Promise<BelegResponseDto> {
    return this.belegService.create(userId, dto)
  }

  @Post(':id/zuordnung')
  // Upsert-style write on an existing resource (the Beleg's confirmed year) → 200.
  @HttpCode(200)
  @ApiParam({ name: 'id', type: String, description: 'The Beleg id (the caller’s own).' })
  @ApiBody({ type: SetZuordnungDto })
  @ApiOkResponse({ type: BelegResponseDto, description: 'The Beleg with its confirmed year and derived Zuordnung.' })
  @ApiNotFoundResponse({ description: 'No such Beleg for this account — nothing was persisted.' })
  setZuordnung(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: SetZuordnungDto,
  ): Promise<BelegResponseDto> {
    return this.belegService.setZuordnung(userId, id, dto)
  }
}
