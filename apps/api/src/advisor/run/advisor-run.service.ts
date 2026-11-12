import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common'
import { ConflictError, NotFoundError } from '../../common/domain-error.js'
import { ADVISOR_REPOSITORY, type AdvisorRepository } from '../advisor.repository.js'
import { AdvisorService, type PreparedAdvisorTurn } from '../advisor.service.js'
import type { AdvisorSessionResponseDto, SendAdvisorMessageDto } from '../dto/advisor.dto.js'
import { ADVISOR_RUN_LOG, type AdvisorRunEntry, type AdvisorRunLog } from './advisor-run-log.js'

const RUN_NOT_FOUND = 'Diese Antwort läuft nicht (mehr).'

/**
 * Runs answers detached from the HTTP connection (#476). A run starts with a question, writes every
 * event to the run log and ends on its own; closing a tab or losing the network ends nothing. Only
 * an explicit stop does.
 */
/** Longer than any turn may run (`AI_TURN_TIMEOUT_MS` is capped at 120 s). */
export const ORPHAN_GRACE_MS = 180_000

@Injectable()
export class AdvisorRunService implements OnApplicationShutdown {
  private readonly logger = new Logger('AdvisorRun')
  private readonly active = new Map<string, { readonly stop: AbortController; readonly finished: Promise<void> }>()

  constructor(
    @Inject(AdvisorService) private readonly advisor: AdvisorService,
    @Inject(ADVISOR_RUN_LOG) private readonly log: AdvisorRunLog,
    @Inject(ADVISOR_REPOSITORY) private readonly advisorRepo: AdvisorRepository,
  ) {}

  /** Checks and persists synchronously (a quota error is still plain HTTP), then lets the run go. */
  async start(userId: string, taxYear: number, dto: SendAdvisorMessageDto): Promise<{ runId: string }> {
    const turn = await this.advisor.prepareTurn(userId, taxYear, dto)
    await this.log.open({ runId: turn.runId, userId, taxYear, assistantMessageId: turn.assistantMessageId })
    const stop = new AbortController()
    const unsubscribe = this.log.onStop(turn.runId, () => stop.abort())
    const finished = this.pump(userId, taxYear, turn, stop.signal).finally(() => {
      unsubscribe()
      this.active.delete(turn.runId)
    })
    this.active.set(turn.runId, { stop, finished })
    return { runId: turn.runId }
  }

  private async pump(userId: string, taxYear: number, turn: PreparedAdvisorTurn, signal: AbortSignal): Promise<void> {
    try {
      for await (const event of this.advisor.executeTurn(userId, taxYear, turn, signal)) {
        await this.log.append(turn.runId, event)
      }
    } catch (error) {
      this.logger.error(`Run ${turn.runId} broke: ${error instanceof Error ? error.message : String(error)}`)
      await this.log
        .append(turn.runId, {
          event: 'error',
          data: { code: 'ADVISOR_TURN_FAILED', message: 'Die Antwort der Eule ist unterwegs abgebrochen. Bitte versuche es erneut.' },
        })
        .catch(() => {})
    } finally {
      await this.log.close(turn.runId).catch(() => {})
    }
  }

  private async ownedRun(userId: string, runId: string) {
    const info = await this.log.info(runId)
    // A foreign run answers exactly like a missing one: its existence is not the caller's business.
    if (!info || info.userId !== userId) throw new NotFoundError('ADVISOR_RUN_NOT_FOUND', RUN_NOT_FOUND)
    return info
  }

  /** The events of a run after `afterSeq`. Ownership is checked before the first event is read. */
  async events(userId: string, runId: string, afterSeq: number, signal?: AbortSignal): Promise<AsyncIterable<AdvisorRunEntry>> {
    await this.ownedRun(userId, runId)
    return this.log.read(runId, afterSeq, signal)
  }

  async stop(userId: string, runId: string): Promise<{ stopped: boolean }> {
    const info = await this.ownedRun(userId, runId)
    const message = await this.advisorRepo.findMessage(info.assistantMessageId, userId)
    if (message?.status !== 'streaming') return { stopped: false }
    await this.log.requestStop(runId)
    // On this instance the caller may rely on the final state being stored once we return.
    await this.active.get(runId)?.finished
    return { stopped: true }
  }

  /** An answer whose run no instance knows any more (crash, deploy) can never finish: mark it failed. */
  private async reconcileOrphans(userId: string, taxYear: number): Promise<void> {
    const messages = await this.advisorRepo.listForUserAndYear(userId, taxYear)
    for (const message of messages) {
      if (message.status !== 'streaming') continue
      if (message.runId !== null && (await this.log.info(message.runId)) !== null) continue
      // Without a shared log (no Redis) an unknown run may simply live on another instance. No run
      // outlasts the turn budget, so only an answer older than that is certainly lost.
      if (!this.log.shared && Date.now() - message.createdAt.getTime() < ORPHAN_GRACE_MS) continue
      await this.advisorRepo.finishMessage(message.id, userId, {
        content: message.content,
        meta: message.meta,
        status: 'failed',
        reasoning: message.reasoning,
        usage: message.usage,
      })
    }
  }

  async getSession(userId: string, taxYear: number, conversationId?: string): Promise<AdvisorSessionResponseDto> {
    await this.reconcileOrphans(userId, taxYear)
    return this.advisor.getSession(userId, taxYear, conversationId)
  }

  /** An answer that is still being written would lose the message it writes into. */
  private async refuseWhileAnswering(userId: string, taxYear: number, conversationId: string | undefined, what: string): Promise<void> {
    await this.reconcileOrphans(userId, taxYear)
    const conversation = await this.advisor.conversationFor(userId, taxYear, conversationId)
    const messages = await this.advisorRepo.listForConversation(conversation.id, userId)
    if (messages.some((m) => m.status === 'streaming')) {
      throw new ConflictError('ADVISOR_RUN_ACTIVE', `Die Eule antwortet gerade noch. Stoppe die Antwort, bevor du ${what}.`)
    }
  }

  async clearConversation(userId: string, taxYear: number, conversationId?: string): Promise<{ deletedMessages: number }> {
    await this.refuseWhileAnswering(userId, taxYear, conversationId, 'den Verlauf leerst')
    return this.advisor.clearConversation(userId, taxYear, conversationId)
  }

  async deleteConversation(userId: string, taxYear: number, conversationId: string): Promise<{ deletedMessages: number }> {
    await this.refuseWhileAnswering(userId, taxYear, conversationId, 'das Gespräch löschst')
    return this.advisor.deleteConversation(userId, taxYear, conversationId)
  }

  /** On shutdown every run of this instance ends as aborted instead of staying `streaming`. */
  async onApplicationShutdown(): Promise<void> {
    const runs = [...this.active.values()]
    for (const run of runs) run.stop.abort()
    await Promise.allSettled(runs.map((run) => run.finished))
  }
}
