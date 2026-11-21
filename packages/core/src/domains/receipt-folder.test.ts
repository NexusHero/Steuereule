import { describe, expect, it } from 'vitest'
import { RECEIPT_TYPES } from './receipt-type'
import { RECEIPT_FOLDER_KINDS, isReceiptFolder, receiptFolderOfKind } from './receipt-folder'

describe('receiptFolderOfKind', () => {
  it('files each document kind in its folder', () => {
    expect(receiptFolderOfKind('Lohnausweis')).toBe('einkuenfte')
    expect(receiptFolderOfKind('Saeule3a')).toBe('vorsorge')
    expect(receiptFolderOfKind('Steuerbescheid')).toBe('bescheide')
  })

  it('puts a Beleg without a kind, and the generic kinds, into weitere', () => {
    expect(receiptFolderOfKind(null)).toBe('weitere')
    expect(receiptFolderOfKind(undefined)).toBe('weitere')
    expect(receiptFolderOfKind('Sonstiges')).toBe('weitere')
    expect(receiptFolderOfKind('Geschaeftsbeleg')).toBe('weitere')
  })

  it('never lists a kind in two folders and only lists known kinds', () => {
    const listed = Object.values(RECEIPT_FOLDER_KINDS).flat()
    expect(new Set(listed).size).toBe(listed.length)
    for (const kind of listed) expect(RECEIPT_TYPES).toContain(kind)
  })

  it('recognises a folder name', () => {
    expect(isReceiptFolder('vorsorge')).toBe(true)
    expect(isReceiptFolder('alle')).toBe(false)
  })
})
