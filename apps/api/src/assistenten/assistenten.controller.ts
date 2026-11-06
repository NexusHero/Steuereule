import { Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Query, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse, ApiForbiddenResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { ForbidAssistant } from '../auth/forbid-assistant.guard.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { AssistantsService } from './assistenten.service.js'
import {
  OauthClientInfoDto,
  RevokeAssistantResponseDto,
  ConnectedAssistantDto,
} from './dto/assistenten.dto.js'

@ApiTags('assistenten')
@Controller('v1')
@UseGuards(UserContextGuard)
export class AssistantsController {
  constructor(@Inject(AssistantsService) private readonly service: AssistantsService) {}

  @Get('assistenten')
  @RequiresAccount()
  @ForbidAssistant()
  @ApiOkResponse({ type: [ConnectedAssistantDto], description: 'List of connected AI assistants (ADR-0052 §10).' })
  @ApiUnauthorizedResponse({ description: 'Requires signed-in account.' })
  @ApiForbiddenResponse({ description: 'Assistants cannot manage assistant connections.' })
  listConnected(@CurrentUser() userId: string): Promise<ConnectedAssistantDto[]> {
    return this.service.listConnected(userId)
  }

  @Delete('assistenten/:clientId')
  @HttpCode(200)
  @RequiresAccount()
  @ForbidAssistant()
  @ApiParam({ name: 'clientId', type: String, example: 'client_xyz' })
  @ApiOkResponse({ type: RevokeAssistantResponseDto, description: 'Revokes connection to the assistant with immediate effect.' })
  @ApiUnauthorizedResponse({ description: 'Requires signed-in account.' })
  @ApiForbiddenResponse({ description: 'Assistants cannot revoke connections.' })
  async revoke(
    @CurrentUser() userId: string,
    @Param('clientId') clientId: string,
  ): Promise<RevokeAssistantResponseDto> {
    await this.service.revoke(userId, clientId)
    return { success: true }
  }

  @Get('oauth/client-info')
  @ApiQuery({ name: 'clientId', type: String, example: 'client_xyz' })
  @ApiOkResponse({ type: OauthClientInfoDto, description: 'Public client metadata for the OAuth consent screen.' })
  async getClientInfo(@Query('clientId') clientId: string): Promise<OauthClientInfoDto> {
    const info = await this.service.getClientInfo(clientId)
    if (!info) {
      throw new NotFoundException(`OAuth client ${clientId} not found.`)
    }
    return info
  }
}
