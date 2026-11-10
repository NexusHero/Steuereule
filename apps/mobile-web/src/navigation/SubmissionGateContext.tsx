import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
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

const SubmissionGateContext = createContext<SubmissionGateValue | null>(null)

export function SubmissionGateProvider({ children }: { readonly children: ReactNode }) {
  const [confirmedByYear, setConfirmedByYear] = useState<ConfirmedNoticesByYear>({})

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
