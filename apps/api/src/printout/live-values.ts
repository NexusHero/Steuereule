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

/** A copy for the live form view: its values with the Zeile each one stands in on the year's form. */
export interface LiveFormInstanceWithLines extends LiveFormInstance {
  readonly lines: Readonly<Record<string, string>>
}

export interface LiveFormWithLines {
  readonly formular: string
  readonly instances: readonly LiveFormInstanceWithLines[]
}

/** The record ids per form, in the order printout-values.ts builds that form's instances. */
export type EntityIds = Readonly<Record<string, readonly string[]>>

function personOf(values: FieldValues): 'A' | 'B' | null {
  const keys = Object.keys(values)
  if (keys.some((id) => id.endsWith('.personB') && values[id] === true)) return 'B'
  if (keys.some((id) => id.endsWith('.personA') && values[id] === true)) return 'A'
  return null
}

/** Which Vordruck each field id belongs to, and the order the forms print in. */
export interface FormMembership {
  readonly formOf: ReadonlyMap<string, string>
  readonly order: readonly string[]
}

/**
 * Splits values into the copies the renderer prints, exactly as `renderForms` does: a form with
 * instances prints those, any other form prints the shared values that belong to it. A copy with no
 * value of its form is no copy.
 */
export function splitIntoForms(
  membership: FormMembership,
  values: FieldValues,
  instances: Readonly<Record<string, readonly FieldValues[]>> | undefined,
  entityIds: EntityIds,
): LiveForm[] {
  const onForm = (formular: string, source: FieldValues): FieldValues =>
    Object.fromEntries(Object.entries(source).filter(([id]) => membership.formOf.get(id) === formular))

  const forms: LiveForm[] = []
  for (const formular of membership.order) {
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

/** The printed copies of a year whose Vordrucke the printout fills; fields its forms lack are dropped. */
export function liveForms(
  year: number,
  fieldSet: FieldSet,
  values: FieldValues,
  instances: Readonly<Record<string, readonly FieldValues[]>> | undefined,
  entityIds: EntityIds,
): LiveForm[] {
  const membership: FormMembership = {
    formOf: new Map(fieldSet.felder.map((field) => [field.id, field.formular])),
    order: FORM_ORDER.filter((formular) => formular in fieldSet.vorlagen),
  }
  const ofYear = instances ? Object.fromEntries(Object.entries(instances).map(([form, list]) => [form, list.map((v) => forYear(year, v))])) : undefined
  return splitIntoForms(membership, forYear(year, values), ofYear, entityIds)
}
