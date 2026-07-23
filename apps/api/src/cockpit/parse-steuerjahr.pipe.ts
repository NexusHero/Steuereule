// R1 (Musti review, REQ-001): `ParseIntPipe` alone only proves "parses as an integer" —
// it never validates against the actual storage type. `TaxYear.steuerjahr` is a Prisma
// `Int` (Postgres int4, max 2147483647), so a crafted `GET
// /v1/steuerjahre/3000000000/cockpit` parsed fine and reached Prisma, where Postgres
// threw "value out of range for type integer" as an unhandled 500 — on trivially
// crafted input. This pipe validates at the boundary against a sensible tax-year
// window instead, which is both a better user-facing error and strictly narrower than
// int4, so the overflow can never reach Postgres at all.
//
// Deliberately typed `transform(value: unknown)`, not `transform(value: string)`: the
// app's global `ValidationPipe` (`transform: true`, main.ts) runs *before* this
// param-scoped pipe (Nest's fixed pipe order is global -> controller -> method ->
// param) and, under the real `tsc` build where `emitDecoratorMetadata` reflects this
// param's TS type as `number`, it already primitive-coerces the raw path segment via
// `Number(...)` — so this pipe can receive a genuine string, an already-parsed number,
// or `NaN` (for anything non-numeric), never reliably "the raw string". Converting via
// `Number()` again is idempotent for all three, so validating the *converted number's*
// shape (integer, in-window) is the one check that's correct regardless of what
// upstream already did to the value.
import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'

/** No German tax year predates this; also comfortably clear of any real seeded data. */
const MIN_STEUERJAHR = 2000

@Injectable()
export class ParseSteuerjahrPipe implements PipeTransform<unknown, number> {
  transform(value: unknown): number {
    const parsed = Number(value)
    // Computed per-call (not module-load-time) so a long-running server still uses
    // the correct upper bound across a New Year rollover.
    const maxSteuerjahr = new Date().getFullYear() + 1

    if (!Number.isInteger(parsed)) {
      throw new BadRequestException('jahr must be a plain integer tax year (e.g. 2026)')
    }
    if (parsed < MIN_STEUERJAHR || parsed > maxSteuerjahr) {
      throw new BadRequestException(`jahr must be between ${MIN_STEUERJAHR} and ${maxSteuerjahr}, got ${parsed}`)
    }

    return parsed
  }
}
