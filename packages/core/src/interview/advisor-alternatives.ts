// Drafts that exclude each other: two ways to fill the same thing, of which the user picks one.
// Two drafts are alternatives when they share an explicit `alternativeGroup` (the two paths of a
// comparison) or when they write the same field of the same person and record. Applying them
// together would let the second silently overwrite the first, or count one fact twice.
import type { AdvisorActionProposal, AdvisorTwoPathsProposal } from './advisor'

type DraftTarget = Pick<AdvisorActionProposal, 'screen' | 'field' | 'instance' | 'person' | 'alternativeGroup'>

/** The key under which drafts exclude each other: the explicit group, or else the field they write. */
export function alternativeKeyOf(draft: DraftTarget): string {
  if (draft.alternativeGroup !== undefined && draft.alternativeGroup !== '') return `group:${draft.alternativeGroup}`
  return `field:${draft.person ?? 'A'}|${draft.screen}|${draft.field}|${draft.instance ?? ''}`
}

/** Both paths of a comparison carry one group, also when the stored proposal predates the field. */
export function withTwoPathsGroup(twoPaths: AdvisorTwoPathsProposal): AdvisorTwoPathsProposal {
  const group = twoPaths.safePath.alternativeGroup ?? twoPaths.maxPath.alternativeGroup ?? twoPaths.safePath.actionId
  return {
    ...twoPaths,
    safePath: { ...twoPaths.safePath, alternativeGroup: group },
    maxPath: { ...twoPaths.maxPath, alternativeGroup: group },
  }
}

/** Groups of two or more drafts in the list that exclude each other; empty when all may go together. */
export function conflictingAlternatives<T extends DraftTarget>(drafts: readonly T[]): readonly (readonly T[])[] {
  const byKey = new Map<string, T[]>()
  for (const draft of drafts) {
    const key = alternativeKeyOf(draft)
    byKey.set(key, [...(byKey.get(key) ?? []), draft])
  }
  return [...byKey.values()].filter((group) => group.length > 1)
}

/** The drafts left once `chosen` is applied: its alternatives drop out, everything else stays. */
export function withoutAlternativesOf<T extends DraftTarget & Pick<AdvisorActionProposal, 'actionId'>>(
  drafts: readonly T[],
  chosen: T,
): readonly T[] {
  const key = alternativeKeyOf(chosen)
  return drafts.filter((draft) => draft.actionId !== chosen.actionId && alternativeKeyOf(draft) !== key)
}
