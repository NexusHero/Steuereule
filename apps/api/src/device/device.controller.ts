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
  // Explicit token — see the comment on ProfileController's constructor.
  constructor(@Inject(DeviceService) private readonly deviceService: DeviceService) {}

  // No @UseGuards(UserContextGuard) — see device.service.ts's header comment: the
  // desktop calling this has no identity of its own yet.
  @Post('code')
  // @nestjs/throttler, IP-keyed, 60s/10 (write-amplification bound, PR #239). The
  // guard runs on the raw socket peer unless `trustProxy` is configured — see
  // main.ts / resolveTrustedProxies for the single config source both this and
  // better-auth consume.
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

  // No @UseGuards(UserContextGuard) either — this is called by the *phone*, whose
  // session (if any) is read directly from its forwarded cookies by
  // auth.api.deviceVerify() inside the service. A phone with no session at all can
  // still call this (AC-2's no-session detour): the code simply stays unclaimed.
  @Get('pending')
  // @nestjs/throttler, IP-keyed, 60s/10 (the code-guessing surface, ADR-0024).
  @Throttle({ default: DEVICE_PENDING_THROTTLE })
  @UseGuards(ThrottlerGuard)
  // Explicit @ApiQuery(): Nest's Swagger plugin otherwise infers a @Query() DTO's shape
  // from reflected `design:paramtypes` metadata, which esbuild/tsx never emit (same gap
  // ProfileController's @ApiBody() comment documents for request bodies) — without this
  // the generated OpenAPI document (and therefore orval's client) silently loses the
  // `userCode` parameter, leaving callers with no way to pass it at all.
  @ApiQuery({ name: 'userCode', type: String, required: true, example: 'K7QX-9F2M' })
  @ApiOkResponse({ type: DevicePendingResponseDto, description: 'The match-verification payload for a pending device-authorization request (ADR-0024).' })
  getPending(@Query() query: DevicePendingQueryDto, @Req() request: FastifyRequest): Promise<DevicePendingResponseDto> {
    return this.deviceService.getPending(query.userCode, fromNodeHeaders(request.headers))
  }

  // No @UseGuards(UserContextGuard) — the plugin's own deviceApprove already
  // enforces "must be a real, matching account session" (see device.service.ts).
  // UserContextGuard would silently mint a guest session for an unauthenticated
  // caller instead of rejecting it, which is exactly the wrong behaviour here.
  @Post('approve')
  @HttpCode(200)
  // Explicit @ApiBody() — see ProfileController's PUT for why: esbuild/tsx never emit
  // the `design:paramtypes` metadata Nest's Swagger plugin would otherwise infer the
  // body schema from, and without it the generated document (and orval's client) loses
  // the request body silently.
  @ApiBody({ type: ApproveDeviceRequestDto })
  @ApiOkResponse({ type: AckResponseDto, description: 'Approves the device-authorization request (ADR-0024) — one tap, no session-scope choice.' })
  async approve(@Body() dto: ApproveDeviceRequestDto, @Req() request: FastifyRequest): Promise<AckResponseDto> {
    await this.deviceService.approve(dto.userCode, fromNodeHeaders(request.headers))
    return { success: true }
  }

  // No @UseGuards(UserContextGuard) — the desktop calling this has no identity of
  // its own; its only credential is the device_code itself (RFC 8628).
  @Post('token')
  @HttpCode(200)
  // Explicit @ApiBody() — same gap as `approve` above.
  @ApiBody({ type: DeviceTokenRequestDto })
  @ApiOkResponse({ type: AckResponseDto, description: 'Exchanges an approved device code for a real session, set as an httpOnly cookie (ADR-0008/0012) — never returned in the response body.' })
  async exchangeToken(
    @Body() dto: DeviceTokenRequestDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AckResponseDto> {
    const result = await this.deviceService.exchangeToken(dto.deviceCode, fromNodeHeaders(request.headers))
    // better-auth's own `setSessionCookie` already produced the full, signed
    // `Set-Cookie` value(s) (via the device-session-cookie plugin) — write them to
    // the response verbatim, never re-serialising or re-signing here.
    for (const cookie of result.setCookies) {
      reply.raw.appendHeader('set-cookie', cookie)
    }
    return { success: true }
  }
}
