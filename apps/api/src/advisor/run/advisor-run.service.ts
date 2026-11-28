import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common'
import { ConflictError, NotFoundError } from '../../common/domain-error.js'
import { ADVISOR_REPOSITORY, type AdvisorRepository } from '../advisor.repository.js'
import { AdvisorConversations } from '../advisor-conversations.js'
import { AdvisorService } from '../advisor.service.js'
import { TURN_FAILED_MESSAGE, type PreparedAdvisorTurn } from '../advisor-shared.js'
import { AdvisorTurn } from '../advisor-turn.js'
import type { AdvisorContextDto, AdvisorSessionResponseDto, SendAdvisorMessageDto } from '../dto/advisor.dto.js'
import { ADVISOR_RUN_LOG, type AdvisorRunEntry, type AdvisorRunLog } from './advisor-run-log.js'

const RUN_NOT_FOUND = 'Diese Antwort wurde unterbrochen, vermutlich weil der Server neu gestartet wurde. Stelle die Frage bitte noch einmal.'

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
    /** The session and clearing a conversation: what no single part owns. */
    @Inject(AdvisorService) private readonly advisor: AdvisorService,
    @Inject(AdvisorTurn) private readonly turn: AdvisorTurn,
    @Inject(AdvisorConversations) private readonly conversations: AdvisorConversations,
    @Inject(ADVISOR_RUN_LOG) private readonly log: AdvisorRunLog,
    @Inject(ADVISOR_REPOSITORY) private readonly advisorRepo: AdvisorRepository,
  ) {}

  /** Checks and persists synchronously (a quota error is still plain HTTP), then lets the run go. */
  async start(userId: string, taxYear: number, dto: SendAdvisorMessageDto): Promise<{ runId: string }> {
    await this.reconcileOrphans(userId, taxYear)
    const turn = await this.turn.prepareTurn(userId, taxYear, dto)
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
      for await (const event of this.turn.executeTurn(userId, taxYear, turn, signal)) {
        await this.log.append(turn.runId, event)
      }
    } catch (error) {
      this.logger.error(`Run ${turn.runId} broke: ${error instanceof Error ? error.message : String(error)}`)
      await this.log
        .append(turn.runId, {
          event: 'error',
          data: { code: 'ADVISOR_TURN_FAILED', message: TURN_FAILED_MESSAGE },
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

  /** The answers whose run no instance knows any more (crash, deploy): they can never finish. Reads only. */
  private async orphans(userId: string, taxYear: number) {
    const found = []
    for (const message of await this.advisorRepo.listStreamingForUserAndYear(userId, taxYear)) {
      if (message.runId !== null && (await this.log.info(message.runId)) !== null) continue
      // Without a shared log (no Redis) an unknown run may simply live on another instance. No run
      // outlasts the turn budget, so only an answer older than that is certainly lost.
      if (!this.log.shared && Date.now() - message.createdAt.getTime() < ORPHAN_GRACE_MS) continue
      found.push(message)
    }
    return found
  }

  /** Marks the orphaned answers failed. Only on a write path: a GET does not change state (H2-18). */
  private async reconcileOrphans(userId: string, taxYear: number): Promise<void> {
    for (const message of await this.orphans(userId, taxYear)) {
      await this.advisorRepo.finishMessage(message.id, userId, {
        content: message.content,
        meta: message.meta,
        status: 'failed',
        reasoning: message.reasoning,
        usage: message.usage,
      })
    }
  }

  /** The session shows an orphaned answer as failed without writing it; the next write stores that (H2-18). */
  async getSession(userId: string, taxYear: number, conversationId?: string): Promise<AdvisorSessionResponseDto> {
    const [orphans, session] = await Promise.all([this.orphans(userId, taxYear), this.advisor.getSession(userId, taxYear, conversationId)])
    if (orphans.length === 0) return session
    const failed = new Set(orphans.map((message) => message.id))
    return {
      ...session,
      messages: session.messages.map((message) => (failed.has(message.id) ? { ...message, status: 'failed' as const, runId: undefined } : message)),
    }
  }

  /** An answer that is still being written would lose the message it writes into. */
  private async refuseWhileAnswering(userId: string, taxYear: number, conversationId: string | undefined, what: string): Promise<void> {
    await this.reconcileOrphans(userId, taxYear)
    const conversation = await this.conversations.conversationFor(userId, taxYear, conversationId)
    const messages = await this.advisorRepo.listForConversation(conversation.id, userId)
    if (messages.some((m) => m.status === 'streaming')) {
      throw new ConflictError('ADVISOR_RUN_ACTIVE', `Die Eule antwortet gerade noch. Stoppe die Antwort, bevor du ${what}.`)
    }
  }

  async clearConversation(userId: string, taxYear: number, conversationId?: string): Promise<{ deletedMessages: number }> {
    await this.refuseWhileAnswering(userId, taxYear, conversationId, 'den Verlauf leerst')
    return this.advisor.clearConversation(userId, taxYear, conversationId)
  }

  async summarizeConversation(userId: string, taxYear: number, conversationId: string): Promise<AdvisorContextDto> {
    await this.refuseWhileAnswering(userId, taxYear, conversationId, 'das Gespräch zusammenfasst')
    await this.turn.takeSummaryAllowance(userId)
    return this.conversations.summarizeConversation(userId, taxYear, conversationId)
  }

  async deleteConversation(userId: string, taxYear: number, conversationId: string): Promise<{ deletedMessages: number }> {
    await this.refuseWhileAnswering(userId, taxYear, conversationId, 'das Gespräch löschst')
    return this.conversations.deleteConversation(userId, taxYear, conversationId)
  }

  /** On shutdown every run of this instance ends as aborted instead of staying `streaming`. */
  async onApplicationShutdown(): Promise<void> {
    const runs = [...this.active.values()]
    for (const run of runs) run.stop.abort()
    await Promise.allSettled(runs.map((run) => run.finished))
  }
}
