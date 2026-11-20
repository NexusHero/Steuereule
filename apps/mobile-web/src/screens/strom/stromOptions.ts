import { createContext, useContext } from 'react'
import type { InterviewOptions } from '@steuereule/core'

/** The server switches the Strom's interview graph follows (self-employment, ADR-0101 §20); none by default. */
export const StromOptionsContext = createContext<InterviewOptions>({})

export function useStromOptions(): InterviewOptions {
  return useContext(StromOptionsContext)
}
