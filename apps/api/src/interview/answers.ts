import type { Answers } from '@steuereule/core'

export function answersAus(rows: readonly { questionId: string; value: string }[]): Answers {
  const answers: Record<string, string> = {}
  for (const row of rows) answers[row.questionId] = row.value
  return answers as Answers
}
