import { Body, Controller, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { FastifyThrottlerGuard } from '../advisor/advisor.controller.js'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../auth/auth.tokens.js'
import { TooManyRequestsError } from '../common/domain-error.js'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { ForbidAssistant } from '../auth/forbid-assistant.guard.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseReceiptDto, ParseReceiptResponseDto } from './dto/parse-receipt.dto.js'
import { ReassignReceiptDto, ReassignReceiptResponseDto } from './dto/reassign-receipt.dto.js'
import { ReceiptParseService } from './receipt-parse.service.js'
import { ReceiptReassignService } from './receipt-reassign.service.js'

/** Receipt reads a day per account: a year's whole shoebox in one sitting fits, a script does not (ADR-0109). */
export const DEFAULT_PARSE_DAILY_LIMIT = 300

@ApiTags('eulen-modus')
@Controller('v1/belege')
@UseGuards(UserContextGuard)
export class ReceiptParseController {
  constructor(
    @Inject(ReceiptParseService) private readonly receiptParseService: ReceiptParseService,
    @Inject(ReceiptReassignService) private readonly reassignService: ReceiptReassignService,
    @Inject(BETTER_AUTH_BUNDLE) private readonly betterAuth: BetterAuthBundle,
  ) {}

  @Post('parse')
  @HttpCode(200)
  @RequiresAccount()
  @ForbidAssistant()
  @UseGuards(FastifyThrottlerGuard)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiBody({ type: ParseReceiptDto })
  @ApiOkResponse({
    type: ParseReceiptResponseDto,
    description: 'Two-stage isolated vision_ocr parse and Zero-Write pending draft staging.',
  })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  async parseReceipt(
    @CurrentUser() userId: string,
    @Body() dto: ParseReceiptDto,
  ): Promise<ParseReceiptResponseDto> {
    // Each parse may call the vision model; the minute limit alone allows 21,600 a day per account (ADR-0109).
    const limit = Number(process.env.PARSE_DAILY_LIMIT)
    const max = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_PARSE_DAILY_LIMIT
    const decision = await this.betterAuth.rateLimitStorage.consume(`parse-daily:${userId}`, { window: 24 * 60 * 60, max })
    if (!decision.allowed) {
      throw new TooManyRequestsError('PARSE_DAILY_LIMIT', `Du hast heute ${max} Belege auswerten lassen. Morgen geht es weiter.`, {
        retryAfterSeconds: decision.retryAfter ?? 24 * 60 * 60,
      })
    }
    return this.receiptParseService.parseReceipt(userId, dto)
  }

  @Post(':id/inhaber')
  @HttpCode(200)
  @RequiresAccount()
  @ForbidAssistant()
  @UseGuards(FastifyThrottlerGuard)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiParam({ name: 'id', type: String, description: 'The Beleg id (the caller’s own).' })
  @ApiBody({ type: ReassignReceiptDto })
  @ApiOkResponse({
    type: ReassignReceiptResponseDto,
    description: 'Gives the document to another person of the household (ADR-0092): its values move along.',
  })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  reassign(@CurrentUser() userId: string, @Param('id') id: string, @Body() dto: ReassignReceiptDto): Promise<ReassignReceiptResponseDto> {
    return this.reassignService.reassign(userId, id, dto)
  }
}
