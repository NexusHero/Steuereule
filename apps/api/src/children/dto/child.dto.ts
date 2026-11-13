import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { OTHER_CHILD_RELATIONSHIPS, OTHER_PARENT_STATUSES, CHILD_RELATIONSHIPS } from '@steuereule/core'
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

/** The Anlage-Kind facts beyond the child's identity — optional on write. */
class ChildDetailsDto {
  @ApiPropertyOptional({ enum: CHILD_RELATIONSHIPS, nullable: true, description: 'Kz 02: 1 = leiblich/adoptiert, 2 = Pflegekind, 3 = Enkel-/Stiefkind' })
  @IsOptional()
  @IsIn(CHILD_RELATIONSHIPS)
  kinship?: string | null

  @ApiPropertyOptional({ enum: CHILD_RELATIONSHIPS, nullable: true, description: 'Kz 03, to the spouse — only for a joint return' })
  @IsOptional()
  @IsIn(CHILD_RELATIONSHIPS)
  kinshipB?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Familienkasse Sachsen' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  familyBenefitsOffice?: string | null

  @ApiPropertyOptional({ type: Boolean, nullable: true, description: 'The child lived in Germany all year (Zeile 8).' })
  @IsOptional()
  @IsBoolean()
  domesticResidenceAllYear?: boolean | null

  @ApiPropertyOptional({ enum: OTHER_PARENT_STATUSES, nullable: true, description: 'The other parent outside this return (Zeilen 11–15).' })
  @IsOptional()
  @IsIn(OTHER_PARENT_STATUSES)
  otherParent?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Muster, Max' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  otherParentName?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '1984-02-11' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  otherParentBirthDate?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Hauptstraße 3, 01067 Dresden' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  otherParentAddress?: string | null

  @ApiPropertyOptional({ enum: OTHER_CHILD_RELATIONSHIPS, nullable: true })
  @IsOptional()
  @IsIn(OTHER_CHILD_RELATIONSHIPS)
  otherParentKind?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '2025-06-30' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  otherParentDiedOn?: string | null

  @ApiPropertyOptional({ type: Boolean, nullable: true, description: 'Zeile 45: the child was registered with the filer all year.' })
  @IsOptional()
  @IsBoolean()
  registeredWithMeAllYear?: boolean | null

  @ApiPropertyOptional({ type: Boolean, nullable: true, description: 'Zeile 46: the Kindergeld was paid to the filer all year.' })
  @IsOptional()
  @IsBoolean()
  childBenefitToMeAllYear?: boolean | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '1080', description: 'Zeile 27 (Kz 66): KV Basisabsicherung of the child paid by the parents, whole euros.' })
  @IsOptional()
  @Matches(/^\d{1,7}$/)
  healthBasicEur?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '0', description: 'Zeile 28 (Kz 67): PV of the child paid by the parents, whole euros.' })
  @IsOptional()
  @Matches(/^\d{1,7}$/)
  careEur?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '2748', description: 'Zeile 6 (Kz 15): Schweizer Kinderzulage / Familienzulage in whole EUR.' })
  @IsOptional()
  @Matches(/^\d{1,7}$/)
  swissFamilyAllowanceEur?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '739', description: 'Zeile 67 (Kz 51): childcare the parents paid, whole euros (ADR-0076).' })
  @IsOptional()
  @Matches(/^\d{1,7}$/)
  childcareEur?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Kindergarten, Gemeinde Musterdorf, Hauptstr. 1', description: 'Zeile 67: kind of service, provider name and address.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  childcareProvider?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '01.01.2025', description: 'Zeile 67: from (DD.MM.YYYY).' })
  @IsOptional()
  @Matches(/^\d{2}\.\d{2}\.\d{4}$/)
  childcareFrom?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '31.12.2025', description: 'Zeile 67: until (DD.MM.YYYY).' })
  @IsOptional()
  @Matches(/^\d{2}\.\d{2}\.\d{4}$/)
  childcareTo?: string | null
}

export class CreateChildDto extends ChildDetailsDto {
  @ApiProperty({ type: String, example: 'Lina' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  firstName!: string

  @ApiProperty({ type: String, example: 'Muster' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  lastName!: string

  @ApiProperty({ type: String, example: '2018-05-12', description: 'ISO date YYYY-MM-DD' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  geburtsdatum!: string

  @ApiPropertyOptional({ type: String, example: '12345678901' })
  @IsOptional()
  @IsString()
  @MaxLength(11)
  taxId?: string

  @ApiPropertyOptional({ type: String, example: '3000' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  childBenefitClaimEur?: string
}

export class UpdateChildDto extends ChildDetailsDto {
  @ApiPropertyOptional({ type: String, example: 'Lina' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string

  @ApiPropertyOptional({ type: String, example: 'Muster' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string

  @ApiPropertyOptional({ type: String, example: '2018-05-12' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  geburtsdatum?: string

  @ApiPropertyOptional({ type: String, example: '12345678901' })
  @IsOptional()
  @IsString()
  @MaxLength(11)
  taxId?: string

  @ApiPropertyOptional({ type: String, example: '3000' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  childBenefitClaimEur?: string
}

export class ChildResponseDto {
  @ApiProperty({ type: String, example: 'uuid' })
  id!: string

  @ApiProperty({ type: Number, example: 1 })
  sequenceNumber!: number

  @ApiProperty({ type: String, example: 'Lina' })
  firstName!: string

  @ApiProperty({ type: String, example: 'Muster' })
  lastName!: string

  @ApiProperty({ type: String, example: '2018-05-12' })
  geburtsdatum!: string

  @ApiPropertyOptional({ type: String, nullable: true, example: '12345678901' })
  taxId?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '3000' })
  childBenefitClaimEur?: string | null

  @ApiProperty({ enum: CHILD_RELATIONSHIPS, nullable: true })
  kinship!: string | null

  @ApiProperty({ enum: CHILD_RELATIONSHIPS, nullable: true })
  kinshipB!: string | null

  @ApiProperty({ type: String, nullable: true })
  familyBenefitsOffice!: string | null

  @ApiProperty({ type: Boolean, nullable: true })
  domesticResidenceAllYear!: boolean | null

  @ApiProperty({ enum: OTHER_PARENT_STATUSES, nullable: true })
  otherParent!: string | null

  @ApiProperty({ type: String, nullable: true })
  otherParentName!: string | null

  @ApiProperty({ type: String, nullable: true })
  otherParentBirthDate!: string | null

  @ApiProperty({ type: String, nullable: true })
  otherParentAddress!: string | null

  @ApiProperty({ enum: OTHER_CHILD_RELATIONSHIPS, nullable: true })
  otherParentKind!: string | null

  @ApiProperty({ type: String, nullable: true })
  otherParentDiedOn!: string | null

  @ApiProperty({ type: Boolean, nullable: true })
  registeredWithMeAllYear!: boolean | null

  @ApiProperty({ type: Boolean, nullable: true })
  childBenefitToMeAllYear!: boolean | null

  @ApiProperty({ type: String, nullable: true })
  healthBasicEur!: string | null

  @ApiProperty({ type: String, nullable: true })
  careEur!: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '2748', description: 'Zeile 6 (Kz 15): Schweizer Kinderzulage in whole EUR.' })
  swissFamilyAllowanceEur?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  childcareEur?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  childcareProvider?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  childcareFrom?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  childcareTo?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '312', description: 'Differenz-Kindergeld der deutschen Familienkasse in whole EUR.' })
  differentialChildBenefitEur?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '3060', description: 'Gesamtanspruch auf Kindergeld oder vergleichbare Leistungen (Zeile 6).' })
  totalClaimEur?: string | null
}

export class ChildrenResponseDto {
  @ApiProperty({ type: [ChildResponseDto] })
  kinder!: ChildResponseDto[]

  @ApiProperty({ type: Number, example: 1 })
  count!: number

  @ApiProperty({ type: Number, example: 3000 })
  childBenefitSum!: number

  @ApiProperty({ type: Number, example: 9600 })
  totalAllowance!: number

  @ApiProperty({ type: Number, example: 5496, description: 'Summe der Schweizer Kinderzulagen in EUR.' })
  swissFamilyAllowanceSum!: number

  @ApiProperty({ type: Number, example: 624, description: 'Summe des Differenz-Kindergeldes in EUR.' })
  differentialChildBenefitSum!: number
}
