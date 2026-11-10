import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { buildTestApp } from './support/build-test-app.js'

const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n', 'utf8')

function createMultipartBody(fieldName: string, fileName: string, contentType: string, payload: Buffer, fields: Record<string, string> = {}) {
  const boundary = '----SteuereuleTestBoundary7MA4YWxkTrZu0gW'
  const chunks: Buffer[] = []

  for (const [k, v] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
        'utf8',
      ),
    )
  }

  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`,
      'utf8',
    ),
  )
  chunks.push(payload)
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'))

  return {
    boundary,
    body: Buffer.concat(chunks),
  }
}

describe('HTTP E2E (no-DB): Beleg upload/download/delete, LStB parse & atomic LStB confirm (#444)', () => {
  let app: NestFastifyApplication

  beforeEach(async () => {
    const built = await buildTestApp({
      sessionsByToken: {
        'tok-user-a': 'user-lstb-a',
        'tok-user-b': 'user-lstb-b',
      },
    })
    app = built.app
  })

  afterEach(async () => {
    await app.close()
  })

  it('rejects guest sessions on LStB parse and LStB confirm with 401 (@RequiresAccount)', async () => {
    const parseGuest = await app.inject({
      method: 'POST',
      url: '/v1/belege/parse',
      payload: { taxYear: 2025, kind: 'lstb', fileName: 'lstb.pdf', rawText: '3. Brutto 50000' },
    })
    expect(parseGuest.statusCode).toBe(401)

    const confirmGuest = await app.inject({
      method: 'PUT',
      url: '/v1/steuerjahre/2025/lstb',
      payload: { bruttoarbeitslohn: 50000, lohnsteuer: 8000, sozialversicherung: 9000 },
    })
    expect(confirmGuest.statusCode).toBe(401)
  })

  it('rejects any document image in the parse payload with 400 — pixels never reach a model (AC 1, ADR-0021)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/belege/parse',
      headers: { cookie: 'better-auth.session_token=tok-user-a' },
      payload: {
        taxYear: 2025,
        fileName: 'quittung.png',
        mimeType: 'image/png',
        rawText: 'Spende 80 EUR',
        imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('imageBase64')
  })

  it('uploads PDF, serves decrypted binary with security headers, isolates cross-user, stages LStB & confirms atomically', async () => {
    const cookieA = 'better-auth.session_token=tok-user-a'
    const cookieB = 'better-auth.session_token=tok-user-b'

    // 1. Multipart upload of PDF original
    const mp = createMultipartBody('file', 'LStB_2025.pdf', 'application/pdf', PDF_BYTES, { kind: 'Sonstiges' })
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/v1/belege/upload',
      headers: {
        cookie: cookieA,
        'content-type': `multipart/form-data; boundary=${mp.boundary}`,
      },
      payload: mp.body,
    })
    expect(uploadRes.statusCode).toBe(201)
    const uploaded = uploadRes.json()
    expect(uploaded.hasFile).toBe(true)
    expect(uploaded.mimeType).toBe('application/pdf')

    // 2. Download original binary with nosniff + no-store headers; cross-user gets 404
    const dlRes = await app.inject({
      method: 'GET',
      url: `/v1/belege/${uploaded.id}/datei`,
      headers: { cookie: cookieA },
    })
    expect(dlRes.statusCode).toBe(200)
    expect(dlRes.headers['x-content-type-options']).toBe('nosniff')
    expect(dlRes.headers['cache-control']).toBe('no-store')
    expect(Buffer.from(dlRes.rawPayload).equals(PDF_BYTES)).toBe(true)

    const dlForeign = await app.inject({
      method: 'GET',
      url: `/v1/belege/${uploaded.id}/datei`,
      headers: { cookie: cookieB },
    })
    expect(dlForeign.statusCode).toBe(404)

    // 3. Reject disguised HTML uploaded as .pdf
    const badMp = createMultipartBody('file', 'fake.pdf', 'application/pdf', Buffer.from('<html>xss</html>', 'utf8'))
    const badRes = await app.inject({
      method: 'POST',
      url: '/v1/belege/upload',
      headers: {
        cookie: cookieA,
        'content-type': `multipart/form-data; boundary=${badMp.boundary}`,
      },
      payload: badMp.body,
    })
    expect(badRes.statusCode).toBe(400)

    // 4. Parse LStB text -> Zero-Write staged proposal in advisor session
    const parseRes = await app.inject({
      method: 'POST',
      url: '/v1/belege/parse',
      headers: { cookie: cookieA },
      payload: {
        taxYear: 2025,
        kind: 'lstb',
        fileName: 'LStB_2025.pdf',
        receiptId: uploaded.id,
        rawText: [
          'Lohnsteuerbescheinigung 2025',
          '3. Bruttoarbeitslohn 54.320,00',
          '4. Einbehaltene Lohnsteuer 9.840,00',
          '23a. AN Rentenversicherung 5.051,76',
          '25. AN Krankenversicherung 4.100,00',
          '26. AN Pflegeversicherung 1.050,00',
          '27. AN Arbeitslosenversicherung 710,00',
        ].join('\n'),
      },
    })
    expect(parseRes.statusCode).toBe(200)
    const parsedBody = parseRes.json()
    expect(parsedBody.lstb.fields.bruttoarbeitslohn.value).toBe(54320)
    expect(parsedBody.lstb.fields.lohnsteuer.value).toBe(9840)
    expect(parsedBody.lstb.fields.sozialversicherung.value).toBe(10912)
    expect(parsedBody.lstb.stagedActionIds).toHaveLength(3)

    // LStB table still empty before confirmation!
    const beforeConfirm = await app.inject({
      method: 'GET',
      url: '/v1/steuerjahre/2025/lstb',
      headers: { cookie: cookieA },
    })
    expect(beforeConfirm.statusCode).toBe(200)
    expect(beforeConfirm.json().bruttoarbeitslohn).toEqual({ kind: 'offen' })

    // 5. Implausible values rejected cleanly with 400
    const implausible = await app.inject({
      method: 'PUT',
      url: '/v1/steuerjahre/2025/lstb',
      headers: { cookie: cookieA },
      payload: {
        bruttoarbeitslohn: 1000,
        lohnsteuer: 5000,
        sozialversicherung: 500,
        receiptId: uploaded.id,
      },
    })
    expect(implausible.statusCode).toBe(400)

    // 6. Confirm atomically -> persists values + beleg provenance & flips advisor draft to applied
    const confirmRes = await app.inject({
      method: 'PUT',
      url: '/v1/steuerjahre/2025/lstb',
      headers: { cookie: cookieA },
      payload: {
        bruttoarbeitslohn: 54320,
        lohnsteuer: 9840,
        sozialversicherung: 10912,
        receiptId: uploaded.id,
        actionIds: parsedBody.lstb.stagedActionIds,
      },
    })
    expect(confirmRes.statusCode).toBe(200)
    expect(confirmRes.json().state).toEqual({
      kind: 'vollstaendig',
      bruttoarbeitslohn: 54320,
      lohnsteuer: 9840,
      sozialversicherung: 10912,
    })

    // Second write without overwriteExisting returns 409 conflict
    const conflictRes = await app.inject({
      method: 'PUT',
      url: '/v1/steuerjahre/2025/lstb',
      headers: { cookie: cookieA },
      payload: {
        bruttoarbeitslohn: 60000,
        lohnsteuer: 10000,
        sozialversicherung: 11000,
        receiptId: uploaded.id,
      },
    })
    expect(conflictRes.statusCode).toBe(409)

    // 7. Delete receipt cleans up metadata and file
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/v1/belege/${uploaded.id}`,
      headers: { cookie: cookieA },
    })
    expect(delRes.statusCode).toBe(200)
    expect(delRes.json()).toEqual({ deleted: true })

    const dlAfterDelete = await app.inject({
      method: 'GET',
      url: `/v1/belege/${uploaded.id}/datei`,
      headers: { cookie: cookieA },
    })
    expect(dlAfterDelete.statusCode).toBe(404)
  })
})
