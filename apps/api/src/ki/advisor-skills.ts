import type { AdvisorSkillId } from '@steuereule/core'
import { ADVISOR_SKILL_TEXTS } from './skills.generated.js'

/**
 * What the model is told while a skill is on: the instructions of `apps/api/skills/<id>/SKILL.md`.
 * The skill decides how the owl works, not what she may do: drafts, notes and every rule of the
 * stable prompt stay as they are.
 */
export function skillPrompt(skill: AdvisorSkillId): string {
  return ADVISOR_SKILL_TEXTS[skill]
}
