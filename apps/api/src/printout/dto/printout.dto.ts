import { ApiProperty } from '@nestjs/swagger'

export class PrintoutCheckDto {
  @ApiProperty({
    type: [String],
    example: ['iban', 'anlageV'],
    description:
      'What stops the printout: missing Stammdaten keys, `ehegatte` (married, not yet supported), or an Anlage that is not printable yet (`anlageV`, `anlageKap`, `anlageNGre`, `anlageRAvBav`, `anlageRAus`). Empty = printable.',
  })
  missing!: string[]
}

export type PrintoutJobStatus = 'queued' | 'processing' | 'completed' | 'failed'

export class PrintoutJobDto {
  @ApiProperty({
    example: 'job_4bf92f3577b34da6a3ce929d0e0e4736',
    description: 'Unique asynchronous export job identifier.',
  })
  jobId!: string

  @ApiProperty({
    enum: ['queued', 'processing', 'completed', 'failed'],
    example: 'queued',
    description: 'Current state of the background PDF rendering job.',
  })
  status!: PrintoutJobStatus

  @ApiProperty({
    example: '/v1/steuerjahre/2025/ausdruck/jobs/job_4bf92f3577b34da6a3ce929d0e0e4736',
    description: 'Polling URL to check job progress.',
  })
  statusUrl!: string

  @ApiProperty({
    required: false,
    example: '/v1/steuerjahre/2025/ausdruck',
    description: 'Download URL when status is completed.',
  })
  downloadUrl?: string

  @ApiProperty({
    required: false,
    example: 'Error during PDF synthesis',
    description: 'Error explanation if job failed.',
  })
  error?: string
}
