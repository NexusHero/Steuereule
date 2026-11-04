import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res, UseGuards } from '@nestjs/common'
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { fromNodeHeaders } from 'better-auth/node'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { DEVICE_CODE_THROTTLE, DEVICE_PENDING_THROTTLE } from '../rate-limit/rate-limit.js'
import { AckResponseDto } from './dto/ack-response.dto.js'
import { ApproveDeviceRequestDto } from './dto/approve-device-request.dto.js'
import { DeviceCodeResponseDto } from './dto/device-code-response.dto.js'
import { DevicePendingQueryDto } from './dto/device-pending-query.dto.js'
import { DevicePendingResponseDto } from './dto/device-pending-response.dto.js'
import { DeviceTokenRequestDto } from './dto/device-token-request.dto.js'
import { DeviceService } from './device.service.js'

@ApiTags('device')
@Controller('v1/device')
export class DeviceController {
  constructor(@Inject(DeviceService) private readonly deviceService: DeviceService) {}

  @Post('code')
  @Throttle({ default: DEVICE_CODE_THROTTLE })
  @UseGuards(ThrottlerGuard)
  @ApiCreatedResponse({ type: DeviceCodeResponseDto, description: 'A freshly minted device/user code pair, valid for 2 minutes (ADR-0024).' })
  requestCode(@Req() request: FastifyRequest): Promise<DeviceCodeResponseDto> {
    const userAgentHeader = request.headers['user-agent']
    return this.deviceService.requestCode({
      userAgent: Array.isArray(userAgentHeader) ? (userAgentHeader[0] ?? null) : (userAgentHeader ?? null),
      ip: request.ip ?? null,
    })
  }

  @Get('pending')
  @Throttle({ default: DEVICE_PENDING_THROTTLE })
  @UseGuards(ThrottlerGuard)
  @ApiQuery({ name: 'userCode', type: String, required: true, example: 'K7QX-9F2M' })
  @ApiOkResponse({ type: DevicePendingResponseDto, description: 'The match-verification payload for a pending device-authorization request (ADR-0024).' })
  getPending(@Query() query: DevicePendingQueryDto, @Req() request: FastifyRequest): Promise<DevicePendingResponseDto> {
    return this.deviceService.getPending(query.userCode, fromNodeHeaders(request.headers))
  }

  @Post('approve')
  @HttpCode(200)
  @ApiBody({ type: ApproveDeviceRequestDto })
  @ApiOkResponse({ type: AckResponseDto, description: 'Approves the device-authorization request (ADR-0024) — one tap, no session-scope choice.' })
  async approve(@Body() dto: ApproveDeviceRequestDto, @Req() request: FastifyRequest): Promise<AckResponseDto> {
    await this.deviceService.approve(dto.userCode, fromNodeHeaders(request.headers))
    return { success: true }
  }

  @Post('token')
  @HttpCode(200)
  @ApiBody({ type: DeviceTokenRequestDto })
  @ApiOkResponse({ type: AckResponseDto, description: 'Exchanges an approved device code for a real session, set as an httpOnly cookie (ADR-0008/0012) — never returned in the response body.' })
  async exchangeToken(
    @Body() dto: DeviceTokenRequestDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AckResponseDto> {
    const result = await this.deviceService.exchangeToken(dto.deviceCode, fromNodeHeaders(request.headers))
    for (const cookie of result.setCookies) {
      reply.raw.appendHeader('set-cookie', cookie)
    }
    return { success: true }
  }
}
