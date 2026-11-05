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
import { ReceiptResponseDto } from './dto/beleg-response.dto.js'
import { CreateReceiptDto } from './dto/create-beleg.dto.js'
import { SetAssignmentDto } from './dto/set-zuordnung.dto.js'

@ApiTags('belege')
@Controller('v1/belege')
@UseGuards(UserContextGuard)
export class BelegController {
  constructor(@Inject(BelegService) private readonly belegService: BelegService) {}

  @Get()
  @ApiOkResponse({ type: ReceiptResponseDto, isArray: true, description: 'The caller’s Beleg inbox, newest first.' })
  list(@CurrentUser() userId: string): Promise<ReceiptResponseDto[]> {
    return this.belegService.list(userId)
  }

  @Post()
  @ApiBody({ type: CreateReceiptDto })
  @ApiCreatedResponse({ type: ReceiptResponseDto, description: 'The created, unbound Beleg with its derived Zuordnung.' })
  create(@CurrentUser() userId: string, @Body() dto: CreateReceiptDto): Promise<ReceiptResponseDto> {
    return this.belegService.create(userId, dto)
  }

  @Post(':id/zuordnung')
  @HttpCode(200)
  @ApiParam({ name: 'id', type: String, description: 'The Beleg id (the caller’s own).' })
  @ApiBody({ type: SetAssignmentDto })
  @ApiOkResponse({ type: ReceiptResponseDto, description: 'The Beleg with its confirmed year and derived Zuordnung.' })
  @ApiNotFoundResponse({ description: 'No such Beleg for this account — nothing was persisted.' })
  setZuordnung(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: SetAssignmentDto,
  ): Promise<ReceiptResponseDto> {
    return this.belegService.setZuordnung(userId, id, dto)
  }
}
