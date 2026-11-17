import { useEffect, useRef } from 'react'
import { hapticWarning } from '@steuereule/ui'

/** Warns haptically once each time a blocking conflict appears for the tax year. */
export function useBlockingConflictHaptic(taxYear: number, hasBlockingConflict: boolean): void {
  const prevConflictRef = useRef<{ taxYear: number; active: boolean }>({ taxYear, active: false })

  useEffect(() => {
    if (prevConflictRef.current.taxYear !== taxYear) {
      prevConflictRef.current = { taxYear, active: false }
    }
    if (!prevConflictRef.current.active && hasBlockingConflict) {
      void hapticWarning()
    }
    prevConflictRef.current.active = hasBlockingConflict
  }, [taxYear, hasBlockingConflict])
}
