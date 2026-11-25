import {
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { ApiExcludeEndpoint } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  AUTH_CONTEXT_REQUEST_KEY,
  USER_ID_REQUEST_KEY,
  UserContextGuard,
  type AssistantAuthContext,
  type RequestWithUserId,
} from '../auth/user-context.guard.js'
import { AcceptsAssistantToken } from '../auth/accepts-assistant-token.js'
import { AuditService } from '../audit/audit.service.js'
import { BETTER_AUTH_BUNDLE } from '../auth/auth.tokens.js'
import type { BetterAuthBundle } from '../auth/better-auth.js'
import { MCP_RESOURCE_PATH, MCP_STREAMABLE_PATH, mcpBearerChallenge } from '../auth/mcp-oauth.js'
import { assistantAuditSource } from '../audit/audit-source.js'
import { McpRateLimiter } from './mcp-rate-limit.js'
import { McpService, type AssistantSessionInfo } from './mcp.service.js'

interface McpSseSession {
  readonly transport: SSEServerTransport
  readonly userId: string
  /** The client that opened the session: its scopes are the session's, so only it may send to it. */
  readonly clientId: string
  readonly createdAt: Date
}

/**
 * Remote MCP Server HTTP controller with two transports (ADR-0052 §2, amendment 6): the Streamable HTTP
 * endpoint `POST /mcp`, stateless (a fresh server per request, nothing kept between requests, so any
 * instance answers any request), and the older SSE transport `GET /mcp/sse` + `POST /mcp/messages` for
 * clients that still use it; its sessions live in this process only.
 * Traces to: ADR-0052 §2 (OAuth 2.1 Remote MCP), §3 (Werkzeuge), amendment 6 (Transport, Limits).
 */
@Controller('mcp')
@AcceptsAssistantToken()
@UseGuards(UserContextGuard)
export class McpController {
  private readonly sessions = new Map<string, McpSseSession>()
  private readonly limiter: McpRateLimiter

  constructor(
    @Inject(McpService) private readonly mcpService: McpService,
    @Inject(BETTER_AUTH_BUNDLE) private readonly betterAuth: BetterAuthBundle,
    @Optional() @Inject(McpRateLimiter) limiter?: McpRateLimiter,
    @Optional() @Inject(AuditService) private readonly audit?: AuditService,
  ) {
    this.limiter = limiter ?? new McpRateLimiter()
  }

  /** No assistant token: 401 with the pointer to the sign-in, so an MCP client can start the OAuth flow (RFC 9728 §5.1). */
  private challenge(reply: FastifyReply, resourcePath: string = MCP_RESOURCE_PATH): never {
    reply.header('WWW-Authenticate', mcpBearerChallenge(String(this.betterAuth.auth.options.baseURL), resourcePath))
    throw new UnauthorizedException('Der MCP-Endpunkt ist nur für autorisierte KI-Assistenten mit OAuth-Bearer-Token zugänglich.')
  }

  /** The assistant behind the request, or null when it carries no assistant token. */
  private assistantOf(request: RequestWithUserId): { userId: string; assistant: AssistantSessionInfo } | null {
    const authContext = request[AUTH_CONTEXT_REQUEST_KEY]
    const userId = request[USER_ID_REQUEST_KEY]
    if (!authContext || authContext.source !== 'assistent' || !userId) return null
    const { clientId, clientName, scopes } = authContext as AssistantAuthContext
    return { userId, assistant: { clientId, clientName, scopes } }
  }

  /** A refused message as JSON-RPC error with a code and the next step, not as bare text (H2-29). */
  private refuseMessage(reply: FastifyReply, status: 404 | 403, code: string, message: string, nextStep: string): void {
    reply.raw
      .writeHead(status, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: `${code}: ${message}`, data: { code, naechsterSchritt: nextStep } }, id: null }))
  }

  /** Streamable HTTP, stateless: each JSON-RPC request gets its own server and transport, closed with the response. */
  @Post()
  @ApiExcludeEndpoint()
  async streamable(@Req() request: RequestWithUserId, @Res() reply: FastifyReply): Promise<void> {
    const caller = this.assistantOf(request)
    if (!caller) this.challenge(reply, MCP_STREAMABLE_PATH)

    reply.hijack()
    const server = this.mcpService.createServer(caller.userId, caller.assistant)
    // No session id generator: stateless mode, no session to keep or to find on another instance.
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true })
    reply.raw.on('close', () => {
      void transport.close()
      void server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(request.raw, reply.raw, request.body)
  }

  /** The stateless endpoint keeps no stream to resume and no session to end (MCP Streamable HTTP, stateless mode). */
  @Get()
  @Delete()
  @ApiExcludeEndpoint()
  async streamableOther(@Res() reply: FastifyReply): Promise<void> {
    reply.hijack()
    reply.raw
      .writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST' })
      .end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: dieser Endpunkt nimmt nur POST an.' }, id: null }))
  }

  @Get('sse')
  async sse(@Req() request: RequestWithUserId, @Res() reply: FastifyReply): Promise<void> {
    const caller = this.assistantOf(request)
    if (!caller) this.challenge(reply)
    const { userId, assistant } = caller

    const transport = new SSEServerTransport('/mcp/messages', reply.raw)
    const sessionId = transport.sessionId
    if (!this.limiter.openSession(userId, sessionId)) {
      await this.audit?.append({ userId, action: 'READ', resource: 'mcp_sessions_limited', source: assistantAuditSource(assistant.clientId) })
      throw new HttpException(
        `RATE_LIMITED: Es sind schon höchstens ${this.limiter.limits.openSessionsPerUser} MCP-Verbindungen für dieses Konto offen. Schließe eine andere Verbindung oder nutze den Endpunkt /mcp.`,
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
    reply.hijack()

    this.sessions.set(sessionId, { transport, userId, clientId: assistant.clientId, createdAt: new Date() })

    // oxlint-disable-next-line unicorn/prefer-add-event-listener
    transport.onclose = () => {
      this.sessions.delete(sessionId)
      this.limiter.closeSession(userId, sessionId)
    }

    const server = this.mcpService.createServer(userId, assistant)
    await server.connect(transport)
  }

  @Post('messages')
  async messages(@Req() request: RequestWithUserId, @Res() reply: FastifyReply): Promise<void> {
    const caller = this.assistantOf(request)
    if (!caller) this.challenge(reply)
    const { userId, assistant } = caller

    const query = request.query as { sessionId?: string } | undefined
    const sessionId = query?.sessionId

    if (!sessionId || !this.sessions.has(sessionId)) {
      // Sessions live in one instance (ADR-0052 amendment 6 no. 4): a message that lands elsewhere is told where to go.
      return this.refuseMessage(reply, 404, 'MCP_SESSION_NOT_FOUND', 'Die SSE-Sitzung gibt es auf diesem Server nicht (abgelaufen oder auf einer anderen Instanz).', 'Verbinde dich über den Endpunkt /mcp (Streamable HTTP); er braucht keine Sitzung.')
    }

    const session = this.sessions.get(sessionId)!
    if (session.userId !== userId) {
      await this.audit?.append({ userId, action: 'READ', resource: 'mcp_session_other_account', source: assistantAuditSource(assistant.clientId) })
      return this.refuseMessage(reply, 403, 'MCP_SESSION_OTHER_ACCOUNT', 'Diese Sitzung gehört zu einem anderen Konto.', 'Öffne mit deinem eigenen Token eine neue Verbindung über /mcp.')
    }
    // The server behind the session carries the scopes of the client that opened it. Another assistant of
    // the same user, granted less, must not act through it (ADR-0052 amendment 9); the attempt is audited (H2-29).
    if (session.clientId !== assistant.clientId) {
      await this.audit?.append({ userId, action: 'READ', resource: 'mcp_session_other_client', source: assistantAuditSource(assistant.clientId) })
      return this.refuseMessage(reply, 403, 'MCP_SESSION_OTHER_CLIENT', 'Diese Sitzung hat ein anderer Assistent geöffnet.', 'Öffne eine eigene Verbindung über /mcp.')
    }

    reply.hijack()
    await session.transport.handlePostMessage(request.raw, reply.raw, request.body)
  }
}
