import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { FAMILIENSTAENDE, istGueltigeIban, istGueltigePlz, istGueltigesDatum, RELIGIONSSCHLUESSEL } from '@steuereule/core'
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, registerDecorator, type ValidationOptions } from 'class-validator'

/** Wraps a pure @steuereule/core predicate as a class-validator rule (one rule, one source). */
function Erfuellt(praedikat: (wert: string) => boolean, meldung: string, options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'erfuellt',
      target: object.constructor,
      propertyName,
      options: { message: meldung, ...options },
      validator: { validate: (wert: unknown) => typeof wert === 'string' && praedikat(wert) },
    })
}

const TEXT = { type: String, nullable: true } as const

export class PutStammdatenDto {
  @ApiPropertyOptional({ ...TEXT, example: '1990-04-12', description: 'YYYY-MM-DD' })
  @IsOptional()
  @Erfuellt(istGueltigesDatum, 'geburtsdatum must be a real date (YYYY-MM-DD)')
  geburtsdatum?: string | null

  @ApiPropertyOptional({ ...TEXT, example: 'Musterstraße' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  strasse?: string | null

  @ApiPropertyOptional({ ...TEXT, example: '12' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  hausnummer?: string | null

  @ApiPropertyOptional({ ...TEXT, example: 'a' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  hausnummerZusatz?: string | null

  @ApiPropertyOptional({ ...TEXT, example: '01067', description: 'Five digits (Inland).' })
  @IsOptional()
  @Erfuellt(istGueltigePlz, 'plz must be exactly five digits')
  plz?: string | null

  @ApiPropertyOptional({ ...TEXT, example: 'Dresden' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  wohnort?: string | null

  @ApiPropertyOptional({ ...TEXT, example: 'Ingenieurin' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  beruf?: string | null

  @ApiPropertyOptional({
    enum: RELIGIONSSCHLUESSEL,
    nullable: true,
    description: 'Religionsschlüssel per ESt 1 A guide (VD = none). Art. 9 DSGVO: requires religionEinwilligung = true.',
  })
  @IsOptional()
  @IsIn(RELIGIONSSCHLUESSEL)
  religion?: string | null

  @ApiPropertyOptional({ type: Boolean, description: 'Explicit consent to store the religion (Art. 9 Abs. 2 lit. a DSGVO).' })
  @IsOptional()
  @IsBoolean()
  religionEinwilligung?: boolean

  @ApiPropertyOptional({ enum: FAMILIENSTAENDE, nullable: true })
  @IsOptional()
  @IsIn(FAMILIENSTAENDE)
  familienstand?: string | null

  @ApiPropertyOptional({ ...TEXT, example: '2018-06-01', description: 'YYYY-MM-DD; not for ledig.' })
  @IsOptional()
  @Erfuellt(istGueltigesDatum, 'familienstandSeit must be a real date (YYYY-MM-DD)')
  familienstandSeit?: string | null

  @ApiPropertyOptional({ ...TEXT, example: 'DE89370400440532013000', description: 'Mod-97-checked; stored without spaces.' })
  @IsOptional()
  @Erfuellt(istGueltigeIban, 'iban is not a valid IBAN')
  iban?: string | null

  @ApiPropertyOptional({ ...TEXT, example: 'Anna Beispiel', description: 'Only when the account holder is someone else.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  kontoinhaber?: string | null

  @ApiPropertyOptional({ ...TEXT, example: 'Dresden-Nord' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  finanzamt?: string | null

  @ApiPropertyOptional({ ...TEXT, example: '0351 1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefon?: string | null
}

export class StammdatenResponseDto {
  @ApiProperty(TEXT) geburtsdatum!: string | null
  @ApiProperty(TEXT) strasse!: string | null
  @ApiProperty(TEXT) hausnummer!: string | null
  @ApiProperty(TEXT) hausnummerZusatz!: string | null
  @ApiProperty(TEXT) plz!: string | null
  @ApiProperty(TEXT) wohnort!: string | null
  @ApiProperty(TEXT) beruf!: string | null
  @ApiProperty({ enum: RELIGIONSSCHLUESSEL, nullable: true }) religion!: string | null
  @ApiProperty({ enum: FAMILIENSTAENDE, nullable: true }) familienstand!: string | null
  @ApiProperty(TEXT) familienstandSeit!: string | null
  @ApiProperty(TEXT) iban!: string | null
  @ApiProperty(TEXT) kontoinhaber!: string | null
  @ApiProperty(TEXT) finanzamt!: string | null
  @ApiProperty(TEXT) telefon!: string | null

  @ApiProperty({
    type: [String],
    description: 'Fields the Hauptvordruck needs that are still empty — the honest gap list for the Ausdruck.',
  })
  fehlend!: string[]
}
