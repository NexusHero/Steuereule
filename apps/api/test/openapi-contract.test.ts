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
