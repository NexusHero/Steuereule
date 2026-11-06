import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class LstbConflictDto {
  @ApiProperty({
    type: String,
    enum: ['lohnsteuer-uebersteigt-brutto', 'sozialversicherung-uebersteigt-brutto'],
    example: 'lohnsteuer-uebersteigt-brutto',
  })
  art!: 'lohnsteuer-uebersteigt-brutto' | 'sozialversicherung-uebersteigt-brutto'

  @ApiPropertyOptional({ type: Number, description: 'The einbehaltene Lohnsteuer (only when art is lohnsteuer-uebersteigt-brutto).' })
  lohnsteuer?: number

  @ApiPropertyOptional({ type: Number, description: 'The Bruttoarbeitslohn (both arts).' })
  bruttoarbeitslohn?: number

  @ApiPropertyOptional({ type: Number, description: 'The SV-Arbeitnehmeranteil (only when art is sozialversicherung-uebersteigt-brutto).' })
  sozialversicherung?: number
}
