import { ApiProperty } from '@nestjs/swagger'

export class AusdruckPruefungDto {
  @ApiProperty({
    type: [String],
    example: ['iban', 'anlageV'],
    description:
      'What stops the printout: missing Stammdaten keys, `ehegatte` (married, not yet supported), or an Anlage that is not printable yet (`anlageV`, `anlageKap`, `anlageNGre`, `anlageRAvBav`, `anlageRAus`). Empty = printable.',
  })
  fehlend!: string[]
}
