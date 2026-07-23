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
  // Explicit token: the toolchain (tsx/esbuild for dev+prod, Vitest/esbuild for
  // tests) does not emit TypeScript's `design:paramtypes` metadata the way `tsc`
  // does, so Nest's implicit type-based constructor injection silently resolves to
  // undefined. An explicit @Inject() token sidesteps that entirely.
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
  // Explicit @ApiBody(): Nest's Swagger plugin otherwise infers the request body schema
  // from the reflected `design:paramtypes` metadata on `dto`, which — like the constructor
  // injection and @ApiProperty() types noted above — is metadata esbuild/tsx never emit.
  // Without this, the generated OpenAPI document (and therefore the frontend's orval
  // client) silently loses the request body on PUT under any non-tsc/SWC toolchain.
  @ApiBody({ type: PutProfileDto })
  @ApiOkResponse({ type: ProfileResponseDto, description: 'The saved profile, echoed back.' })
  @ApiBadRequestResponse({ type: ValidationErrorDto, description: 'Payload failed server-side validation; nothing was persisted.' })
  putProfile(@CurrentUser() userId: string, @Body() dto: PutProfileDto): Promise<ProfileResponseDto> {
    return this.profileService.saveProfile(userId, dto)
  }
}
