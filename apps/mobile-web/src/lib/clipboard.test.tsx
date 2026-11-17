import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

describe('copyText', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('writes the text to the clipboard where there is one', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await copyText('ABCD-1234')
    expect(writeText).toHaveBeenCalledWith('ABCD-1234')
  })

  it('does nothing without a browser clipboard (native)', async () => {
    vi.stubGlobal('navigator', undefined)
    await expect(copyText('ABCD-1234')).resolves.toBeUndefined()
    vi.stubGlobal('navigator', {})
    await expect(copyText('ABCD-1234')).resolves.toBeUndefined()
  })

  it('swallows a refused write: the code stays visible to type', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    await expect(copyText('ABCD-1234')).resolves.toBeUndefined()
  })
})
