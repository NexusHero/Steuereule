// The filter chips of the structured preview: the row count and the sections a chip shows.
import type { GlassFormSection } from './glassFormTypes'

/** The chip that shows every section. */
export const ALL_SECTIONS = 'alle'

export function countRows(sections: readonly GlassFormSection[]): number {
  return sections.reduce((sum, s) => sum + s.rows.length, 0)
}

export function visibleSectionsFor(sections: readonly GlassFormSection[], activeFilter: string): readonly GlassFormSection[] {
  return activeFilter === ALL_SECTIONS ? sections : sections.filter((s) => s.formId === activeFilter)
}
