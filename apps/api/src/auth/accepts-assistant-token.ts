import { SetMetadata } from '@nestjs/common'

export const ACCEPTS_ASSISTANT_TOKEN = 'acceptsAssistantToken'

/**
 * Marks the one kind of controller an assistant's OAuth token is good for: the MCP endpoint. Everywhere
 * else `UserContextGuard` refuses a bearer token, so the tools stay the assistant's only way to the data
 * (their scopes, the read view, "only the user confirms"). Traces to: ADR-0052 §3, amendment 4.
 */
export const AcceptsAssistantToken = (): ClassDecorator => SetMetadata(ACCEPTS_ASSISTANT_TOKEN, true)
