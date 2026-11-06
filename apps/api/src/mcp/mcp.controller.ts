import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import {
  AUTH_CONTEXT_REQUEST_KEY,
  USER_ID_REQUEST_KEY,
  UserContextGuard,
  type AssistantAuthContext,
  type RequestWithUserId,
} from '../auth/user-context.guard.js'
import { McpService } from './mcp.service.js'

interface McpSession {
  readonly transport: SSEServerTransport
  readonly userId: string
  readonly createdAt: Date
}

/**
 * Remote MCP Server HTTP/SSE controller.
 * Traces to: ADR-0052 §2 (OAuth 2.1 Remote MCP), §3 (Werkzeuge).
 */
@Controller('mcp')
@UseGuards(UserContextGuard)
export class McpController {
  private readonly sessions = new Map<string, McpSession>()

  constructor(@Inject(McpService) private readonly mcpService: McpService) {}

  @Get('sse')
  async sse(@Req() request: RequestWithUserId, @Res() reply: FastifyReply): Promise<void> {
    const authContext = request[AUTH_CONTEXT_REQUEST_KEY]
    const userId = request[USER_ID_REQUEST_KEY]

    if (!authContext || authContext.source !== 'assistent' || !userId) {
      throw new ForbiddenException('Der MCP-Endpunkt ist nur für autorisierte KI-Assistenten mit OAuth-Bearer-Token zugänglich.')
    }

    const assistantContext = authContext as AssistantAuthContext
    reply.hijack()

    const transport = new SSEServerTransport('/mcp/messages', reply.raw)
    const sessionId = transport.sessionId

    this.sessions.set(sessionId, {
      transport,
      userId,
      createdAt: new Date(),
    })

    // oxlint-disable-next-line unicorn/prefer-add-event-listener
    transport.onclose = () => {
      this.sessions.delete(sessionId)
    }

    const server = this.mcpService.createServer(userId, {
      clientId: assistantContext.clientId,
      clientName: assistantContext.clientName,
      scopes: assistantContext.scopes,
    })

    await server.connect(transport)
  }

  @Post('messages')
  async messages(@Req() request: RequestWithUserId, @Res() reply: FastifyReply): Promise<void> {
    const authContext = request[AUTH_CONTEXT_REQUEST_KEY]
    const userId = request[USER_ID_REQUEST_KEY]

    if (!authContext || authContext.source !== 'assistent' || !userId) {
      throw new ForbiddenException('Der MCP-Endpunkt ist nur für autorisierte KI-Assistenten mit OAuth-Bearer-Token zugänglich.')
    }

    const query = request.query as { sessionId?: string } | undefined
    const sessionId = query?.sessionId

    if (!sessionId || !this.sessions.has(sessionId)) {
      reply.raw.writeHead(404, { 'Content-Type': 'text/plain' }).end('MCP session not found or expired')
      return
    }

    const session = this.sessions.get(sessionId)!
    if (session.userId !== userId) {
      reply.raw.writeHead(403, { 'Content-Type': 'text/plain' }).end('Session belongs to another user account')
      return
    }

    reply.hijack()
    await session.transport.handlePostMessage(request.raw, reply.raw, request.body)
  }
}
