/**
 * Where a proposed change stands: still open, taken over, turned down, replaced by a newer one,
 * or taken back. The Eule's proposals, receipt proposals and recurring items share this lifecycle.
 */
export type AdvisorActionStatus = 'pending' | 'applied' | 'dismissed' | 'superseded' | 'undone'
