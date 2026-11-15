import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsOptional, Min } from 'class-validator'

/** LStB Zeile 24 a–c (ADR-0090): optional, null = not entered. */
export class LstbSubsidiesDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 5072,
    description: 'Zeile 24 a–c: steuerfreie Arbeitgeberzuschüsse zur Kranken- und Pflegeversicherung, zusammen, ganze Euro.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  zuschuesseKvPv!: number | null
}
