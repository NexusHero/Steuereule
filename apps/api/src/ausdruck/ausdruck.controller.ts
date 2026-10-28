import { Controller, Get, Inject, Param, Res, UseGuards } from '@nestjs/common'
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiPaymentRequiredResponse,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { AusdruckService } from './ausdruck.service.js'

@ApiTags('ausdruck')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class AusdruckController {
  constructor(@Inject(AusdruckService) private readonly service: AusdruckService) {}

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
