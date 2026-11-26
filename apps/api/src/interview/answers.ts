import type { Answers } from '@steuereule/core'

/**
 * The answers of a user as one object. `Object.fromEntries` defines each key as an own data property, so a stored
 * `__proto__` stays an own key (an assignment would hit the prototype setter and drop it) and nothing reaches the prototype.
 * The last row of a key wins.
 */
export function answersFrom(rows: readonly { questionId: string; value: string }[]): Answers {
  return Object.fromEntries(rows.map((row) => [row.questionId, row.value])) as Answers
}
