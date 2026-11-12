import { Body, Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBody, ApiOkResponse, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { accountKeyedTracker, ADDRESS_SEARCH_THROTTLE } from '../rate-limit/rate-limit.js'
import { AddressService } from './address.service.js'
import { AddressSearchRequestDto, AddressSearchResponseDto } from './dto/address-search.dto.js'

@ApiTags('adressen')
@Controller('v1/adressen')
@UseGuards(UserContextGuard)
export class AddressController {
  constructor(@Inject(AddressService) private readonly service: AddressService) {}

  // POST, not GET: what the user types is part of an address and must not end up in URLs,
  // access logs or a proxy cache.
  @Post('suche')
  @HttpCode(200)
  @Throttle({ default: { ...ADDRESS_SEARCH_THROTTLE, getTracker: accountKeyedTracker } })
  @UseGuards(ThrottlerGuard)
  @ApiBody({ type: AddressSearchRequestDto })
  @ApiOkResponse({ type: AddressSearchResponseDto, description: 'Up to eight streets; `available: false` when no street data is installed.' })
  @ApiBadRequestResponse({ description: 'Query missing or too long, or a postal code that is not five digits.' })
  @ApiTooManyRequestsResponse({ description: 'Too many searches in a short time.' })
  search(@Body() dto: AddressSearchRequestDto): AddressSearchResponseDto {
    return this.service.search(dto)
  }
}
