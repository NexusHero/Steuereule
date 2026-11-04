export const UNKNOWN_REGION = 'unknown'

export const REGION_RESOLVER = Symbol('REGION_RESOLVER')

/** The resolution seam for "which country does this request look like it's from?". */
export interface RegionResolver {
  resolve(ip: string | null): Promise<string>
}
