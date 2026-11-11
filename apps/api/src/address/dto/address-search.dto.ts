import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator'

export class AddressSearchRequestDto {
  @ApiProperty({ type: String, example: 'Hauptstr. 12, Köln', description: 'Street, optionally followed by house number and place or postal code.' })
  @IsString()
  @MaxLength(120)
  query!: string

  @ApiPropertyOptional({ type: String, example: '50667', description: 'Postal code the form already holds; its streets are listed first.' })
  @IsOptional()
  @Matches(/^\d{5}$/, { message: 'postalCode must be five digits' })
  postalCode?: string
}

export class AddressHitDto {
  @ApiProperty({ type: String, example: 'Hauptstraße' })
  street!: string

  @ApiProperty({ type: String, example: '50667' })
  postalCode!: string

  @ApiProperty({ type: String, example: 'Köln' })
  city!: string

  @ApiProperty({ type: String, nullable: true, example: 'NW', description: 'Bundesland code, null when unknown.' })
  state!: string | null
}

export class AddressSearchResponseDto {
  @ApiProperty({ type: Boolean, description: 'False when this deployment has no street data installed; `hits` is then always empty.' })
  available!: boolean

  @ApiProperty({ type: String, nullable: true, example: '12', description: 'House number found in the query, for the form to take over.' })
  houseNumber!: string | null

  @ApiProperty({ type: [AddressHitDto] })
  hits!: AddressHitDto[]
}
