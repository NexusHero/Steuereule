import { Injectable } from '@nestjs/common'
import type { DocumentKind, ParseReceiptDto, ParseReceiptResponseDto } from '../dto/parse-receipt.dto.js'

/**
 * One parser per document kind (#444). The receipt module owns the seam; vertical modules
 * (e.g. `lstb-scan`) register their strategy, so the receipt module never depends on them.
 */
export interface DocumentParseStrategy {
  readonly kind: DocumentKind
  parse(userId: string, dto: ParseReceiptDto): Promise<ParseReceiptResponseDto>
}

@Injectable()
export class DocumentParseRegistry {
  private readonly strategies = new Map<DocumentKind, DocumentParseStrategy>()

  register(strategy: DocumentParseStrategy): void {
    if (this.strategies.has(strategy.kind)) {
      throw new Error(`A document parse strategy for kind "${strategy.kind}" is already registered.`)
    }
    this.strategies.set(strategy.kind, strategy)
  }

  resolve(kind: DocumentKind): DocumentParseStrategy | null {
    return this.strategies.get(kind) ?? null
  }
}
