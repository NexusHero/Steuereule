import { Controller, Get, HttpCode, Inject, Param, Post, Query, Res, UseGuards } from '@nestjs/common'
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiPaymentRequiredResponse,
  ApiProduces,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { CheckoutResponseDto } from '../freischaltung/dto/freischaltung.dto.js'
import { PrintoutCheckDto } from './dto/ausdruck.dto.js'
import { PrintoutService } from './ausdruck.service.js'

@ApiTags('ausdruck')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class PrintoutController {
  constructor(@Inject(PrintoutService) private readonly service: PrintoutService) {}

  @Get(':jahr/ausdruck/pruefung')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: PrintoutCheckDto, description: 'Everything that would stop the printout — checked before anyone pays.' })
  @ApiNotFoundResponse({ description: 'No measured templates exist for this tax year.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  check(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<PrintoutCheckDto> {
    return this.service.check(userId, year)
  }

  @Post(':jahr/ausdruck/checkout')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: CheckoutResponseDto, description: 'The hosted Stripe Checkout page to redirect to.' })
  @ApiUnprocessableEntityResponse({ description: '`fehlend`: the printout could not be delivered yet, so payment is not offered.' })
  @ApiServiceUnavailableResponse({ description: 'Payment is not configured on this environment.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  checkout(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<CheckoutResponseDto> {
    return this.service.startCheckout(userId, year)
  }

  @Get(':jahr/ausdruck')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiProduces('application/pdf')
  @ApiQuery({
    name: 'bearbeitbar',
    required: false,
    enum: ['true'],
    description: 'true → the values as named, editable AcroForm fields (for a correction before printing).',
  })
  @ApiOkResponse({ description: 'The filled Vordrucke (ESt 1 A + used Anlagen) as one PDF to print, sign and hand in.' })
  @ApiNotFoundResponse({ description: 'No measured templates exist for this tax year.' })
  @ApiPaymentRequiredResponse({ description: 'The Ausdruck for this tax year is not unlocked (ADR-0050).' })
  @ApiUnprocessableEntityResponse({ description: '`fehlend`: what the Hauptvordruck still needs; `zuLang`: a value too long for its field.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  async printout(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Query('bearbeitbar') editableParam?: string,
  ): Promise<Buffer> {
    const editable = editableParam === 'true'
    const pdf = await this.service.create(userId, year, { editable })
    reply.header('Content-Disposition', `attachment; filename="steuererklaerung-${year}${editable ? '-bearbeitbar' : ''}.pdf"`)
    reply.type('application/pdf')
    return Buffer.from(pdf)
  }
}
