/**
 * Whether this device can run the dictation model (#451 slice 5): WebGPU, enough memory, a
 * microphone API, Cache Storage and module workers. Otherwise the mic button stays hidden and
 * the step-1 hint is shown instead.
 */
export const MIN_DEVICE_MEMORY_GB = 4

export type DictationSupport = { readonly supported: true } | { readonly supported: false; readonly reason: 'no-webgpu' | 'low-memory' | 'no-microphone' | 'no-cache' }

interface GpuNavigator {
  readonly gpu?: { requestAdapter(): Promise<unknown> } | undefined
  readonly deviceMemory?: number | undefined
  readonly mediaDevices?: { getUserMedia?: unknown } | undefined
}

export async function detectDictationSupport(nav: GpuNavigator | undefined = globalThis.navigator as GpuNavigator | undefined): Promise<DictationSupport> {
  if (!nav?.gpu) return { supported: false, reason: 'no-webgpu' }
  const adapter = await nav.gpu.requestAdapter().catch(() => null)
  if (!adapter) return { supported: false, reason: 'no-webgpu' }
  // Safari reports no deviceMemory at all; only a known-small value hides the button.
  if (nav.deviceMemory !== undefined && nav.deviceMemory < MIN_DEVICE_MEMORY_GB) return { supported: false, reason: 'low-memory' }
  if (typeof nav.mediaDevices?.getUserMedia !== 'function') return { supported: false, reason: 'no-microphone' }
  if (typeof globalThis.caches === 'undefined' || typeof globalThis.Worker === 'undefined') return { supported: false, reason: 'no-cache' }
  return { supported: true }
}
