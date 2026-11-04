export interface InterviewAnswerRecord {
  questionId: string
  value: string
}

export interface WriteAnswerParams {
  userId: string
  steuerjahr: number
  questionId: string
  value: string
  openItems: number
}

export const INTERVIEW_ANSWER_REPOSITORY = Symbol('INTERVIEW_ANSWER_REPOSITORY')

/** The persistence seam for InterviewAnswer. */
export interface InterviewAnswerRepository {
  findAllForUserAndYear(userId: string, steuerjahr: number): Promise<InterviewAnswerRecord[]>
  write(params: WriteAnswerParams): Promise<void>
}
