/** D8: the fake model must never answer real users. */
export function assertFakeKiNotInProduction(env: NodeJS.ProcessEnv = process.env): void {
  const flag = env.AI_FAKE_KI?.trim().toLowerCase()
  if ((flag === '1' || flag === 'true') && env.NODE_ENV === 'production') {
    throw new Error('AI_FAKE_KI is set in production — refusing to start (the fake KiPort is for CI and tests only, #450 D8).')
  }
}
