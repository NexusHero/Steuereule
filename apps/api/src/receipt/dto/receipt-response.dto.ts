import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { RECEIPT_PROCESSING_STATES, RECEIPT_READ_REASONS, SCREENS, type ReceiptProcessingState, type ReceiptReadReason, type Screen } from '@steuereule/core'
import { AssignmentDto } from './assignment.dto.js'

/** What became of a Beleg (ADR-0097 §1): derived by core's `receiptProcessingFromFacts`, never stored. */
export class ReceiptProcessingDto {
  @ApiProperty({
    type: String,
    enum: RECEIPT_PROCESSING_STATES,
    example: 'vorschlaege',
    description: '`neu` not read yet · `nicht_lesbar` reading failed · `vorschlaege` at least one draft waits · `uebernommen` all decided, at least one taken over · `nichts_verwertbar` read, nothing for the return · `verworfen` all drafts dismissed.',
  })
  state!: ReceiptProcessingState

  @ApiProperty({
    type: String,
    enum: RECEIPT_READ_REASONS,
    nullable: true,
    example: 'keine_rechnung',
    description: 'Why the read found nothing or failed (for `nicht_lesbar`, `nichts_verwertbar`, and `neu` after its drafts were removed: `entwuerfe_fehlen`); null otherwise. The app words it.',
  })
  reason!: ReceiptReadReason | null

  @ApiProperty({ type: Number, example: 1, description: 'Drafts of this Beleg still waiting, over every tax year.' })
  pending!: number

  @ApiProperty({ type: Number, example: 0, description: 'Drafts of this Beleg taken over.' })
  applied!: number

  @ApiProperty({ type: Number, example: 0, description: 'Drafts of this Beleg decided without being taken over (dismissed, undone, superseded).' })
  dismissed!: number

  @ApiProperty({ type: Number, nullable: true, example: 2024, description: 'The tax year its drafts sit in. When it is not the open year, say „liegt im Steuerjahr 2024“ with a link to switch.' })
  draftsTaxYear!: number | null

  @ApiProperty({ type: Boolean, example: true, description: 'Not yet fully processed (`neu`, `nicht_lesbar`, `vorschlaege`): the Belege tab counts these as „offen“.' })
  open!: boolean
}

/** A field this Beleg filled: one of its drafts the user took over (ADR-0097 §6). */
export class ReceiptFilledFieldDto {
  @ApiProperty({ type: String, example: 'act-1', description: 'The draft that wrote it.' })
  actionId!: string

  @ApiProperty({ type: Number, example: 2025 })
  taxYear!: number

  @ApiProperty({ type: String, enum: SCREENS, example: 'interview' })
  screen!: Screen

  @ApiProperty({ type: String, example: 'spenden-betrag' })
  field!: string

  @ApiProperty({ type: String, nullable: true, example: null, description: 'The row of a repeated record (a child id), null for a plain field.' })
  instance!: string | null

  @ApiProperty({ type: String, enum: ['A', 'B'], example: 'A', description: 'Whose field: `B` is the spouse.' })
  person!: 'A' | 'B'

  @ApiProperty({ type: String, example: 'Spendenbeleg', description: 'The draft’s label, for „Dieser Beleg hat Spenden … gefüllt“.' })
  label!: string

  @ApiProperty({ type: String, example: '3135', description: 'The raw value the draft wrote (an amount in whole units, `Ja`, a date). For a sum field taken „zusätzlich“ it is the field’s new total. Formatted by the client.' })
  value!: string
}

/** The Beleg the same file was uploaded as before (ADR-0097 §7). */
export class ReceiptDuplicateDto {
  @ApiProperty({ type: String, example: 'b1' })
  id!: string

  @ApiProperty({ type: String, example: 'spende-2024.pdf', description: 'Its file name (decrypted for the owner).' })
  fileName!: string

  @ApiProperty({ type: String, example: '2026-11-18T09:12:00.000Z', description: 'When it was uploaded (ISO timestamp).' })
  uploadedAt!: string
}

/** Response shape for the Beleg endpoints. */
export class ReceiptResponseDto {
  @ApiProperty({ type: String, example: 'b1' })
  id!: string

  @ApiProperty({ type: String, example: 'miete-januar.pdf', description: 'Original filename (decrypted for the owner).' })
  fileName!: string

  @ApiProperty({ type: String, nullable: true, example: 'Lohnausweis', description: 'Document type (ADR-029) — null is the generic receipt.' })
  kind!: string | null

  @ApiProperty({ type: String, nullable: true, example: '2025-12-20', description: 'Invoice date (ISO yyyy-mm-dd).' })
  belegdatum!: string | null

  @ApiProperty({ type: String, nullable: true, example: '2026-01-15', description: 'Payment date (ISO yyyy-mm-dd).' })
  zahlungsdatum!: string | null

  // Optional on the wire only so older client fixtures stay valid; the server always sends it.
  @ApiPropertyOptional({ enum: ['ausgabe', 'einnahme'], nullable: true, description: 'A business receipt (ADR-0101 §6): expense or an invoice the business wrote; null for every other Beleg (always present).' })
  direction?: 'ausgabe' | 'einnahme' | null

  @ApiProperty({ type: Boolean, example: true, description: 'Whether an encrypted original document binary is attached.' })
  hasFile!: boolean

  @ApiProperty({ type: String, nullable: true, example: 'application/pdf', description: 'Sniffed MIME type when a binary file is attached.' })
  mimeType!: string | null

  @ApiProperty({ type: Number, nullable: true, example: 142850, description: 'Original file size in bytes when attached.' })
  byteLength!: number | null

  @ApiProperty({ type: AssignmentDto, description: '@steuereule/core’s zuordnungAusDaten — never recomputed elsewhere.' })
  assignment!: AssignmentDto

  @ApiProperty({ type: [String], example: ['B'], description: 'Whose document it is (ADR-0092): `A`, `B` or `kind:<child id>`, the holder first, then the people a multi-person document was also taken over for. Empty while nobody is chosen.' })
  holders!: string[]

  @ApiProperty({ type: Number, nullable: true, example: 2025, description: 'The tax year the holders refer to (B and the children are per year).' })
  holderTaxYear!: number | null

  @ApiProperty({ type: ReceiptProcessingDto, description: 'What became of the Beleg (ADR-0097), derived from its last read and its drafts in every tax year.' })
  processing!: ReceiptProcessingDto

  @ApiProperty({
    type: [ReceiptFilledFieldDto],
    description: 'The fields this Beleg filled (its drafts taken over), over every tax year. This is also what `DELETE /v1/belege/{id}?takeBackValues=true` takes back, where a field still holds the value; `processing.pending` drafts are withdrawn with it.',
  })
  filledFields!: ReceiptFilledFieldDto[]

  @ApiProperty({ type: ReceiptDuplicateDto, nullable: true, description: 'The older Beleg with the same file content (per-user content key), when this one is a duplicate; null otherwise. Parsing a duplicate stages no drafts unless `allowDuplicate` is sent.' })
  duplicateOf!: ReceiptDuplicateDto | null
}

export class DeleteReceiptResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  deleted!: boolean

  @ApiProperty({ type: Number, example: 1, description: 'Values taken back from the return (only with `takeBackValues=true`; a value changed since stays).' })
  takenBack!: number

  @ApiProperty({ type: Number, example: 0, description: 'Waiting drafts of the Beleg withdrawn (only with `takeBackValues=true`).' })
  withdrawn!: number
}

export class ReceiptFolderCountsDto {
  @ApiProperty({ type: Number, example: 3, description: 'Belege in the folder Einkünfte (Lohnausweis, Quellensteuer, Rentenbezugsmitteilung, Familienzulage).' })
  einkuenfte!: number

  @ApiProperty({ type: Number, example: 1, description: 'Belege in the folder Vorsorge (Pensionskasse, Säule 3a, Krankenkasse).' })
  vorsorge!: number

  @ApiProperty({ type: Number, example: 0, description: 'Belege in the folder Bescheide (Steuerbescheid, Steuerbescheinigung).' })
  bescheide!: number

  @ApiProperty({ type: Number, example: 5, description: 'Every other Beleg, one without a kind included.' })
  weitere!: number
}

export class ReceiptProposalDto {
  @ApiProperty({ type: String, example: 'b1f6c9a0-0f5e-4a52-9a43-7d0c4d3b2e10' })
  id!: string

  @ApiProperty({ type: Number, example: 2025, description: 'The tax year the Beleg is proposed for.' })
  taxYear!: number
}

export class ReceiptCountsDto {
  @ApiProperty({ type: Number, example: 9, description: 'Every Beleg of the caller, whatever page or folder is shown.' })
  total!: number

  @ApiProperty({ type: Number, example: 2, description: 'Belege not fully processed yet (`processing.open`), over all of them.' })
  open!: number

  @ApiProperty({ type: Number, example: 4, description: 'Belege whose tax year is not confirmed yet: no year, only proposed, or in conflict.' })
  unassigned!: number

  @ApiProperty({ type: ReceiptFolderCountsDto })
  folders!: ReceiptFolderCountsDto

  @ApiProperty({ type: [ReceiptProposalDto], description: 'Every Beleg whose year is only proposed and waits for a yes, over all of them: what one tap on „alle zuordnen“ takes.' })
  proposals!: ReceiptProposalDto[]
}

export class ReceiptPageResponseDto {
  @ApiProperty({ type: [ReceiptResponseDto], description: 'One page of the Beleg inbox, newest first.' })
  items!: ReceiptResponseDto[]

  @ApiProperty({ type: String, nullable: true, example: 'eyJ0IjoiMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaIiwiaSI6ImFiYyJ9', description: 'Pass it as `cursor` for the next page; null on the last one. Opaque: do not build or read it.' })
  nextCursor!: string | null

  @ApiProperty({ type: ReceiptCountsDto, description: 'The numbers the inbox shows, counted over all Belege and not just this page.' })
  counts!: ReceiptCountsDto
}
