import { Readable } from 'node:stream'
import { Controller, Get, Inject, NotFoundException, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common'
import { ApiNotFoundResponse, ApiOkResponse, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../auth/auth.tokens.js'
import { ACCOUNT_EXPORT_THROTTLE, accountKeyedTracker } from '../rate-limit/rate-limit.js'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { FreshAuthChecker } from '../auth/fresh-auth.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { AccountExportService, PDF_ACCESS_LOG_ENTRIES } from './account-export.service.js'
import { EXPORT_FORMATS, type ExportFormat, ExportQueryDto } from './dto/export-query.dto.js'
import { ExportDocumentDto } from './dto/export-response.dto.js'

@ApiTags('account')
@Controller('v1/account')
@UseGuards(UserContextGuard)
export class AccountExportController {
  constructor(
    @Inject(AccountExportService) private readonly exportService: AccountExportService,
    @Inject(FreshAuthChecker) private readonly freshAuthChecker: FreshAuthChecker,
    @Inject(BETTER_AUTH_BUNDLE) private readonly betterAuth: BetterAuthBundle,
  ) {}

  @Get('export')
  // Assembling reads every table of the account and the PDF starts Chromium: a few exports an hour per account (ADR-0109).
  @Throttle({ default: { ...ACCOUNT_EXPORT_THROTTLE, getTracker: accountKeyedTracker } })
  @UseGuards(ThrottlerGuard)
  @ApiProduces('application/json', 'application/pdf')
  @ApiQuery({ name: 'format', required: false, enum: EXPORT_FORMATS, description: 'json (default) or pdf.' })
  @ApiOkResponse({
    type: ExportDocumentDto,
    description:
      'The caller’s full DSGVO export (Art. 15/20), assembled once and returned either as this JSON ' +
      'document (?format=json, the default) or as an equivalent German PDF-Bericht (?format=pdf, ' +
      'application/pdf, same fields, human-readable). Both branches append exactly one READ/export ' +
      'audit entry before the response is sent (ADR-0013). The PDF lists the newest 1000 access-log entries and says so; the JSON is complete. 5 exports an hour per account (429 beyond).',
  })
  @ApiNotFoundResponse({ description: 'The caller has no better-auth account yet (a guest that never signed up).' })
  async exportAccount(
    @CurrentUser() userId: string,
    @Query() query: ExportQueryDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile | Buffer> {
    // Bulk PII leaves only behind a fresh session or a recent password re-entry (ADR-0107 L1),
    // the same bar the account deletion sets — a stale stolen cookie cannot export everything.
    await this.freshAuthChecker.assertFreshSessionOrStepUp(this.betterAuth, request.headers, userId)

    const format: ExportFormat = query.format ?? 'json'

    if (format === 'pdf') {
      const document = await this.exportService.assemble(userId, { accessLogNewest: PDF_ACCESS_LOG_ENTRIES })
      if (!document) throw new NotFoundException('No account exists for this session to export.')
      const pdf = await this.exportService.renderPdf(document)
      await this.exportService.recordExportRead(userId)
      reply.header('Content-Disposition', `attachment; filename="steuereule-export-${document.exportedAt.slice(0, 10)}.pdf"`)
      reply.type('application/pdf')
      return pdf
    }

    // Written as a stream: the access log is read and sent in batches, so memory stays flat (ADR-0109).
    const stream = await this.exportService.assembleJsonStream(userId)
    if (!stream) throw new NotFoundException('No account exists for this session to export.')
    await this.exportService.recordExportRead(userId)
    reply.header('Content-Disposition', `attachment; filename="steuereule-export-${stream.exportedAt.slice(0, 10)}.json"`)
    reply.type('application/json')
    return new StreamableFile(Readable.from(stream.chunks))
  }
}
