import { randomInt, randomUUID } from 'node:crypto'

/**
 * Id of a staged advisor action. The meta carrying it passes checkPiiFree, so the id must never look
 * like personal data:
 * - Steuer-ID: 11 digits between word boundaries. A UUID prefix with its dash ("12345678-901") did that
 *   about once in 170 ids; hex characters without a separator never form such a match.
 * - IBAN: two letters, two digits, then 11 or more characters. "ab12cdef3456" followed by a suffix a
 *   two-path proposal adds ("-safe") had that shape in about one id in 18. The hex part therefore always
 *   starts with a digit, so no letter pair at its start can open an IBAN.
 */
export function newActionId(): string {
  const hex = randomUUID().replaceAll('-', '').slice(0, 11)
  return `act-${String(randomInt(10))}${hex}`
}
