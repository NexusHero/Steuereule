// The euro effect of the fallback's drafts from the app's own estimate (K3): the chat names the
// figure the cockpit would show after „Übernehmen“, and none while the estimate cannot say.
import type { AdvisorActionProposal, AdvisorMessageMeta } from './advisor'
import type { AdvisorPreviewEffect, AdvisorPreviewTarget } from './ki-port'

export type AdvisorEffectPreview = (target: AdvisorPreviewTarget) => Promise<AdvisorPreviewEffect>

const UNAVAILABLE: AdvisorPreviewEffect = { kind: 'not-computable', hint: 'Die Wirkung lässt sich gerade nicht berechnen.' }

/** One draft with the estimate's before/after/delta, or marked open with the estimate's reason. */
export async function withPreviewedEffect<T extends AdvisorActionProposal>(draft: T, preview: AdvisorEffectPreview): Promise<T> {
  let effect: AdvisorPreviewEffect
  try {
    effect = await preview({
      screen: draft.screen,
      instance: draft.instance,
      ...(draft.person ? { person: draft.person } : {}),
      values: [...Object.entries(draft.companionFields ?? {}), [draft.field, draft.newValue]],
    })
  } catch {
    effect = UNAVAILABLE
  }
  const { effectHint: _previousHint, ...rest } = draft
  if (effect.kind === 'computed') {
    return { ...rest, beforeRefundEur: effect.beforeRefundEur, afterRefundEur: effect.afterRefundEur, deltaEur: effect.deltaEur, effect: 'computed' } as T
  }
  return { ...rest, beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0, effect: 'not-computable', effectHint: effect.hint } as T
}

/**
 * Every draft of a fallback answer with its effect from the estimate. Without a preview (no
 * database behind the engine) the drafts keep what the rules gave them.
 */
export async function withPreviewedEffects(meta: AdvisorMessageMeta, preview: AdvisorEffectPreview | undefined): Promise<AdvisorMessageMeta> {
  if (!preview) return meta
  return {
    ...meta,
    ...(meta.action ? { action: await withPreviewedEffect(meta.action, preview) } : {}),
    ...(meta.actions ? { actions: await Promise.all(meta.actions.map((a) => withPreviewedEffect(a, preview))) } : {}),
    ...(meta.twoPaths
      ? {
          twoPaths: {
            ...meta.twoPaths,
            safePath: await withPreviewedEffect(meta.twoPaths.safePath, preview),
            maxPath: await withPreviewedEffect(meta.twoPaths.maxPath, preview),
          },
        }
      : {}),
  }
}
