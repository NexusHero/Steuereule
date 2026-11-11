import { Inject, Injectable } from '@nestjs/common'
import type { AddressSearchRequestDto, AddressSearchResponseDto } from './dto/address-search.dto.js'
import type { StreetIndex } from './street-index.js'
import { STREET_INDEX } from './street-index.provider.js'

/** Address search on our own server (ADR-0064): the query is answered from memory and stored nowhere. */
@Injectable()
export class AddressService {
  constructor(@Inject(STREET_INDEX) private readonly index: StreetIndex | null) {}

  search(request: AddressSearchRequestDto): AddressSearchResponseDto {
    if (this.index === null) return { available: false, houseNumber: null, hits: [] }
    const result = this.index.search(request.query, request.postalCode ? { postalCode: request.postalCode } : {})
    return { available: true, houseNumber: result.houseNumber, hits: [...result.hits] }
  }
}
