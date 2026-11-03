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
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { FreischaltungStatusDto } from './dto/freischaltung.dto.js'
import { FreischaltungService } from './freischaltung.service.js'

@ApiTags('freischaltung')
@Controller()
export class FreischaltungController {
  constructor(@Inject(FreischaltungService) private readonly service: FreischaltungService) {}

  @Get('v1/steuerjahre/:jahr/freischaltung')
  @UseGuards(UserContextGuard)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: FreischaltungStatusDto })
  @ApiUnauthorizedResponse({ description: 'Guest session — paying requires a signed-in account.' })
  async status(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
  ): Promise<FreischaltungStatusDto> {
    return { status: await this.service.status(userId, jahr) }
  }

  // Called by Stripe, not by the app: no session, authenticity comes from the
  // signature over the exact raw bytes (hence rawBody, not the parsed JSON).
  @Post('v1/zahlung/stripe/webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async webhook(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers('stripe-signature') signatur: string | undefined,
  ): Promise<{ received: true }> {
    await this.service.verarbeiteWebhook(request.rawBody, signatur)
    return { received: true }
  }
}
