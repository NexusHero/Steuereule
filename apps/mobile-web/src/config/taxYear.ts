// The tax year the Cockpit shows. No "current tax year" concept/endpoint exists in the API yet
// (a gap tracked as a REQ-001 follow-up — see steuereule#91's notes); until one lands, this is the
// single, deliberately named source for the year (12-Factor config discipline — never re-hardcoded
// per-component). Matches the design-system reference and its 31 July deadline for Steuerjahr 2026
// (Cockpit.jsx: `new Date('2027-07-31')`).
export const CURRENT_TAX_YEAR = 2026
