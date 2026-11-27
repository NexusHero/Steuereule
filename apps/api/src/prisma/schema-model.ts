import type { DMMF } from '@prisma/generator-helper'

/**
 * The schema's data model with everything `prisma generate` knows about a field: list, id and unique flags,
 * column names, and the `///` documentation that carries the `@encrypted` annotations. Prisma 7's runtime client
 * keeps only name, kind and type (`Prisma.dmmf`), so the generator in `prisma/generators/schema-model.mjs` writes
 * the full model to `schema-model.generated.ts` in the same step as the client.
 */
export interface SchemaModel {
  readonly datamodel: { readonly models: readonly SchemaModelEntry[] }
}

/** `DMMF.Model` as `prisma generate` hands it over: an unnamed `@@unique` has the name `null`, which the published type omits. */
export type SchemaModelEntry = Omit<DMMF.Model, 'uniqueIndexes'> & {
  readonly uniqueIndexes: readonly { readonly name: string | null; readonly fields: readonly string[] }[]
}

export { SCHEMA_MODEL } from './schema-model.generated.js'
