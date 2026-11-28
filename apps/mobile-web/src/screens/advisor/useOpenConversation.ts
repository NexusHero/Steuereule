import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PENDING_CONVERSATION } from './CopilotBridgeHelpers'

export interface UseOpenConversationInput {
  readonly taxYear: number
  readonly onSwitchYear: ((year: number) => void) | undefined
}

/** What the answers need to know about the open conversation; the refs are read at send time, never stale. */
export interface OpenConversation {
  readonly conversationId: string | null
  readonly defaultConversationId: string | null
  /** The id the user chose; a ref so a send never uses a stale one. */
  readonly conversationIdRef: { readonly current: string | null }
  /** Where the open conversation's answer is filed. */
  readonly keyOfOpen: () => string
}

/** Which conversation is open: the one the user chose, else the one the server opened for the year. */
export function useOpenConversation({ taxYear, onSwitchYear }: UseOpenConversationInput) {
  const [conversationId, setConversationIdState] = useState<string | null>(null)
  // The conversation the server opened when none was chosen. It files that conversation's answer,
  // but it is never requested by id: that would load the same session a second time (#503).
  const [defaultConversationId, setDefaultConversationId] = useState<string | null>(null)
  const defaultIdRef = useRef<string | null>(null)
  // The stream request reads the id at send time; a ref keeps a send from using a stale one.
  const conversationIdRef = useRef<string | null>(null)
  const keyOfOpen = useCallback((): string => conversationIdRef.current ?? defaultIdRef.current ?? PENDING_CONVERSATION, [])

  const setConversationId = useCallback((id: string | null) => {
    conversationIdRef.current = id
    setConversationIdState(id)
  }, [])
  /**
   * The screen learned which conversation the server opened. Returns whether it is news: only then
   * does what was asked before the id was known have to move there.
   */
  const adoptDefaultConversationId = useCallback((id: string): boolean => {
    if (conversationIdRef.current !== null || defaultIdRef.current === id) return false
    defaultIdRef.current = id
    setDefaultConversationId(id)
    return true
  }, [])
  // The year changed from outside the owl (not by opening one of its conversations): the open
  // conversation belongs to the other year, so the year's last used one is shown.
  const expectedYearRef = useRef(taxYear)
  useEffect(() => {
    if (expectedYearRef.current === taxYear) return
    expectedYearRef.current = taxYear
    conversationIdRef.current = null
    setConversationIdState(null)
    defaultIdRef.current = null
    setDefaultConversationId(null)
  }, [taxYear])
  /** Opens a conversation of another tax year: the year is the project, so the whole app switches to it. */
  const openConversationInYear = useCallback(
    (year: number, id: string) => {
      expectedYearRef.current = year
      conversationIdRef.current = id
      setConversationIdState(id)
      if (year !== taxYear) onSwitchYear?.(year)
    },
    [onSwitchYear, taxYear],
  )

  const open = useMemo<OpenConversation>(() => ({ conversationId, defaultConversationId, conversationIdRef, keyOfOpen }), [conversationId, defaultConversationId, keyOfOpen])
  return { open, setConversationId, adoptDefaultConversationId, openConversationInYear }
}
