import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createAppAuthClient } from './auth-client'
import { AuthClientProvider, useAuthClient } from './AuthClientProvider'

function Consumer() {
  const client = useAuthClient()
  return <>{typeof client.signIn.email}</>
}

function ConsumerWithoutProvider() {
  useAuthClient()
  return null
}

describe('AuthClientProvider / useAuthClient', () => {
  it('provides the constructed client down to consumers', () => {
    const client = createAppAuthClient('http://localhost:3000')
    render(
      <AuthClientProvider client={client}>
        <Consumer />
      </AuthClientProvider>,
    )
    expect(screen.getByText('function')).toBeTruthy()
  })

  it('throws a clear error when used outside an AuthClientProvider', () => {
    expect(() => render(<ConsumerWithoutProvider />)).toThrow(/useAuthClient\(\) called outside/)
  })
})
