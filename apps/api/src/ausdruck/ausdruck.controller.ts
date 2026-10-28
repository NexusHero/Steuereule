import { Controller, Get, HttpCode, Inject, Param, Post, Res, UseGuards } from '@nestjs/common'
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiPaymentRequiredResponse,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { CheckoutResponseDto } from '../freischaltung/dto/freischaltung.dto.js'
import { AusdruckPruefungDto } from './dto/ausdruck.dto.js'
import { AusdruckService } from './ausdruck.service.js'

@ApiTags('ausdruck')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class AusdruckController {
  constructor(@Inject(AusdruckService) private readonly service: AusdruckService) {}

  @Get(':jahr/ausdruck/pruefung')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: AusdruckPruefungDto, description: 'Everything that would stop the printout — checked before anyone pays.' })
  @ApiNotFoundResponse({ description: 'No measured templates exist for this tax year.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  pruefung(@CurrentUser() userId: string, @Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<AusdruckPruefungDto> {
    return this.service.pruefe(userId, jahr)
  }

  // Lives here, not in Freischaltung: paying is only offered once the printout it buys can
  // actually be delivered (consumer protection — no paid product that cannot be handed out).
  @Post(':jahr/ausdruck/checkout')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: CheckoutResponseDto, description: 'The hosted Stripe Checkout page to redirect to.' })
  @ApiUnprocessableEntityResponse({ description: '`fehlend`: the printout could not be delivered yet, so payment is not offered.' })
  @ApiServiceUnavailableResponse({ description: 'Payment is not configured on this environment.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  checkout(@CurrentUser() userId: string, @Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<CheckoutResponseDto> {
    return this.service.starteCheckout(userId, jahr)
  }

  @Get(':jahr/ausdruck')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'The filled Vordrucke (ESt 1 A + used Anlagen) as one PDF to print, sign and hand in.' })
  @ApiNotFoundResponse({ description: 'No measured templates exist for this tax year.' })
  @ApiPaymentRequiredResponse({ description: 'The Ausdruck for this tax year is not unlocked (ADR-0050).' })
  @ApiUnprocessableEntityResponse({ description: '`fehlend`: what the Hauptvordruck still needs; `zuLang`: a value too long for its field.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  async ausdruck(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const pdf = await this.service.erstelle(userId, jahr)
    reply.header('Content-Disposition', `attachment; filename="steuererklaerung-${jahr}.pdf"`)
    reply.type('application/pdf')
    return Buffer.from(pdf)
  }
}
