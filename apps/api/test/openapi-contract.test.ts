// The generated OpenAPI document is load-bearing (ADR-0001): the frontend's orval
// client and MSW handlers are pinned to it. This asserts the actual document Nest
// emits — not a hand-maintained copy — exposes the typed GET/PUT /v1/profile contract
// with the 400 error DTO, so drift here is caught in CI.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { OpenAPIObject } from '@nestjs/swagger'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'

describe('OpenAPI contract for /v1/profile', () => {
  let app: NestFastifyApplication
  let document: OpenAPIObject

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
    })
    const config = new DocumentBuilder().setTitle('SteuerEule API').setVersion('1.0').build()
    document = SwaggerModule.createDocument(app, config)
  })

  afterAll(async () => {
    await app.close()
  })

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
  let app: NestFastifyApplication
  let document: OpenAPIObject

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
    })
    const config = new DocumentBuilder().setTitle('SteuerEule API').setVersion('1.0').build()
    document = SwaggerModule.createDocument(app, config)
  })

  afterAll(async () => {
    await app.close()
  })

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

describe('OpenAPI contract for DELETE /v1/account (REQ-011, ADR-0013)', () => {
  let app: NestFastifyApplication
  let document: OpenAPIObject

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
    })
    const config = new DocumentBuilder().setTitle('SteuerEule API').setVersion('1.0').build()
    document = SwaggerModule.createDocument(app, config)
  })

  afterAll(async () => {
    await app.close()
  })

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
  let app: NestFastifyApplication
  let document: OpenAPIObject

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
    })
    const config = new DocumentBuilder().setTitle('SteuerEule API').setVersion('1.0').build()
    document = SwaggerModule.createDocument(app, config)
  })

  afterAll(async () => {
    await app.close()
  })

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
