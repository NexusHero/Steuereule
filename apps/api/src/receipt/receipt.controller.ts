import '@fastify/multipart'
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req, Res, UseGuards } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { InvalidInputError } from '../common/domain-error.js'
import { ReceiptService } from './receipt.service.js'
import { DeleteReceiptResponseDto, ReceiptResponseDto } from './dto/receipt-response.dto.js'
import { CreateReceiptDto } from './dto/create-receipt.dto.js'
import { SetAssignmentDto } from './dto/set-assignment.dto.js'

function readMultipartField(fields: unknown, name: string): string | undefined {
  if (!fields || typeof fields !== 'object') return undefined
  const entry = (fields as Record<string, unknown>)[name]
  const item = Array.isArray(entry) ? entry[0] : entry
  if (!item || typeof item !== 'object') return undefined
  if ('type' in item && item.type === 'field' && 'value' in item && typeof item.value === 'string') {
    const trimmed = item.value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  return undefined
}

function isFileTooLargeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? (error as { code?: unknown }).code : undefined
  return code === 'FST_REQ_FILE_TOO_LARGE' || code === 'FST_FILES_LIMIT'
}

@ApiTags('belege')
@Controller('v1/belege')
@UseGuards(UserContextGuard)
export class ReceiptController {
  constructor(@Inject(ReceiptService) private readonly receiptService: ReceiptService) {}

  @Get()
  @ApiOkResponse({ type: ReceiptResponseDto, isArray: true, description: 'The caller’s Beleg inbox, newest first.' })
  list(@CurrentUser() userId: string): Promise<ReceiptResponseDto[]> {
    return this.receiptService.list(userId)
  }

  @Post()
  @ApiBody({ type: CreateReceiptDto })
  @ApiCreatedResponse({ type: ReceiptResponseDto, description: 'The created, unbound Beleg with its derived Zuordnung.' })
  create(@CurrentUser() userId: string, @Body() dto: CreateReceiptDto): Promise<ReceiptResponseDto> {
    return this.receiptService.create(userId, dto)
  }

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({
    type: ReceiptResponseDto,
    description: 'Uploads and encrypts an original PDF/image receipt binary (max 10 MB) and creates the Beleg.',
  })
  async upload(@CurrentUser() userId: string, @Req() req: FastifyRequest): Promise<ReceiptResponseDto> {
    const isMultipart = typeof req.isMultipart === 'function' ? req.isMultipart() : false
    if (!isMultipart) {
      throw new InvalidInputError('RECEIPT_MULTIPART_REQUIRED', 'Erwartet einen multipart/form-data Upload im Feld "file".')
    }

    let part: Awaited<ReturnType<FastifyRequest['file']>>
    let buffer: Buffer
    try {
      part = await req.file()
      if (!part) {
        throw new InvalidInputError('RECEIPT_FILE_MISSING', 'Keine Datei im Feld "file" gefunden.')
      }
      buffer = await part.toBuffer()
      if (part.file.truncated) {
        throw new InvalidInputError('RECEIPT_FILE_TOO_LARGE', 'Die Datei ist größer als das erlaubte Maximum von 10 MB.')
      }
    } catch (error) {
      if (error instanceof InvalidInputError) throw error
      if (isFileTooLargeError(error)) {
        throw new InvalidInputError('RECEIPT_FILE_TOO_LARGE', 'Die Datei ist größer als das erlaubte Maximum von 10 MB.')
      }
      throw error
    }

    return this.receiptService.upload(userId, {
      buffer,
      fileName: part.filename || 'beleg',
      kind: readMultipartField(part.fields, 'kind'),
      belegdatum: readMultipartField(part.fields, 'belegdatum'),
      zahlungsdatum: readMultipartField(part.fields, 'zahlungsdatum'),
    })
  }

  @Get(':id/datei')
  @ApiExcludeEndpoint()
  async downloadFile(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    const file = await this.receiptService.getFile(userId, id)
    const asciiName = file.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'beleg'
    const encodedName = encodeURIComponent(file.fileName)
    void reply
      .header('Content-Type', file.mimeType)
      .header('Content-Disposition', `inline; filename="${asciiName}"; filename*=UTF-8''${encodedName}`)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'no-store')
      .send(file.buffer)
  }

  @Post(':id/zuordnung')
  @HttpCode(200)
  @ApiParam({ name: 'id', type: String, description: 'The Beleg id (the caller’s own).' })
  @ApiBody({ type: SetAssignmentDto })
  @ApiOkResponse({ type: ReceiptResponseDto, description: 'The Beleg with its confirmed year and derived Zuordnung.' })
  @ApiNotFoundResponse({ description: 'No such Beleg for this account — nothing was persisted.' })
  setAssignment(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: SetAssignmentDto,
  ): Promise<ReceiptResponseDto> {
    return this.receiptService.setAssignment(userId, id, dto)
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiParam({ name: 'id', type: String, description: 'The Beleg id (the caller’s own).' })
  @ApiOkResponse({ type: DeleteReceiptResponseDto, description: 'Deletes the Beleg and its encrypted original binary.' })
  @ApiNotFoundResponse({ description: 'No such Beleg for this account — nothing was deleted.' })
  delete(@CurrentUser() userId: string, @Param('id') id: string): Promise<DeleteReceiptResponseDto> {
    return this.receiptService.delete(userId, id)
  }
}
