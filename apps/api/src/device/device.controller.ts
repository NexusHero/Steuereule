import { Controller, Inject, Post, Req } from '@nestjs/common'
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { DeviceCodeResponseDto } from './dto/device-code-response.dto.js'
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
}
