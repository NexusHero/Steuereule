import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deleteDictationModel: vi.fn(async () => {}),
  ensureDictationModel: vi.fn(async () => {}),
  isDictationModelCached: vi.fn(async () => true),
  startRecording: vi.fn(async () => ({ stop: async () => new Float32Array(1), cancel: () => {} })),
  detectDictationSupport: vi.fn(async () => ({ supported: true as const })),
  disposeTranscriber: vi.fn(),
  transcribe: vi.fn(async () => 'hallo'),
}))
vi.mock('./modelStore', () => ({
  deleteDictationModel: mocks.deleteDictationModel,
  ensureDictationModel: mocks.ensureDictationModel,
  isDictationModelCached: mocks.isDictationModelCached,
}))
vi.mock('./recorder', () => ({ startRecording: mocks.startRecording }))
vi.mock('./support', () => ({ detectDictationSupport: mocks.detectDictationSupport }))
vi.mock('./transcriber', () => ({ disposeTranscriber: mocks.disposeTranscriber, transcribe: mocks.transcribe }))

import { browserDictationEngine } from './engine'

describe('browserDictationEngine', () => {
  it('delegates every capability to its own module', async () => {
    const progress = vi.fn()
    expect(await browserDictationEngine.support()).toEqual({ supported: true })
    expect(await browserDictationEngine.isModelCached()).toBe(true)
    await browserDictationEngine.downloadModel(progress)
    expect(mocks.ensureDictationModel).toHaveBeenCalledWith(progress)
    await browserDictationEngine.record()
    expect(mocks.startRecording).toHaveBeenCalled()
    const audio = new Float32Array(2)
    expect(await browserDictationEngine.transcribe(audio)).toBe('hallo')
    expect(mocks.transcribe).toHaveBeenCalledWith(audio)
  })

  it('stops the worker before it deletes the model, so nothing keeps it loaded', async () => {
    await browserDictationEngine.deleteModel()
    expect(mocks.disposeTranscriber).toHaveBeenCalled()
    expect(mocks.deleteDictationModel).toHaveBeenCalled()
    expect(mocks.disposeTranscriber.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteDictationModel.mock.invocationCallOrder[0]!)
  })
})
