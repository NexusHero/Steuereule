import { Body, Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { FastifyThrottlerGuard } from '../advisor/advisor.controller.js'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { ForbidAssistant } from '../auth/forbid-assistant.guard.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseReceiptDto, ParseReceiptResponseDto } from './dto/parse-receipt.dto.js'
import { ReceiptParseService } from './receipt-parse.service.js'

@ApiTags('eulen-modus')
@Controller('v1/belege')
@UseGuards(UserContextGuard)
export class ReceiptParseController {
  constructor(@Inject(ReceiptParseService) private readonly receiptParseService: ReceiptParseService) {}

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
  parseReceipt(
    @CurrentUser() userId: string,
    @Body() dto: ParseReceiptDto,
  ): Promise<ParseReceiptResponseDto> {
    return this.receiptParseService.parseReceipt(userId, dto)
  }
}
