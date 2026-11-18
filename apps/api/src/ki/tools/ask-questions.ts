import { TOOL_ARG_SCHEMAS } from '../advisor-tools.js'
import { toolHandler } from './tool-call-context.js'

export const askQuestionsTool = toolHandler(['ask_questions'], (_call, ctx) => {
  const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.ask_questions)
  if (args === null) return
  const questionRound = {
    questions: args.questions.map((q) => {
      const options = q.options.map((o) => o.trim()).filter((o) => o.length > 0)
      // A fact gets no recommendation: one tap on it would claim the fact for the user.
      const recommended = q.kind === 'decision' && q.recommended !== undefined && options.includes(q.recommended.trim()) ? q.recommended.trim() : undefined
      const reason = recommended !== undefined ? q.reason?.trim() : undefined
      return { text: q.text.trim(), options, kind: q.kind, ...(q.multiple ? { multiple: true } : {}), ...(recommended !== undefined ? { recommended } : {}), ...(reason ? { reason } : {}) }
    }),
  }
  ctx.turn.questionRound = questionRound
  ctx.answer({ ok: true, questions: questionRound.questions.length })
})
