import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Injectable,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBody,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import type { AdvisorStreamEvent } from '@steuereule/core'
import type { FastifyReply } from 'fastify'

@Injectable()
export class FastifyThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const ips = req.ips
    if (Array.isArray(ips) && typeof ips[0] === 'string') {
      return ips[0]
    }
    return typeof req.ip === 'string' ? req.ip : '127.0.0.1'
  }
}
import { CurrentUser } from '../auth/current-user.decorator.js'
import { DomainError } from '../common/domain-error.js'
import { ForbidAssistant } from '../auth/forbid-assistant.guard.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
import { AdvisorService } from './advisor.service.js'
import {
  AdvisorActionMutationResponseDto,
  AdvisorSessionResponseDto,
  ApplyBatchActionsDto,
  ApplyBatchActionsResponseDto,
  SendAdvisorMessageDto,
  SendAdvisorMessageResponseDto,
} from './dto/advisor.dto.js'

@ApiTags('eulen-modus')
@Controller('v1/steuerjahre/:jahr/advisor')
@UseGuards(UserContextGuard)
export class AdvisorController {
  constructor(@Inject(AdvisorService) private readonly service: AdvisorService) {}

  @Get('session')
  @RequiresAccount()
  @ForbidAssistant()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: AdvisorSessionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  getSession(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
  ): Promise<AdvisorSessionResponseDto> {
    return this.service.getSession(userId, year)
  }

  /**
   * Errors before the first event (quota, auth) still become plain HTTP errors via the filter;
   * after the headers are out they can only travel as an SSE `error` event.
   */
  private async writeSseStream(
    openStream: (signal: AbortSignal) => AsyncIterable<AdvisorStreamEvent>,
    reply: FastifyReply,
  ): Promise<void> {
    const disconnect = new AbortController()
    reply.raw.once('close', () => disconnect.abort())
    const iterator = openStream(disconnect.signal)[Symbol.asyncIterator]()
    const first = await iterator.next()

    // Forward Fastify-managed headers (CORS, Vary, Helmet) onto reply.raw before hijacking the response.
    const existingHeaders: Record<string, number | string | string[]> = {}
    for (const [key, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined) {
        existingHeaders[key] = value
      }
    }

    reply.hijack()
    reply.raw.writeHead(200, {
      ...existingHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })

    const sendEvent = (event: string, data: unknown) => {
      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }
    }

    try {
      if (!first.done) {
        sendEvent(first.value.event, first.value.data)
      }
      while (!reply.raw.destroyed) {
        const next = await iterator.next()
        if (next.done) break
        sendEvent(next.value.event, next.value.data)
      }
    } catch (error) {
      sendEvent(
        'error',
        error instanceof DomainError
          ? { code: error.code, message: error.message }
          : { code: 'ADVISOR_STREAM_FAILED', message: 'Die Verbindung zur Eule ist abgebrochen. Bitte versuche es erneut.' },
      )
    } finally {
      await iterator.return?.().catch(() => {})
      if (!reply.raw.writableEnded) {
        reply.raw.end()
      }
    }
  }

  @Post('chat')
  @HttpCode(200)
  @RequiresAccount()
  @ForbidAssistant()
  @UseGuards(FastifyThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiBody({ type: SendAdvisorMessageDto })
  @ApiOkResponse({ type: SendAdvisorMessageResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  async sendMessage(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: SendAdvisorMessageDto,
    @Headers('accept') accept: string | undefined,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ): Promise<SendAdvisorMessageResponseDto | void> {
    if (accept?.includes('text/event-stream') && reply) {
      await this.writeSseStream((signal) => this.service.streamMessage(userId, year, dto, signal), reply)
      return
    }

    return this.service.sendMessage(userId, year, dto)
  }

  @Post('stream')
  @HttpCode(200)
  @RequiresAccount()
  @ForbidAssistant()
  @UseGuards(FastifyThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiBody({ type: SendAdvisorMessageDto })
  @ApiOkResponse({ type: SendAdvisorMessageResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  async streamMessage(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: SendAdvisorMessageDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.writeSseStream((signal) => this.service.streamMessage(userId, year, dto, signal), reply)
  }

  @Post('actions/apply-batch')
  @HttpCode(200)
  @RequiresAccount()
  @ForbidAssistant()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiBody({ type: ApplyBatchActionsDto })
  @ApiOkResponse({ type: ApplyBatchActionsResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  applyBatch(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: ApplyBatchActionsDto,
  ): Promise<ApplyBatchActionsResponseDto> {
    return this.service.applyBatch(userId, year, dto)
  }

  @Post('actions/:actionId/apply')
  @HttpCode(200)
  @RequiresAccount()
  @ForbidAssistant()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiParam({ name: 'actionId', type: String, example: 'act-123456' })
  @ApiOkResponse({ type: AdvisorActionMutationResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  applyAction(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('actionId') actionId: string,
  ): Promise<AdvisorActionMutationResponseDto> {
    return this.service.applyAction(userId, year, actionId)
  }

  @Post('actions/:actionId/undo')
  @HttpCode(200)
  @RequiresAccount()
  @ForbidAssistant()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiParam({ name: 'actionId', type: String, example: 'act-123456' })
  @ApiOkResponse({ type: AdvisorActionMutationResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  undoAction(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('actionId') actionId: string,
  ): Promise<AdvisorActionMutationResponseDto> {
    return this.service.undoAction(userId, year, actionId)
  }

  @Post('actions/:actionId/dismiss')
  @HttpCode(200)
  @RequiresAccount()
  @ForbidAssistant()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiParam({ name: 'actionId', type: String, example: 'act-123456' })
  @ApiOkResponse({ type: AdvisorActionMutationResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  dismissAction(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('actionId') actionId: string,
  ): Promise<AdvisorActionMutationResponseDto> {
    return this.service.dismissAction(userId, year, actionId)
  }
}
