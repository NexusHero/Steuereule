import { randomUUID } from 'node:crypto'

/**
 * Id of a staged advisor action. The meta carrying it passes checkPiiFree, whose Steuer-ID regex
 * matches 11 digits between word boundaries: a UUID prefix with its dash ("12345678-901") did that
 * about once in 170 ids. Twelve hex characters without a separator never form such a match.
 */
export function newActionId(): string {
  return `act-${randomUUID().replaceAll('-', '').slice(0, 12)}`
}
