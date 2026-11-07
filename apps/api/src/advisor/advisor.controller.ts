import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
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
import type { FastifyReply } from 'fastify'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { ForbidAssistant } from '../auth/forbid-assistant.guard.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
import { AdvisorService } from './advisor.service.js'
import {
  AdvisorActionMutationResponseDto,
  AdvisorSessionResponseDto,
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

  @Post('chat')
  @HttpCode(200)
  @RequiresAccount()
  @ForbidAssistant()
  @UseGuards(ThrottlerGuard)
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
    const result = await this.service.sendMessage(userId, year, dto)

    if (accept?.includes('text/event-stream') && reply) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      })
      const sendEvent = (event: string, data: unknown) => {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }
      sendEvent('status', { text: 'Eule prüft deine Akte & Paragraphen …' })
      sendEvent('token', { text: result.assistantMessage.content })
      if (result.assistantMessage.meta?.choices) {
        sendEvent('choices', { choices: result.assistantMessage.meta.choices })
      }
      if (result.assistantMessage.meta?.action) {
        sendEvent('action', result.assistantMessage.meta.action)
      }
      if (result.assistantMessage.meta?.twoPaths) {
        sendEvent('twoPaths', result.assistantMessage.meta.twoPaths)
      }
      sendEvent('done', result)
      reply.raw.end()
      return
    }

    return result
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
}
