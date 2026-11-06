import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { MARITAL_STATUSES, isValidIban, isValidPostalCode, isValidDate, RELIGION_KEYS } from '@steuereule/core'
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, registerDecorator, type ValidationOptions } from 'class-validator'

function Fulfilled(predicate: (value: string) => boolean, message: string, options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'erfuellt',
      target: object.constructor,
      propertyName,
      options: { message, ...options },
      validator: { validate: (value: unknown) => typeof value === 'string' && predicate(value) },
    })
}

const TEXT = { type: String, nullable: true } as const

export class PutMasterDataDto {
  @ApiPropertyOptional({ ...TEXT, example: '1990-04-12', description: 'YYYY-MM-DD' })
  @IsOptional()
  @Fulfilled(isValidDate, 'geburtsdatum must be a real date (YYYY-MM-DD)')
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
  @Fulfilled(isValidPostalCode, 'plz must be exactly five digits')
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
    enum: RELIGION_KEYS,
    nullable: true,
    description: 'Religionsschlüssel per ESt 1 A guide (VD = none). Art. 9 DSGVO: requires religionConsent = true.',
  })
  @IsOptional()
  @IsIn(RELIGION_KEYS)
  religion?: string | null

  @ApiPropertyOptional({ type: Boolean, description: 'Explicit consent to store the religion (Art. 9 Abs. 2 lit. a DSGVO).' })
  @IsOptional()
  @IsBoolean()
  religionConsent?: boolean

  @ApiPropertyOptional({ enum: MARITAL_STATUSES, nullable: true })
  @IsOptional()
  @IsIn(MARITAL_STATUSES)
  familienstand?: string | null

  @ApiPropertyOptional({ ...TEXT, example: '2018-06-01', description: 'YYYY-MM-DD; not for ledig.' })
  @IsOptional()
  @Fulfilled(isValidDate, 'familienstandSeit must be a real date (YYYY-MM-DD)')
  familienstandSeit?: string | null

  @ApiPropertyOptional({ ...TEXT, example: 'DE89370400440532013000', description: 'Mod-97-checked; stored without spaces.' })
  @IsOptional()
  @Fulfilled(isValidIban, 'iban is not a valid IBAN')
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

export class MasterDataResponseDto {
  @ApiProperty(TEXT) geburtsdatum!: string | null
  @ApiProperty(TEXT) strasse!: string | null
  @ApiProperty(TEXT) hausnummer!: string | null
  @ApiProperty(TEXT) hausnummerZusatz!: string | null
  @ApiProperty(TEXT) plz!: string | null
  @ApiProperty(TEXT) wohnort!: string | null
  @ApiProperty(TEXT) beruf!: string | null
  @ApiProperty({ enum: RELIGION_KEYS, nullable: true }) religion!: string | null
  @ApiProperty({ enum: MARITAL_STATUSES, nullable: true }) familienstand!: string | null
  @ApiProperty(TEXT) familienstandSeit!: string | null
  @ApiProperty(TEXT) iban!: string | null
  @ApiProperty(TEXT) kontoinhaber!: string | null
  @ApiProperty(TEXT) finanzamt!: string | null
  @ApiProperty(TEXT) telefon!: string | null

  @ApiProperty({
    type: [String],
    description: 'Fields the Hauptvordruck needs that are still empty — the honest gap list for the Ausdruck.',
  })
  missing!: string[]
}
