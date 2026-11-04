import type { Auth } from 'better-auth'

export interface DeviceAuthorizationApi {
  deviceCode(input: {
    body: { client_id: string; user_id?: string; scope?: string }
  }): Promise<{
    device_code: string
    user_code: string
    verification_uri: string
    verification_uri_complete: string
    expires_in: number
    interval: number
  }>
  deviceVerify(input: { headers: Headers; query: { user_code: string } }): Promise<{
    user_code: string
    status: string
  }>
  deviceApprove(input: { headers: Headers; body: { userCode: string } }): Promise<{ success: boolean }>
  deviceToken(input: {
    headers: Headers
    body: { grant_type: 'urn:ietf:params:oauth:grant-type:device_code'; device_code: string; client_id: string }
    returnHeaders: true
  }): Promise<{
    headers: Headers
    response: {
      access_token: string
      token_type: string
      expires_in: number
      scope: string
    }
  }>
}

export function deviceAuthorizationApi(auth: Auth): DeviceAuthorizationApi {
  return auth.api as unknown as DeviceAuthorizationApi
}
