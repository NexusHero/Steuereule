import { Controller, Get, HttpCode, Inject, ServiceUnavailableException } from '@nestjs/common'
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger'
import { HealthStatusDto } from './dto/health-status.dto.js'
import { HealthService } from './health.service.js'

/** Liveness/readiness endpoints for k3s on Hetzner. */
@ApiTags('health')
@Controller('v1/health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get('live')
  @HttpCode(200)
  @ApiOkResponse({ type: HealthStatusDto, description: 'The process is running.' })
  live(): HealthStatusDto {
    return { status: 'ok' }
  }

  @Get('ready')
  @ApiOkResponse({ type: HealthStatusDto, description: 'The database is reachable.' })
  @ApiServiceUnavailableResponse({ type: HealthStatusDto, description: 'The database is not reachable.' })
  async ready(): Promise<HealthStatusDto> {
    const reachable = await this.healthService.isDatabaseReachable()
    if (!reachable) {
      throw new ServiceUnavailableException({ status: 'error' })
    }
    return { status: 'ok' }
  }
}
