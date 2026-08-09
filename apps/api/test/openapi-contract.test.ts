// The checked-in `openapi.json` is load-bearing (ADR-0001): it's the exact artifact
// orval reads to generate the frontend's typed client and MSW handlers — not a
// hand-maintained copy, and not the in-process document Nest would build under this
// test file's own toolchain either.
//
// Musti's #239 ruling (replacing this file's earlier approach, ADR-0022): this used
// to build the document in-process via `SwaggerModule.createDocument(...)`, under
// Vitest/SWC — which, like production's `tsc` build, emits `design:paramtypes`
// metadata. `scripts/generate-openapi-spec.ts`, the actual generator behind the
// checked-in file, deliberately runs under plain `tsx` (esbuild, no metadata
// emission) — so a `@Query()`/`@Body()` DTO whose shape depended on that metadata
// alone rendered correctly in-process here while silently losing its parameter/body
// in the file orval actually consumes. Three endpoints shipped that way
// (`/v1/device/pending`'s `userCode`, `/v1/device/approve`'s and `/v1/device/token`'s
// request bodies) with this file green throughout, because it was asking a document
// nobody downstream reads. Reading the checked-in file directly is what makes this a
// real control on the shipped artifact rather than a correct answer to the wrong
// question — the CI freshness gate (`openapi:spec`, failing on a diff) is what keeps
// this file's answer from going stale against it.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { OpenAPIObject } from '@nestjs/swagger'
import { describe, expect, it } from 'vitest'

const document = JSON.parse(readFileSync(fileURLToPath(new URL('../openapi.json', import.meta.url)), 'utf-8')) as OpenAPIObject

describe('OpenAPI contract for /v1/profile', () => {
  it('documents GET /v1/profile returning the ProfileResponse schema', () => {
    const get = document.paths['/v1/profile']?.get
    expect(get).toBeDefined()
    const okResponse = get?.responses['200']
    expect(okResponse).toBeDefined()
  })

  it('documents PUT /v1/profile accepting a request body and returning the ProfileResponse schema', () => {
    const put = document.paths['/v1/profile']?.put
    expect(put).toBeDefined()
    expect(put?.requestBody).toBeDefined()
    expect(put?.responses['200']).toBeDefined()
  })

  it('documents a 400 response on PUT with the machine-readable ValidationError schema', () => {
    const put = document.paths['/v1/profile']?.put
    expect(put?.responses['400']).toBeDefined()
  })

  it('exposes ProfileResponseDto with the four documented fields', () => {
    const schema = document.components?.schemas?.ProfileResponseDto
    expect(schema).toBeDefined()
    const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties).sort()).toEqual(
      ['firstName', 'lastName', 'steuerId', 'steuernummer'].sort(),
    )
  })

  it('exposes ValidationErrorDto with a machine-readable fields array', () => {
    const schema = document.components?.schemas?.ValidationErrorDto
    expect(schema).toBeDefined()
    const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties)).toContain('fields')
  })
})

describe('OpenAPI contract for GET /v1/steuerjahre/{jahr}/cockpit (REQ-001)', () => {
  it('documents GET /v1/steuerjahre/{jahr}/cockpit with a `jahr` path param', () => {
    const get = document.paths['/v1/steuerjahre/{jahr}/cockpit']?.get
    expect(get).toBeDefined()
    expect(get?.parameters?.some((p) => 'name' in p && p.name === 'jahr')).toBe(true)
  })

  it('documents the 200 response as nullable — the honest empty state is part of the contract, not a 404', () => {
    const get = document.paths['/v1/steuerjahre/{jahr}/cockpit']?.get
    const okResponse = get?.responses['200'] as { content?: Record<string, { schema?: unknown }> }
    const schema = okResponse?.content?.['application/json']?.schema as { nullable?: boolean } | undefined
    expect(schema?.nullable).toBe(true)
  })

  it('exposes CockpitSummaryDto with exactly the fields the frozen frontend contract expects', () => {
    const schema = document.components?.schemas?.CockpitSummaryDto
    expect(schema).toBeDefined()
    const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties).sort()).toEqual(['estimate', 'openItems', 'taxYear'].sort())
  })

  it('exposes EstimateRangeDto with from/to fields', () => {
    const schema = document.components?.schemas?.EstimateRangeDto
    expect(schema).toBeDefined()
    const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties).sort()).toEqual(['from', 'to'].sort())
  })
})

describe('OpenAPI contract for /v1/steuerjahre/{jahr}/interview (#318, REQ-015)', () => {
  it('documents GET /v1/steuerjahre/{jahr}/interview with a `jahr` path param', () => {
    const get = document.paths['/v1/steuerjahre/{jahr}/interview']?.get
    expect(get).toBeDefined()
    expect(get?.parameters?.some((p) => 'name' in p && p.name === 'jahr')).toBe(true)
    expect(get?.responses['200']).toBeDefined()
  })

  it('documents POST /v1/steuerjahre/{jahr}/interview/antworten with a request body referencing PostAnswerDto', () => {
    const post = document.paths['/v1/steuerjahre/{jahr}/interview/antworten']?.post
    expect(post).toBeDefined()
    const requestBody = post?.requestBody as { content?: Record<string, { schema?: { $ref?: string } }> } | undefined
    expect(requestBody?.content?.['application/json']?.schema?.$ref).toBe('#/components/schemas/PostAnswerDto')
    expect(post?.responses['200']).toBeDefined()
    expect(post?.responses['400']).toBeDefined()
    expect(post?.responses['409']).toBeDefined()
  })

  it('exposes InterviewStateDto with answers/nextStep/openItems', () => {
    const schema = document.components?.schemas?.InterviewStateDto
    expect(schema).toBeDefined()
    const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties).sort()).toEqual(['answers', 'nextStep', 'openItems'].sort())
  })

  it('exposes PostAnswerDto requiring questionId and value', () => {
    const schema = document.components?.schemas?.PostAnswerDto
    expect(schema).toBeDefined()
    const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties).sort()).toEqual(['questionId', 'value'].sort())
    const required = (schema as { required?: string[] }).required ?? []
    expect(required.sort()).toEqual(['questionId', 'value'].sort())
  })

  it('exposes PostAnswerResponseDto with nextStep/openItems', () => {
    const schema = document.components?.schemas?.PostAnswerResponseDto
    expect(schema).toBeDefined()
    const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties).sort()).toEqual(['nextStep', 'openItems'].sort())
  })

  it('exposes StepDto mirroring @steuereule/core’s Step union (kind + optional id)', () => {
    const schema = document.components?.schemas?.StepDto
    expect(schema).toBeDefined()
    const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties).sort()).toEqual(['kind', 'id'].sort())
  })
})

describe('OpenAPI contract for DELETE /v1/account (REQ-011, ADR-0013)', () => {
  it('documents DELETE /v1/account accepting a confirm+password body and returning the summary schema', () => {
    const del = document.paths['/v1/account']?.delete
    expect(del).toBeDefined()
    expect(del?.requestBody).toBeDefined()
    expect(del?.responses['200']).toBeDefined()
  })

  it('exposes DeleteAccountRequestDto requiring confirm, with an optional password', () => {
    const schema = document.components?.schemas?.DeleteAccountRequestDto
    expect(schema).toBeDefined()
    const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties).sort()).toEqual(['confirm', 'password'].sort())
    const required = (schema as { required?: string[] }).required ?? []
    expect(required).toContain('confirm')
    expect(required).not.toContain('password')
  })

  it('exposes DeleteAccountResponseDto with the honest summary fields — never a vague "everything erased"', () => {
    const schema = document.components?.schemas?.DeleteAccountResponseDto
    expect(schema).toBeDefined()
    const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties).sort()).toEqual(
      ['deleted', 'retainedAnonymisedAuditRows', 'retainedUnderLegalHold'].sort(),
    )
  })

  it('exposes DeletedSummaryDto with profile/account booleans', () => {
    const schema = document.components?.schemas?.DeletedSummaryDto
    expect(schema).toBeDefined()
    const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties).sort()).toEqual(['account', 'profile'].sort())
  })
})

describe('OpenAPI contract for GET /v1/account/export (REQ-011/ADR-0013)', () => {
  it('documents GET /v1/account/export with an optional `format` query param', () => {
    const get = document.paths['/v1/account/export']?.get
    expect(get).toBeDefined()
    expect(get?.parameters?.some((p) => 'name' in p && p.name === 'format')).toBe(true)
  })

  it('documents the 200 response and a 404 (no account to export) response', () => {
    const get = document.paths['/v1/account/export']?.get
    expect(get?.responses['200']).toBeDefined()
    expect(get?.responses['404']).toBeDefined()
  })

  it('exposes ExportDocumentDto with exactly the ADR-0013 frozen contract fields', () => {
    const schema = document.components?.schemas?.ExportDocumentDto
    expect(schema).toBeDefined()
    const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties).sort()).toEqual(
      ['schemaVersion', 'exportedAt', 'account', 'profile', 'taxData', 'accessLog'].sort(),
    )
  })

  it('exposes ExportAccountDto, ExportProfileDto and ExportAccessLogEntryDto with the documented fields', () => {
    const accountSchema = document.components?.schemas?.ExportAccountDto as { properties?: Record<string, unknown> }
    expect(Object.keys(accountSchema?.properties ?? {}).sort()).toEqual(
      ['email', 'name', 'emailVerified', 'createdAt', 'authProviders'].sort(),
    )

    const profileSchema = document.components?.schemas?.ExportProfileDto as { properties?: Record<string, unknown> }
    expect(Object.keys(profileSchema?.properties ?? {}).sort()).toEqual(
      ['firstName', 'lastName', 'steuerId', 'steuernummer', 'createdAt', 'updatedAt'].sort(),
    )

    const accessLogSchema = document.components?.schemas?.ExportAccessLogEntryDto as {
      properties?: Record<string, unknown>
    }
    expect(Object.keys(accessLogSchema?.properties ?? {}).sort()).toEqual(['action', 'resource', 'createdAt'].sort())
  })

  it('never documents a secret field (password/token) anywhere in the export schemas', () => {
    const schemaNames = ['ExportDocumentDto', 'ExportAccountDto', 'ExportProfileDto', 'ExportAccessLogEntryDto']
    for (const name of schemaNames) {
      const schema = document.components?.schemas?.[name] as { properties?: Record<string, unknown> }
      const fields = Object.keys(schema?.properties ?? {}).join(',').toLowerCase()
      expect(fields).not.toMatch(/password|token|secret/)
    }
  })
})

describe('OpenAPI contract for POST /v1/device/code (#238, task 0, ADR-0024)', () => {
  it('documents POST /v1/device/code returning the DeviceCodeResponse schema', () => {
    const post = document.paths['/v1/device/code']?.post
    expect(post).toBeDefined()
    expect(post?.responses['201']).toBeDefined()
  })

  it('exposes DeviceCodeResponseDto with exactly the RFC 8628 fields the desktop needs', () => {
    const schema = document.components?.schemas?.DeviceCodeResponseDto
    expect(schema).toBeDefined()
    const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties).sort()).toEqual(
      ['userCode', 'deviceCode', 'verificationUriComplete', 'expiresIn', 'interval'].sort(),
    )
  })
})

// #238 task 2 (ADR-0024). These three assertions are the ones that actually caught
// nothing before this file read the checked-in artifact (Kaan's find, Musti's #239
// ruling) — `device.controller.ts`'s `@Query()`/`@Body()` DTOs silently lost their
// documented parameter/body under the generator's `tsx` toolchain, and every
// assertion that only checked `.toBeDefined()`/`parameters.length` here stayed green
// throughout, because it was reading a document nobody downstream consumes.
//
// ADR-0021 form: assert the *specific* content — a parameter actually named
// `userCode` (our DTO's own field name, not RFC 8628's `user_code` wire name — Nest
// binds `@Query()` by the DTO's own property name), and a request body whose schema
// is a concrete `$ref` to the real DTO — not `parameters.length > 0` or
// `requestBody` truthiness, either of which junk (an empty object, an unrelated
// parameter) would also satisfy. Remove the controller's `@ApiQuery()`/`@ApiBody()`
// and regenerate, and each of these goes red — verified before landing.
describe('OpenAPI contract for /v1/device/{pending,approve,token} (#238, task 2, ADR-0024)', () => {
  it('documents GET /v1/device/pending returning the match-verification payload (AC-3), with a named userCode query parameter', () => {
    const get = document.paths['/v1/device/pending']?.get
    expect(get).toBeDefined()
    expect(get?.responses['200']).toBeDefined()
    const userCodeParam = get?.parameters?.find((p) => 'name' in p && p.name === 'userCode') as
      | { name: string; in: string }
      | undefined
    expect(userCodeParam).toBeDefined()
    expect(userCodeParam?.in).toBe('query')
  })

  it('exposes DevicePendingResponseDto with the full browser/OS/region/time payload — never a scope field (one-tap, no session-scope choice)', () => {
    const schema = document.components?.schemas?.DevicePendingResponseDto
    expect(schema).toBeDefined()
    const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties).sort()).toEqual(['userCode', 'status', 'userAgent', 'region', 'requestedAt'].sort())
  })

  it('documents POST /v1/device/approve with a request body referencing ApproveDeviceRequestDto (just userCode — no scope field)', () => {
    const post = document.paths['/v1/device/approve']?.post
    expect(post).toBeDefined()
    expect(post?.responses['200']).toBeDefined()
    const requestBody = post?.requestBody as { content?: Record<string, { schema?: { $ref?: string } }> } | undefined
    expect(requestBody?.content?.['application/json']?.schema?.$ref).toBe('#/components/schemas/ApproveDeviceRequestDto')

    const schema = document.components?.schemas?.ApproveDeviceRequestDto
    const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties)).toEqual(['userCode'])
  })

  it('documents POST /v1/device/token with a request body referencing DeviceTokenRequestDto, never exposing a session token field in its response', () => {
    const post = document.paths['/v1/device/token']?.post
    expect(post).toBeDefined()
    expect(post?.responses['200']).toBeDefined()
    const requestBody = post?.requestBody as { content?: Record<string, { schema?: { $ref?: string } }> } | undefined
    expect(requestBody?.content?.['application/json']?.schema?.$ref).toBe('#/components/schemas/DeviceTokenRequestDto')

    const schema = document.components?.schemas?.AckResponseDto
    const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties)).toEqual(['success'])
  })
})
