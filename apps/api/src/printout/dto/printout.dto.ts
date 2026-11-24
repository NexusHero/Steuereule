import { ApiProperty } from '@nestjs/swagger'

export class PrintoutCheckDto {
  @ApiProperty({
    type: [String],
    example: ['iban', 'anlageV'],
    description:
      'What stops the printout: missing Stammdaten keys, `ehegatte` (married, not yet supported), or an Anlage that is not printable yet (`anlageV`, `anlageKap`, `anlageNGre`, `anlageRAvBav`, `anlageRAus`). Empty = printable.',
  })
  missing!: string[]

  @ApiProperty({
    type: [String],
    enum: ['child', 'taxId', 'kinship', 'familyBenefitsOffice', 'residence', 'otherParent'],
    example: ['taxId'],
    description:
      'Which details of the children are behind `kinder` in `missing`, so the hint names them: `child` = children were named but none is recorded, `residence` = whether the child lived in Germany all year, `otherParent` = the other parent. Empty without `kinder`.',
  })
  missingChildFields!: ('child' | 'taxId' | 'kinship' | 'familyBenefitsOffice' | 'residence' | 'otherParent')[]

  @ApiProperty({
    type: [String],
    example: ['iban'],
    description: 'Missing, but not stopping this printout: `iban` while the estimate is a payment over its whole range (an IBAN is only needed for a refund).',
  })
  hints!: string[]
}

export type PrintoutJobStatus = 'queued' | 'processing' | 'completed' | 'failed'

export class PrintoutJobDto {
  @ApiProperty({
    type: String,
    example: 'job_4bf92f3577b34da6a3ce929d0e0e4736',
    description: 'Unique asynchronous export job identifier.',
  })
  jobId!: string

  @ApiProperty({
    type: String,
    enum: ['queued', 'processing', 'completed', 'failed'],
    example: 'queued',
    description: 'Current state of the background PDF rendering job.',
  })
  status!: PrintoutJobStatus

  @ApiProperty({
    type: String,
    example: '/v1/steuerjahre/2025/ausdruck/jobs/job_4bf92f3577b34da6a3ce929d0e0e4736',
    description: 'Polling URL to check job progress.',
  })
  statusUrl!: string

  @ApiProperty({
    type: String,
    required: false,
    example: '/v1/steuerjahre/2025/ausdruck',
    description: 'Download URL when status is completed.',
  })
  downloadUrl?: string

  @ApiProperty({
    type: String,
    required: false,
    example: 'PRINTOUT_FAILED',
    description: 'Machine code if the job failed: a DomainError code, else PRINTOUT_FAILED. Never a raw message (API-5).',
  })
  error?: string
}

export class LiveFormInstanceDto {
  @ApiProperty({
    type: String,
    enum: ['A', 'B'],
    nullable: true,
    description: 'Whose copy it is when the form says so (Anlage N, R, KAP, N-Gre of a couple); null otherwise.',
  })
  readonly person!: 'A' | 'B' | null

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'kind_3f2a',
    description: 'The record behind a per-record form: the child (Anlage Kind) or the rental object (Anlage V); null otherwise.',
  })
  readonly entityId!: string | null

  @ApiProperty({
    type: Object,
    additionalProperties: { oneOf: [{ type: 'string' }, { type: 'boolean', enum: [true] }] },
    example: { 'anlN.personA': true, 'anlN.kz110': '42000' },
    description: 'The AcroForm field ids of this copy and what is printed in them; `true` = a cross.',
  })
  readonly values!: Readonly<Record<string, string | true>>

  @ApiProperty({
    type: Object,
    additionalProperties: { type: 'string' },
    example: { 'anlN.kz110': '5' },
    description: 'The Zeile each of these fields stands in on the Vordruck of this tax year; a box in the page head has none.',
  })
  readonly lines!: Readonly<Record<string, string>>
}

export class LiveFormDto {
  @ApiProperty({ type: String, example: 'anlage-n', description: 'The Vordruck id, as for `ausdruck/vorlage/:formular`.' })
  readonly formular!: string

  @ApiProperty({ type: [LiveFormInstanceDto], description: 'Every printed copy of this Vordruck, in print order.' })
  readonly instances!: readonly LiveFormInstanceDto[]
}

export class LiveFormValuesDto {
  @ApiProperty({ type: [LiveFormDto], description: 'The filled Vordrucke in print order; Vordrucke without values are left out.' })
  readonly forms!: readonly LiveFormDto[]
}
