import { PRODUCT_LIMITS } from '@steuereule/core'

/**
 * What the multipart parser accepts before any route sees the upload: one file of at most the receipt
 * limit the texts print. `main.ts` and the test app register the parser with these, so the parser can
 * never cut an upload at another size than `MAX_RECEIPT_FILE_BYTES` checks.
 */
export const MULTIPART_LIMITS = {
  fileSize: PRODUCT_LIMITS.receiptFileBytes,
  files: 1,
  fields: 10,
} as const
