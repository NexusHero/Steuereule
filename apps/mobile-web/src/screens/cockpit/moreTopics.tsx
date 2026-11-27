import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'

type Disclosure = readonly [boolean, Dispatch<SetStateAction<boolean>>]

const MoreTopicsContext = createContext<Disclosure | null>(null)

/**
 * Holds whether „Weitere Themen“ is open, above the cockpit's layouts. The empty and the loaded cockpit are
 * different trees, so the tiles are mounted anew when the first figures arrive; kept in the tiles, the open
 * section closed again under the user's finger.
 */
export function MoreTopicsProvider({ children }: { readonly children: ReactNode }) {
  const disclosure = useState(false)
  return <MoreTopicsContext.Provider value={disclosure}>{children}</MoreTopicsContext.Provider>
}

/** The shared state inside a cockpit; a local one where the tiles are rendered on their own. */
export function useMoreTopicsExpanded(): Disclosure {
  const shared = useContext(MoreTopicsContext)
  const local = useState(false)
  return shared ?? local
}
