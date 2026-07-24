// GET /v1/account/export?format=json|pdf (ADR-0013 §4, REQ-011).
// Behind UserContextGuard — userId from @CurrentUser() only, never a client-asserted id.
// Single route, representation selected by ?format= query param (ADR-0013 §6: chosen
// over Accept content-negotiation because browser file-download <a href> cannot set
// Accept headers reliably).
import { Controller, Get, Inject, Query, Res, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ExportJsonResponseDto } from './dto/export.dto.js'
import { ExportService, type ExportFormat, type ExportResult } from './export.service.js'

@ApiTags('account')
@Controller('v1/account')
@UseGuards(UserContextGuard)
export class ExportController {
  constructor(@Inject(ExportService) private readonly exportService: ExportService) {}

  @Get('export')
  @ApiOperation({
    summary: 'Export all user data (DSGVO Art. 15/20) as JSON or PDF-Bericht.',
    description:
      "Assembles the full export document — profile, account identity, and own audit log — and returns it as JSON (machine-readable, Art. 20) or PDF (human-readable German report). Secrets (password hash, session/verification tokens, other users' data) are never included.",
  })
  @ApiQuery({
    name: 'format',
    type: String,
    required: false,
    enum: ['json', 'pdf'],
    description:
      'Export representation: "json" (default, machine-readable) or "pdf" (human-readable German report).',
  })
  @ApiOkResponse({
    description:
      'JSON export document (application/json) with Content-Disposition attachment header, or PDF report (application/pdf).',
    type: ExportJsonResponseDto,
  })
  async exportData(
    @CurrentUser() userId: string,
    @Query('format') format: ExportFormat = 'json',
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ExportJsonResponseDto | Buffer> {
    const result: ExportResult = await this.exportService.exportData(userId, format)

    // Set Content-Type and Content-Disposition per ADR-0013 §4 frozen contract.
    reply.header('Content-Type', result.contentType)
    reply.header('Content-Disposition', `attachment; filename="${result.filename}"`)

    if (Buffer.isBuffer(result.body)) {
      return result.body
    }

    return result.body as ExportJsonResponseDto
  }
}
