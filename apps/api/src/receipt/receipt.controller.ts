import '@fastify/multipart'
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { RECEIPT_FOLDERS, isReceiptFolder, type ReceiptFolder } from '@steuereule/core'
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { Throttle } from '@nestjs/throttler'
import { FastifyThrottlerGuard } from '../advisor/advisor.controller.js'
import { InvalidInputError, PayloadTooLargeError } from '../common/domain-error.js'
import { ReceiptService } from './receipt.service.js'
import { UploadAdmission } from './upload-admission.js'
import { USER_ID_KIND_REQUEST_KEY, UserContextGuard, type RequestWithUserId } from '../auth/user-context.guard.js'
import { DeleteReceiptResponseDto, ReceiptPageResponseDto, ReceiptResponseDto } from './dto/receipt-response.dto.js'
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

/** A boolean query flag: absent is false; anything but `true`/`false` is refused rather than guessed. */
function parseBooleanQuery(raw: string | undefined, name: string): boolean {
  if (raw === undefined || raw === 'false') return false
  if (raw === 'true') return true
  throw new InvalidInputError('QUERY_BOOLEAN_INVALID', `"${name}" must be true or false.`)
}

const DEFAULT_PAGE_SIZE = 30
const MAX_PAGE_SIZE = 100

function parsePageSize(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_PAGE_SIZE
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new InvalidInputError('QUERY_LIMIT_INVALID', `"limit" must be a whole number from 1 to ${MAX_PAGE_SIZE}.`)
  }
  return value
}

function parseFolder(raw: string | undefined): ReceiptFolder | undefined {
  if (raw === undefined || raw === '') return undefined
  if (!isReceiptFolder(raw)) throw new InvalidInputError('QUERY_FOLDER_INVALID', `"ordner" must be one of ${RECEIPT_FOLDERS.join(', ')}.`)
  return raw
}

function isFileTooLargeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? (error as { code?: unknown }).code : undefined
  return code === 'FST_REQ_FILE_TOO_LARGE' || code === 'FST_FILES_LIMIT'
}

/** Receipt uploads per account (ADR-0106 D7): a busy scanning session stays well below it. */
export const RECEIPT_UPLOAD_THROTTLE = { ttl: 10 * 60_000, limit: 60 } as const

@ApiTags('belege')
@Controller('v1/belege')
@UseGuards(UserContextGuard)
export class ReceiptController {
  constructor(
    @Inject(ReceiptService) private readonly receiptService: ReceiptService,
    @Inject(UploadAdmission) private readonly admission: UploadAdmission,
  ) {}

  @Get()
  @ApiOperation({ summary: 'One page of the Beleg inbox, newest first, with the counts the inbox shows over all Belege' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: `Belege per page, 1 to ${MAX_PAGE_SIZE}; ${DEFAULT_PAGE_SIZE} without it.` })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: '`nextCursor` of the page before.' })
  @ApiQuery({ name: 'ordner', required: false, type: String, enum: RECEIPT_FOLDERS, description: 'Only the Belege of this folder; the counts still cover all of them.' })
  @ApiOkResponse({ type: ReceiptPageResponseDto })
  list(
    @CurrentUser() userId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('ordner') folder?: string,
  ): Promise<ReceiptPageResponseDto> {
    return this.receiptService.listPage(userId, { limit: parsePageSize(limit), cursor: cursor || undefined, folder: parseFolder(folder) })
  }

  @Post()
  // Per account (ADR-0108): the row cap bounds how many fileless Belege exist, this how fast they are made —
  // the fileless-create vector the quota (blobs only) and the upload throttle did not cover.
  @UseGuards(FastifyThrottlerGuard)
  @Throttle({ default: RECEIPT_UPLOAD_THROTTLE })
  @ApiBody({ type: CreateReceiptDto })
  @ApiCreatedResponse({ type: ReceiptResponseDto, description: 'The created, unbound Beleg with its derived Zuordnung.' })
  create(@CurrentUser() userId: string, @Body() dto: CreateReceiptDto): Promise<ReceiptResponseDto> {
    return this.receiptService.create(userId, dto)
  }

  @Post('upload')
  // Per account (ADR-0106 D7): the quota bounds what is kept, this how fast it fills.
  @UseGuards(FastifyThrottlerGuard)
  @Throttle({ default: RECEIPT_UPLOAD_THROTTLE })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: { type: 'string', description: 'Belegart (RECEIPT_TYPES), e.g. Geschaeftsbeleg.' },
        belegdatum: { type: 'string', example: '2025-03-14' },
        zahlungsdatum: { type: 'string', example: '2025-03-20' },
        direction: {
          type: 'string',
          enum: ['ausgabe', 'einnahme'],
          description: 'A business receipt (ADR-0101 §6): an expense or an invoice the business wrote. Files the Beleg as Geschaeftsbeleg; its parse drafts the booking in that direction.',
        },
      },
    },
  })
  @ApiCreatedResponse({
    type: ReceiptResponseDto,
    description:
      'Uploads and encrypts an original PDF/image receipt binary (max 10 MB) and creates the Beleg (`processing.state` `neu`). ' +
      'Every entry point then reads the file on the device and calls `POST /v1/belege/parse` with the returned `id` as `receiptId` ' +
      '(or with `deviceReadFailure` when the device cannot read it), so the Beleg reaches a state (ADR-0097 §4). ' +
      'A file the user uploaded before is still stored and comes back with `duplicateOf`.',
  })
  async upload(@CurrentUser() userId: string, @Req() req: FastifyRequest): Promise<ReceiptResponseDto> {
    const isMultipart = typeof req.isMultipart === 'function' ? req.isMultipart() : false
    if (!isMultipart) {
      throw new InvalidInputError('RECEIPT_MULTIPART_REQUIRED', 'Erwartet einen multipart/form-data Upload im Feld "file".')
    }

    // A guest is told apart by address: a guest id is minted afresh for every request without the cookie.
    const guest = (req as RequestWithUserId)[USER_ID_KIND_REQUEST_KEY] === 'guest'
    const address = req.ip ?? 'no-ip'
    const release = this.admission.acquire(guest ? `ip:${address}` : userId)
    try {
      const { part, buffer } = await this.readFile(req)
      if (guest) await this.admission.chargeGuest(address, buffer.length)
      return await this.receiptService.upload(userId, {
        buffer,
        fileName: part.filename || 'beleg',
        kind: readMultipartField(part.fields, 'kind'),
        belegdatum: readMultipartField(part.fields, 'belegdatum'),
        zahlungsdatum: readMultipartField(part.fields, 'zahlungsdatum'),
        direction: readMultipartField(part.fields, 'direction'),
      })
    } finally {
      release()
    }
  }

  private async readFile(req: FastifyRequest): Promise<{ part: NonNullable<Awaited<ReturnType<FastifyRequest['file']>>>; buffer: Buffer }> {
    try {
      const part = await req.file()
      if (!part) {
        throw new InvalidInputError('RECEIPT_FILE_MISSING', 'Keine Datei im Feld "file" gefunden.')
      }
      const buffer = await part.toBuffer()
      if (part.file.truncated) {
        throw new PayloadTooLargeError('RECEIPT_FILE_TOO_LARGE', 'Die Datei ist größer als das erlaubte Maximum von 10 MB.')
      }
      return { part, buffer }
    } catch (error) {
      if (error instanceof InvalidInputError) throw error
      if (isFileTooLargeError(error)) {
        throw new PayloadTooLargeError('RECEIPT_FILE_TOO_LARGE', 'Die Datei ist größer als das erlaubte Maximum von 10 MB.')
      }
      throw error
    }
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
    // An XML file is never rendered in the API's origin: a download, in a sandbox (ADR-0101 §22).
    const xml = file.mimeType === 'application/xml'
    void reply
      .header('Content-Type', file.mimeType)
      .header('Content-Disposition', `${xml ? 'attachment' : 'inline'}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'no-store')
    if (xml) void reply.header('Content-Security-Policy', "default-src 'none'; sandbox")
    void reply.send(file.buffer)
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
  @ApiQuery({
    name: 'takeBackValues',
    required: false,
    type: Boolean,
    description: 'First take back the values this Beleg filled (its `filledFields`, where a field still holds them) and withdraw its waiting drafts, in every tax year (ADR-0097 §6). Without it the values stay.',
  })
  @ApiOkResponse({ type: DeleteReceiptResponseDto, description: 'Deletes the Beleg and its encrypted original binary.' })
  @ApiNotFoundResponse({ description: 'No such Beleg for this account — nothing was deleted.' })
  delete(@CurrentUser() userId: string, @Param('id') id: string, @Query('takeBackValues') takeBackValues?: string): Promise<DeleteReceiptResponseDto> {
    return this.receiptService.delete(userId, id, { takeBackValues: parseBooleanQuery(takeBackValues, 'takeBackValues') })
  }
}
