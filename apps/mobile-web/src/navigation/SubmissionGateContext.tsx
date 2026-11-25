import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Notice } from '@steuereule/core'

export type NoticeKind = Notice['kind']
export type ConfirmedNoticesByYear = Readonly<Record<number, ReadonlySet<NoticeKind>>>

export interface SubmissionGateValue {
  readonly confirmNotices: (year: number, kinds: readonly NoticeKind[]) => void
  readonly areNoticesConfirmed: (year: number, notices: readonly Notice[]) => boolean
  readonly resetSubmissionGate: () => void
}

export function recordNoticeConfirmations(
  previous: ConfirmedNoticesByYear,
  year: number,
  kinds: readonly NoticeKind[],
): ConfirmedNoticesByYear {
  const nextSet = new Set(previous[year] ?? [])
  for (const kind of kinds) nextSet.add(kind)
  return { ...previous, [year]: nextSet }
}

export function hasConfirmedAllNotices(
  confirmedByYear: ConfirmedNoticesByYear,
  year: number,
  notices: readonly Notice[],
): boolean {
  if (notices.length === 0) return true
  const confirmed = confirmedByYear[year]
  return confirmed !== undefined && notices.every((notice) => confirmed.has(notice.kind))
}

/**
 * Where the confirmations survive the Stripe round trip and a reload of the tab (WEB-9): the session
 * storage of this tab, cleared on sign-out. They are notice kinds per year, no tax data.
 */
export const SUBMISSION_GATE_STORAGE_KEY = 'steuereule.submissionGate'

export function readStoredConfirmations(): ConfirmedNoticesByYear {
  try {
    const raw = globalThis.sessionStorage?.getItem(SUBMISSION_GATE_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return {}
    const result: Record<number, ReadonlySet<NoticeKind>> = {}
    for (const [year, kinds] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^\d{4}$/.test(year) || !Array.isArray(kinds)) continue
      result[Number(year)] = new Set(kinds.filter((kind): kind is NoticeKind => typeof kind === 'string'))
    }
    return result
  } catch {
    return {}
  }
}

function storeConfirmations(confirmed: ConfirmedNoticesByYear): void {
  try {
    const entries = Object.entries(confirmed)
    if (entries.length === 0) {
      globalThis.sessionStorage?.removeItem(SUBMISSION_GATE_STORAGE_KEY)
      return
    }
    globalThis.sessionStorage?.setItem(SUBMISSION_GATE_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries.map(([year, kinds]) => [year, [...kinds]]))))
  } catch {
    // Storage blocked (private mode, native): the confirmations then hold for this run only.
  }
}

const SubmissionGateContext = createContext<SubmissionGateValue | null>(null)

export function SubmissionGateProvider({ children }: { readonly children: ReactNode }) {
  const [confirmedByYear, setConfirmedByYear] = useState<ConfirmedNoticesByYear>(readStoredConfirmations)

  useEffect(() => {
    storeConfirmations(confirmedByYear)
  }, [confirmedByYear])

  const confirmNotices = useCallback((year: number, kinds: readonly NoticeKind[]) => {
    setConfirmedByYear((prev) => recordNoticeConfirmations(prev, year, kinds))
  }, [])

  const areNoticesConfirmed = useCallback(
    (year: number, notices: readonly Notice[]) => hasConfirmedAllNotices(confirmedByYear, year, notices),
    [confirmedByYear],
  )

  const resetSubmissionGate = useCallback(() => {
    setConfirmedByYear({})
  }, [])

  const value = useMemo<SubmissionGateValue>(
    () => ({ confirmNotices, areNoticesConfirmed, resetSubmissionGate }),
    [confirmNotices, areNoticesConfirmed, resetSubmissionGate],
  )

  return <SubmissionGateContext.Provider value={value}>{children}</SubmissionGateContext.Provider>
}

export function useOptionalSubmissionGate(): SubmissionGateValue | null {
  return useContext(SubmissionGateContext)
}

export function useSubmissionGate(): SubmissionGateValue {
  const ctx = useContext(SubmissionGateContext)
  if (ctx === null) {
    throw new Error('useSubmissionGate() must be used inside <SubmissionGateProvider>.')
  }
  return ctx
}
