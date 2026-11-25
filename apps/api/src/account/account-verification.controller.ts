import { Controller, Get, Inject, NotFoundException, UseGuards } from '@nestjs/common'
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { AccountVerificationService } from './account-verification.service.js'
import { AccountVerificationDto } from './dto/account-verification.dto.js'

@ApiTags('account')
@Controller('v1/account')
@UseGuards(UserContextGuard)
export class AccountVerificationController {
  constructor(@Inject(AccountVerificationService) private readonly service: AccountVerificationService) {}

  @Get('verification')
  @ApiOkResponse({ type: AccountVerificationDto, description: 'ADR-0030: the banner of a never-verified account shows the date no sooner than which it is deleted.' })
  @ApiNotFoundResponse({ description: 'A guest: there is no account to confirm.' })
  async verification(@CurrentUser() userId: string): Promise<AccountVerificationDto> {
    const status = await this.service.status(userId)
    if (!status) throw new NotFoundException()
    return status
  }
}
