import { deleteDictationModel, ensureDictationModel, isDictationModelCached } from './modelStore'
import { startRecording, type Recording } from './recorder'
import { detectDictationSupport, type DictationSupport } from './support'
import { disposeTranscriber, transcribe } from './transcriber'

/** Everything the mic button needs, behind one seam so the UI can be tested without a browser GPU. */
export interface DictationEngine {
  support(): Promise<DictationSupport>
  isModelCached(): Promise<boolean>
  downloadModel(onProgress: (loaded: number, total: number) => void): Promise<void>
  record(): Promise<Recording>
  transcribe(audio: Float32Array): Promise<string>
  deleteModel(): Promise<void>
}

export const browserDictationEngine: DictationEngine = {
  support: () => detectDictationSupport(),
  isModelCached: () => isDictationModelCached(),
  downloadModel: (onProgress) => ensureDictationModel(onProgress),
  record: () => startRecording(),
  transcribe: (audio) => transcribe(audio),
  deleteModel: async () => {
    disposeTranscriber()
    await deleteDictationModel()
  },
}
