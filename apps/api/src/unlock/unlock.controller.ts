import { Controller, Get, Headers, HttpCode, Inject, Param, Post, Req, UseGuards, type RawBodyRequest } from '@nestjs/common'
import {
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
import { UnlockStatusDto } from './dto/unlock.dto.js'
import { UnlockService } from './unlock.service.js'

@ApiTags('freischaltung')
@Controller()
export class UnlockController {
  constructor(@Inject(UnlockService) private readonly service: UnlockService) {}

  @Get('v1/steuerjahre/:jahr/freischaltung')
  @RequiresAccount()
  @UseGuards(UserContextGuard)
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: UnlockStatusDto })
  @ApiUnauthorizedResponse({ description: 'Guest session — paying requires a signed-in account.' })
  async status(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
  ): Promise<UnlockStatusDto> {
    return { status: await this.service.status(userId, year) }
  }

  @Post('v1/zahlung/stripe/webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async webhook(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    await this.service.processWebhook(request.rawBody, signature)
    return { received: true }
  }
}
