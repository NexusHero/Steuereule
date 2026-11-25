import { Controller, Get, HttpCode, Inject, Param, Post, Query, Res, UseGuards } from '@nestjs/common'
import {
  ApiAcceptedResponse,
  ApiConflictResponse,
  ApiExcludeEndpoint,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiPaymentRequiredResponse,
  ApiProduces,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import type { FastifyReply } from 'fastify'
import { CHECKOUT_THROTTLE, PRINTOUT_JOB_THROTTLE, accountKeyedTracker } from '../rate-limit/rate-limit.js'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../common/parse-tax-year.pipe.js'
import { CheckoutResponseDto } from '../unlock/dto/unlock.dto.js'
import { LiveFormValuesDto, PrintoutCheckDto, PrintoutJobDto } from './dto/printout.dto.js'
import { PrintoutService } from './printout.service.js'
import { PrintoutJobService } from './printout-job.service.js'

@ApiTags('ausdruck')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class PrintoutController {
  constructor(
    @Inject(PrintoutService) private readonly service: PrintoutService,
    @Inject(PrintoutJobService) private readonly jobService: PrintoutJobService,
  ) {}

  @Get(':jahr/ausdruck/pruefung')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: PrintoutCheckDto, description: 'Everything that would stop the printout — checked before anyone pays.' })
  @ApiNotFoundResponse({ description: 'No measured templates exist for this tax year.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  check(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<PrintoutCheckDto> {
    return this.service.checkForUser(userId, year)
  }

  @Get(':jahr/ausdruck/werte')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({
    type: LiveFormValuesDto,
    description: 'What the printout would show, per Vordruck and copy, for the live form view. Free: only the PDF is paid (ADR-0050).',
  })
  @ApiNotFoundResponse({ description: 'No measured templates exist for this tax year.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  liveValues(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<LiveFormValuesDto> {
    return this.service.liveValues(userId, year)
  }

  @Post(':jahr/ausdruck/checkout')
  @HttpCode(200)
  @RequiresAccount()
  @Throttle({ default: { ...CHECKOUT_THROTTLE, getTracker: accountKeyedTracker } })
  @UseGuards(ThrottlerGuard)
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: CheckoutResponseDto, description: 'The hosted Stripe Checkout page to redirect to.' })
  @ApiUnprocessableEntityResponse({ description: '`fehlend`: the printout could not be delivered yet, so payment is not offered.' })
  @ApiServiceUnavailableResponse({ description: 'Payment is not configured on this environment.' })
  @ApiConflictResponse({ description: '`ALREADY_PAID`: the year is unlocked already; `PAYMENT_PENDING`: a payment is still being settled.' })
  @ApiTooManyRequestsResponse({ description: 'Too many checkout starts for this account.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  checkout(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<CheckoutResponseDto> {
    return this.service.startCheckout(userId, year)
  }

  @Post(':jahr/ausdruck/async')
  @HttpCode(202)
  @RequiresAccount()
  @Throttle({ default: { ...PRINTOUT_JOB_THROTTLE, getTracker: accountKeyedTracker } })
  @UseGuards(ThrottlerGuard)
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiQuery({
    name: 'bearbeitbar',
    required: false,
    enum: ['true'],
    description: 'true → editable PDF',
  })
  @ApiAcceptedResponse({ type: PrintoutJobDto, description: 'Asynchronous PDF rendering job enqueued (ADR-0056).' })
  exportAsync(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Query('bearbeitbar') editableParam?: string,
  ): Promise<PrintoutJobDto> {
    const editable = editableParam === 'true'
    return this.jobService.queueExport(userId, year, { editable })
  }

  @Get(':jahr/ausdruck/jobs/:jobId')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiParam({ name: 'jobId', type: String, example: 'job_4bf92f3577b34da6a3ce929d0e0e4736' })
  @ApiOkResponse({ type: PrintoutJobDto, description: 'Status of the asynchronous PDF export job.' })
  getJob(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('jobId') jobId: string,
  ): Promise<PrintoutJobDto> {
    return this.jobService.getJobStatus(userId, year, jobId)
  }

  @Get(':jahr/ausdruck/vorlage/:formular')
  @ApiExcludeEndpoint()
  async template(
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('formular') formular: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const pdf = await this.service.loadAcroFormTemplate(year, formular)
    reply.header('Cache-Control', 'public, max-age=3600')
    reply.type('application/pdf')
    return Buffer.from(pdf)
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
