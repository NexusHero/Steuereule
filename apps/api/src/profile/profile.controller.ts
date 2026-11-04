import { Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiBadRequestResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ProfileResponseDto } from './dto/profile-response.dto.js'
import { PutProfileDto } from './dto/put-profile.dto.js'
import { ValidationErrorDto } from './dto/validation-error.dto.js'
import { ProfileService } from './profile.service.js'

@ApiTags('profile')
@Controller('v1/profile')
@UseGuards(UserContextGuard)
export class ProfileController {
  constructor(@Inject(ProfileService) private readonly profileService: ProfileService) {}

  @Get()
  @ApiOkResponse({
    type: ProfileResponseDto,
    description: 'The caller’s saved profile, or an all-null default if none was saved yet.',
  })
  getProfile(@CurrentUser() userId: string): Promise<ProfileResponseDto> {
    return this.profileService.getProfile(userId)
  }

  @Put()
  @ApiBody({ type: PutProfileDto })
  @ApiOkResponse({ type: ProfileResponseDto, description: 'The saved profile, echoed back.' })
  @ApiBadRequestResponse({ type: ValidationErrorDto, description: 'Payload failed server-side validation; nothing was persisted.' })
  putProfile(@CurrentUser() userId: string, @Body() dto: PutProfileDto): Promise<ProfileResponseDto> {
    return this.profileService.saveProfile(userId, dto)
  }
}
