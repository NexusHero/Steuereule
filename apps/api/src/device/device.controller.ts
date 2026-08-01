import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common'
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger'
import { fromNodeHeaders } from 'better-auth/node'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { SESSION_COOKIE_ATTRIBUTES } from '../auth/better-auth.js'
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
  @ApiCreatedResponse({ type: DeviceCodeResponseDto, description: 'A freshly minted device/user code pair, valid for 2 minutes (ADR-0024).' })
  requestCode(@Req() request: FastifyRequest): Promise<DeviceCodeResponseDto> {
    const userAgentHeader = request.headers['user-agent']
    return this.deviceService.requestCode({
      userAgent: Array.isArray(userAgentHeader) ? (userAgentHeader[0] ?? null) : (userAgentHeader ?? null),
      // Fastify's own `request.ip` (raw socket peer, no `trustProxy` configured yet)
      // — a known, out-of-scope-for-#238 limitation behind a reverse proxy (the
      // deployed demo would need `trustProxy` + a trusted `X-Forwarded-For` reader to
      // see the real client address); tracked as a deployment follow-up, not silently
      // presented as solved here. Wrong/proxy-shaped IPs still resolve safely — task
      // 0b's RegionResolver treats anything private/unroutable as "unknown", never a
      // guess.
      ip: request.ip ?? null,
    })
  }

  // No @UseGuards(UserContextGuard) either — this is called by the *phone*, whose
  // session (if any) is read directly from its forwarded cookies by
  // auth.api.deviceVerify() inside the service. A phone with no session at all can
  // still call this (AC-2's no-session detour): the code simply stays unclaimed.
  @Get('pending')
  // Explicit @ApiQuery(): Nest's Swagger plugin otherwise infers a @Query() DTO's shape
  // from reflected `design:paramtypes` metadata, which esbuild/tsx never emit (same gap
  // ProfileController's @ApiBody() comment documents for request bodies) — without this
  // the generated OpenAPI document (and therefore orval's client) silently loses the
  // `userCode` parameter, leaving callers with no way to pass it at all.
  @ApiQuery({ name: 'userCode', type: String, required: true, example: 'K7QX-9F2M' })
  @ApiOkResponse({ type: DevicePendingResponseDto, description: 'The match-verification payload for a pending device-authorization request (ADR-0024).' })
  getPending(@Query() query: DevicePendingQueryDto, @Req() request: FastifyRequest): Promise<DevicePendingResponseDto> {
    return this.deviceService.getPending(query.userCode, fromNodeHeaders(request.headers), request.ip ?? null)
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
    reply.setCookie(result.cookieName, result.cookieValue, { ...SESSION_COOKIE_ATTRIBUTES, maxAge: result.maxAge })
    return { success: true }
  }
}
