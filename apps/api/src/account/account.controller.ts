import { Controller, Get, Inject, NotFoundException, Query, Res, UseGuards } from '@nestjs/common'
import { ApiNotFoundResponse, ApiOkResponse, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { AccountExportService } from './account-export.service.js'
import { EXPORT_FORMATS, type ExportFormat, ExportQueryDto } from './dto/export-query.dto.js'
import { ExportDocumentDto } from './dto/export-response.dto.js'

@ApiTags('account')
@Controller('v1/account')
@UseGuards(UserContextGuard)
export class AccountController {
  // Explicit token — see the comment on ProfileController's constructor.
  constructor(@Inject(AccountExportService) private readonly exportService: AccountExportService) {}

  @Get('export')
  @ApiProduces('application/json', 'application/pdf')
  @ApiQuery({ name: 'format', required: false, enum: EXPORT_FORMATS, description: 'json (default) or pdf.' })
  @ApiOkResponse({
    type: ExportDocumentDto,
    description:
      'The caller’s full DSGVO export (Art. 15/20), assembled once and returned either as this JSON ' +
      'document (?format=json, the default) or as an equivalent German PDF-Bericht (?format=pdf, ' +
      'application/pdf, same fields, human-readable). Both branches append exactly one READ/export ' +
      'audit entry before the response is sent (ADR-0013).',
  })
  @ApiNotFoundResponse({ description: 'The caller has no better-auth account yet (a guest that never signed up).' })
  async exportAccount(
    @CurrentUser() userId: string,
    @Query() query: ExportQueryDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ExportDocumentDto | Buffer> {
    const document = await this.exportService.assemble(userId)
    if (!document) {
      // ADR-0013's contract describes "a signed-in account holder" — a guest session
      // that never created a real account has nothing to export yet. 404 over a
      // fabricated empty document: there genuinely is no account.
      throw new NotFoundException('No account exists for this session to export.')
    }

    const format: ExportFormat = query.format ?? 'json'
    const filenameDate = document.exportedAt.slice(0, 10) // YYYY-MM-DD

    if (format === 'pdf') {
      const pdf = await this.exportService.renderPdf(document)
      // Appended after rendering (so a render failure never logs a phantom access)
      // but before the response is sent (ADR-0013 §4/the AC's exact ordering).
      await this.exportService.recordExportRead(userId)
      reply.header('Content-Disposition', `attachment; filename="steuereule-export-${filenameDate}.pdf"`)
      reply.type('application/pdf')
      return pdf
    }

    await this.exportService.recordExportRead(userId)
    reply.header('Content-Disposition', `attachment; filename="steuereule-export-${filenameDate}.json"`)
    reply.type('application/json')
    return document
  }
}
