import { ApiProperty } from '@nestjs/swagger'
import { ArrayMaxSize, IsArray, IsBoolean, IsString, MaxLength } from 'class-validator'

export class HouseholdPersonDto {
  @ApiProperty({ type: String }) personId!: string
  @ApiProperty({ enum: ['spouse', 'child'] }) kind!: 'spouse' | 'child'
  @ApiProperty({ type: String }) firstName!: string
  @ApiProperty({ type: String }) lastName!: string
  @ApiProperty({ type: String, example: '2019-05-12' }) birthDate!: string
  @ApiProperty({ type: String, nullable: true, description: 'The year’s Kind row when the person is part of the year.' }) childId!: string | null
  @ApiProperty({ type: Boolean }) inThisYear!: boolean
  @ApiProperty({ type: Number, nullable: true, description: 'Last earlier year the person was part of („aus 2025“).' }) fromYear!: number | null
  @ApiProperty({ type: Boolean, description: 'Preselected for this year (last year’s people, children up to 25).' }) preselected!: boolean
  @ApiProperty({ type: Boolean }) selectable!: boolean
  @ApiProperty({ type: Boolean, description: 'From 18 the mask asks about education.' }) asksForEducation!: boolean
  @ApiProperty({ type: Number, nullable: true }) leftFromYear!: number | null
  @ApiProperty({ type: Boolean, description: 'The last change was made by the requesting account.' }) updatedBySelf!: boolean
  @ApiProperty({ type: String }) updatedAt!: string
}

class HouseholdCandidatePersonDto {
  @ApiProperty({ type: String }) personId!: string
  @ApiProperty({ type: String }) name!: string
  @ApiProperty({ type: String }) birthDate!: string
}

export class HouseholdCandidateDto {
  @ApiProperty({ type: String }) id!: string
  @ApiProperty({ type: HouseholdCandidatePersonDto }) a!: HouseholdCandidatePersonDto
  @ApiProperty({ type: HouseholdCandidatePersonDto }) b!: HouseholdCandidatePersonDto
}

class PartnerLinkDto {
  @ApiProperty({ type: Number }) validFromYear!: number
  @ApiProperty({ type: Number, nullable: true }) endedFromYear!: number | null
  @ApiProperty({ type: Boolean }) ownAccount!: boolean
}

export class HouseholdResponseDto {
  @ApiProperty({ type: String }) householdUserId!: string
  @ApiProperty({ type: [HouseholdPersonDto] }) persons!: HouseholdPersonDto[]
  @ApiProperty({ type: [HouseholdCandidateDto] }) candidates!: HouseholdCandidateDto[]
  @ApiProperty({ type: PartnerLinkDto, nullable: true }) partnerLink!: PartnerLinkDto | null
}

export class AdoptChildrenDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  personIds!: string[]
}

export class AnswerCandidateDto {
  @ApiProperty({ type: Boolean, description: 'true = the same person (merge), false = two people' })
  @IsBoolean()
  same!: boolean
}
