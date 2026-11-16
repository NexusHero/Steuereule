import { FORM_ORDER, forYear, type FieldSet, type FieldValues } from './form-renderer.js'

/** One printed copy of a Vordruck, with the person and record its values belong to. */
export interface LiveFormInstance {
  /** Whose copy it is when the form says so (`*.personA` / `*.personB`), else null. */
  readonly person: 'A' | 'B' | null
  /** The record behind a per-record form (a child, a rental object), else null. */
  readonly entityId: string | null
  readonly values: FieldValues
}

export interface LiveForm {
  readonly formular: string
  readonly instances: readonly LiveFormInstance[]
}

/** The record ids per form, in the order printout-values.ts builds that form's instances. */
export type EntityIds = Readonly<Record<string, readonly string[]>>

function personOf(values: FieldValues): 'A' | 'B' | null {
  const keys = Object.keys(values)
  if (keys.some((id) => id.endsWith('.personB') && values[id] === true)) return 'B'
  if (keys.some((id) => id.endsWith('.personA') && values[id] === true)) return 'A'
  return null
}

/**
 * Splits the printout values into the copies the renderer prints, exactly as `renderForms` does:
 * a form with instances prints those, any other form prints the shared values that belong to it.
 */
export function liveForms(
  year: number,
  fieldSet: FieldSet,
  values: FieldValues,
  instances: Readonly<Record<string, readonly FieldValues[]>> | undefined,
  entityIds: EntityIds,
): LiveForm[] {
  const formOf = new Map(fieldSet.felder.map((field) => [field.id, field.formular]))
  const onForm = (formular: string, source: FieldValues): FieldValues =>
    Object.fromEntries(Object.entries(forYear(year, source)).filter(([id]) => formOf.get(id) === formular))

  const forms: LiveForm[] = []
  for (const formular of FORM_ORDER) {
    if (!(formular in fieldSet.vorlagen)) continue
    const list = instances?.[formular]
    const copies = list && list.length > 0 ? list.map((v) => onForm(formular, v)) : [onForm(formular, values)]
    const filled = copies
      .map((copy, index) => ({ copy, entityId: entityIds[formular]?.[index] ?? null }))
      .filter(({ copy }) => Object.keys(copy).length > 0)
    if (filled.length === 0) continue
    forms.push({
      formular,
      instances: filled.map(({ copy, entityId }) => ({ person: personOf(copy), entityId, values: copy })),
    })
  }
  return forms
}
