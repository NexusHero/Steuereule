import {
  applyDecorators,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Injectable,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBody,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import type { FastifyReply } from 'fastify'

/**
 * What every route of the owl shares: it needs a signed-in account, an assistant token may not
 * call it, and it lives under a tax year.
 */
const OwlRoute = (): MethodDecorator =>
  applyDecorators(RequiresAccount(), ForbidAssistant(), ApiParam({ name: 'jahr', type: Number, example: 2025 }))

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
import { ForbidAssistant } from '../auth/forbid-assistant.guard.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
import { AdvisorService } from './advisor.service.js'
import {
  AdvisorActionMutationResponseDto,
  AdvisorChatMessageDto,
  AdvisorSessionResponseDto,
  ApplyBatchActionsDto,
  ApplyBatchActionsResponseDto,
  AdvisorContextDto,
  AdvisorConversationDto,
  AdvisorNoteDto,
  AdvisorSearchHitDto,
  DeleteAdvisorNoteResponseDto,
  SaveAdvisorNoteDto,
  ClearAdvisorConversationResponseDto,
  RenameAdvisorConversationDto,
  SendAdvisorMessageDto,
  SendAdvisorMessageResponseDto,
  SetAdvisorFeedbackDto,
  StopAdvisorRunResponseDto,
} from './dto/advisor.dto.js'
import type { AdvisorRunEntry } from './run/advisor-run-log.js'
import { AdvisorRunService } from './run/advisor-run.service.js'

const SSE_HEARTBEAT_MS = 15_000

@ApiTags('eulen-modus')
@Controller('v1/steuerjahre/:jahr/advisor')
@UseGuards(UserContextGuard)
export class AdvisorController {
  constructor(
    @Inject(AdvisorService) private readonly service: AdvisorService,
    @Inject(AdvisorRunService) private readonly runs: AdvisorRunService,
  ) {}

  @Get('session')
  @OwlRoute()
  @ApiOkResponse({ type: AdvisorSessionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  @ApiQuery({ name: 'conversationId', required: false, type: String, description: 'Which conversation to load; without it the one used last.' })
  @ApiNotFoundResponse({ description: 'No such conversation in this tax year.' })
  getSession(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Query('conversationId') conversationId?: string,
  ): Promise<AdvisorSessionResponseDto> {
    return this.runs.getSession(userId, year, conversationId || undefined)
  }

  /**
   * Writes run events as SSE, each with its sequence number as `id:` so a client can resume with
   * `Last-Event-ID`. Closing the connection only ends this reader, never the run (#476).
   */
  private async writeRunEvents(
    open: (signal: AbortSignal) => Promise<AsyncIterable<AdvisorRunEntry>>,
    reply: FastifyReply,
  ): Promise<void> {
    const disconnect = new AbortController()
    reply.raw.once('close', () => disconnect.abort())
    // Errors up to here (quota, unknown run) are still plain HTTP errors via the filter.
    const entries = await open(disconnect.signal)

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
      // Proxies must pass events through as they come.
      'X-Accel-Buffering': 'no',
    })

    const writable = (): boolean => !reply.raw.writableEnded && !reply.raw.destroyed
    // A comment line every few seconds keeps idle proxies from cutting a slow answer.
    const heartbeat = setInterval(() => {
      if (writable()) reply.raw.write(': ping\n\n')
    }, SSE_HEARTBEAT_MS)

    try {
      for await (const { seq, event } of entries) {
        if (!writable()) break
        reply.raw.write(`id: ${seq}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`)
      }
    } catch {
      if (writable()) {
        reply.raw.write(
          `event: error\ndata: ${JSON.stringify({ code: 'ADVISOR_STREAM_FAILED', message: 'Die Verbindung zur Eule ist abgebrochen. Bitte versuche es erneut.' })}\n\n`,
        )
      }
    } finally {
      clearInterval(heartbeat)
      if (!reply.raw.writableEnded) {
        reply.raw.end()
      }
    }
  }

  private streamNewRun(userId: string, year: number, dto: SendAdvisorMessageDto, reply: FastifyReply): Promise<void> {
    return this.writeRunEvents(async (signal) => {
      const { runId } = await this.runs.start(userId, year, dto)
      return this.runs.events(userId, runId, 0, signal)
    }, reply)
  }

  @Post('chat')
  @HttpCode(200)
  @OwlRoute()
  @UseGuards(FastifyThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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
      await this.streamNewRun(userId, year, dto, reply)
      return
    }

    return this.service.sendMessage(userId, year, dto)
  }

  @Post('stream')
  @HttpCode(200)
  @OwlRoute()
  @UseGuards(FastifyThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Ask the owl and follow the answer as server-sent events',
    description:
      'Starts a run that continues on the server even if this connection drops. Every event carries its sequence number as SSE id; the first event (`start`) names the run. Re-attach with GET runs/{runId}/events.',
  })
  @ApiBody({ type: SendAdvisorMessageDto })
  @ApiOkResponse({ type: SendAdvisorMessageResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  async streamMessage(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: SendAdvisorMessageDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.streamNewRun(userId, year, dto, reply)
  }

  @Get('runs/:runId/events')
  @OwlRoute()
  @ApiOperation({
    summary: 'Re-attach to a running or just finished answer',
    description: 'Server-sent events after the given sequence number (`Last-Event-ID` header or `after` query). Ends when the run has ended.',
  })
  @ApiParam({ name: 'runId', type: String })
  @ApiQuery({ name: 'after', type: Number, required: false, example: 12 })
  @ApiOkResponse({ description: 'text/event-stream' })
  @ApiNotFoundResponse({ description: 'No such run for this user (or it has expired).' })
  async runEvents(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) _year: number,
    @Param('runId') runId: string,
    @Query('after') after: string | undefined,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const parsed = Number.parseInt(lastEventId ?? after ?? '0', 10)
    const afterSeq = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
    await this.writeRunEvents((signal) => this.runs.events(userId, runId, afterSeq, signal), reply)
  }

  @Post('runs/:runId/stop')
  @HttpCode(200)
  @OwlRoute()
  @ApiOperation({ summary: 'Stop a running answer; the text so far is kept as aborted, without proposals' })
  @ApiParam({ name: 'runId', type: String })
  @ApiOkResponse({ type: StopAdvisorRunResponseDto })
  @ApiNotFoundResponse({ description: 'No such run for this user (or it has expired).' })
  stopRun(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) _year: number,
    @Param('runId') runId: string,
  ): Promise<StopAdvisorRunResponseDto> {
    return this.runs.stop(userId, runId)
  }

  @Delete('session')
  @OwlRoute()
  @ApiOperation({ summary: 'Clear the conversation of this tax year; values already applied to the return stay' })
  @ApiOkResponse({ type: ClearAdvisorConversationResponseDto })
  @ApiConflictResponse({ description: 'An answer is still running.' })
  @ApiQuery({ name: 'conversationId', required: false, type: String, description: 'Which conversation to empty; without it the one used last.' })
  clearConversation(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Query('conversationId') conversationId?: string,
  ): Promise<ClearAdvisorConversationResponseDto> {
    return this.runs.clearConversation(userId, year, conversationId || undefined)
  }

  @Get('search')
  @OwlRoute()
  @ApiOperation({ summary: 'Search the conversations of this tax year: titles and messages, newest hit first (#481)' })
  @ApiQuery({ name: 'q', type: String, description: 'At least two characters; case and accents are ignored.' })
  @ApiOkResponse({ type: [AdvisorSearchHitDto] })
  search(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Query('q') query?: string): Promise<AdvisorSearchHitDto[]> {
    return this.service.searchConversations(userId, year, (query ?? '').slice(0, 100))
  }

  @Get('notes')
  @OwlRoute()
  @ApiOperation({ summary: 'The project notes of this tax year (#481)' })
  @ApiOkResponse({ type: [AdvisorNoteDto] })
  listNotes(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<AdvisorNoteDto[]> {
    return this.service.listNotes(userId, year)
  }

  @Post('notes')
  @HttpCode(200)
  @OwlRoute()
  @ApiOperation({ summary: 'Add a project note by hand' })
  @ApiBody({ type: SaveAdvisorNoteDto })
  @ApiOkResponse({ type: AdvisorNoteDto })
  @ApiConflictResponse({ description: 'The tax year already holds the maximum number of notes.' })
  createNote(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Body() dto: SaveAdvisorNoteDto): Promise<AdvisorNoteDto> {
    return this.service.createNote(userId, year, dto.text)
  }

  @Put('notes/:noteId')
  @OwlRoute()
  @ApiOperation({ summary: 'Change the text of a project note' })
  @ApiParam({ name: 'noteId', type: String })
  @ApiBody({ type: SaveAdvisorNoteDto })
  @ApiOkResponse({ type: AdvisorNoteDto })
  @ApiNotFoundResponse({ description: 'No such note in this tax year.' })
  updateNote(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('noteId') noteId: string,
    @Body() dto: SaveAdvisorNoteDto,
  ): Promise<AdvisorNoteDto> {
    return this.service.updateNote(userId, year, noteId, dto.text)
  }

  @Delete('notes/:noteId')
  @OwlRoute()
  @ApiOperation({ summary: 'Delete a project note' })
  @ApiParam({ name: 'noteId', type: String })
  @ApiOkResponse({ type: DeleteAdvisorNoteResponseDto })
  @ApiNotFoundResponse({ description: 'No such note in this tax year.' })
  deleteNote(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Param('noteId') noteId: string): Promise<DeleteAdvisorNoteResponseDto> {
    return this.service.deleteNote(userId, year, noteId)
  }

  @Post('messages/:messageId/note-changes/:index/undo')
  @HttpCode(200)
  @OwlRoute()
  @ApiOperation({ summary: 'Take back one change the owl made to the project notes in an answer' })
  @ApiParam({ name: 'messageId', type: String })
  @ApiParam({ name: 'index', type: Number, description: 'Position of the change in the answer.' })
  @ApiOkResponse({ type: AdvisorChatMessageDto })
  @ApiNotFoundResponse({ description: 'No such change.' })
  @ApiConflictResponse({ description: 'Already taken back.' })
  undoNoteChange(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('messageId') messageId: string,
    @Param('index', ParseIntPipe) index: number,
  ): Promise<AdvisorChatMessageDto> {
    return this.service.undoNoteChange(userId, year, messageId, index)
  }

  @Get('conversations')
  @OwlRoute()
  @ApiOperation({ summary: 'The conversations of this tax year, most recently used first (#481)' })
  @ApiOkResponse({ type: [AdvisorConversationDto] })
  listConversations(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<AdvisorConversationDto[]> {
    return this.service.listConversations(userId, year)
  }

  @Post('conversations')
  @HttpCode(200)
  @OwlRoute()
  @ApiOperation({ summary: 'Start a new conversation; an empty one that already exists is reused' })
  @ApiOkResponse({ type: AdvisorConversationDto })
  @ApiConflictResponse({ description: 'The tax year already holds the maximum number of conversations.' })
  createConversation(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<AdvisorConversationDto> {
    return this.service.createConversation(userId, year)
  }

  @Put('conversations/:conversationId')
  @OwlRoute()
  @ApiOperation({ summary: 'Rename a conversation' })
  @ApiParam({ name: 'conversationId', type: String })
  @ApiBody({ type: RenameAdvisorConversationDto })
  @ApiOkResponse({ type: AdvisorConversationDto })
  @ApiNotFoundResponse({ description: 'No such conversation in this tax year.' })
  renameConversation(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('conversationId') conversationId: string,
    @Body() dto: RenameAdvisorConversationDto,
  ): Promise<AdvisorConversationDto> {
    return this.service.renameConversation(userId, year, conversationId, dto.title)
  }

  @Post('conversations/:conversationId/summarize')
  @HttpCode(200)
  @OwlRoute()
  @ApiOperation({ summary: 'Summarise the older part of a conversation now, before its context is full' })
  @ApiParam({ name: 'conversationId', type: String })
  @ApiOkResponse({ type: AdvisorContextDto })
  @ApiNotFoundResponse({ description: 'No such conversation in this tax year.' })
  @ApiConflictResponse({ description: 'Too short to summarise, or an answer is still running.' })
  summarizeConversation(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('conversationId') conversationId: string,
  ): Promise<AdvisorContextDto> {
    return this.runs.summarizeConversation(userId, year, conversationId)
  }

  @Delete('conversations/:conversationId')
  @OwlRoute()
  @ApiOperation({ summary: 'Delete a conversation with its messages; values already applied to the return stay' })
  @ApiParam({ name: 'conversationId', type: String })
  @ApiOkResponse({ type: ClearAdvisorConversationResponseDto })
  @ApiNotFoundResponse({ description: 'No such conversation in this tax year.' })
  @ApiConflictResponse({ description: 'An answer is still running in it.' })
  deleteConversation(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('conversationId') conversationId: string,
  ): Promise<ClearAdvisorConversationResponseDto> {
    return this.runs.deleteConversation(userId, year, conversationId)
  }

  @Put('messages/:messageId/feedback')
  @OwlRoute()
  @ApiOperation({ summary: 'Rate an answer of the owl (thumbs up/down, optional reason); null removes the rating' })
  @ApiParam({ name: 'messageId', type: String })
  @ApiBody({ type: SetAdvisorFeedbackDto })
  @ApiOkResponse({ type: AdvisorChatMessageDto })
  @ApiNotFoundResponse({ description: 'No such message for this user and year.' })
  setFeedback(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('messageId') messageId: string,
    @Body() dto: SetAdvisorFeedbackDto,
  ): Promise<AdvisorChatMessageDto> {
    return this.service.setFeedback(userId, year, messageId, dto)
  }

  @Post('actions/apply-batch')
  @HttpCode(200)
  @OwlRoute()
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
  @OwlRoute()
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
  @OwlRoute()
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
  @OwlRoute()
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
