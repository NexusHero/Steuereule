import { Module } from '@nestjs/common'
import { CHAT_MODEL_FACTORY, type ChatModelFactory } from '../llm/chat-model.factory.js'
import { AI_RUNTIME_CONFIG_SERVICE, EnvAiRuntimeConfigService } from '../llm/ai-runtime-config.service.js'
import { MODEL_CALL_COUNTER } from '../llm/model-call-counter.js'
import { ModelConnectionService } from '../llm/model-connection.service.js'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../auth/auth.tokens.js'
import { createAdvisorChatModel } from './advisor-chat-model.js'
import { KI_PORT, RagKiAdapter } from './ki.adapter.js'
import { singleShotFactoryFrom } from '../llm/langchain-single-shot.adapter.js'
import { SINGLE_SHOT_MODEL_FACTORY } from '../llm/single-shot-model.js'
import { ADVISOR_ENGINE } from './advisor-engine.token.js'
import { LangGraphAdvisorEngine } from './langgraph-advisor.engine.js'
import { ADVISOR_TOPIC_GUARD, AdvisorTopicGuard } from './advisor-topic-guard.js'

@Module({
  providers: [
    RagKiAdapter,
    {
      provide: KI_PORT,
      useExisting: RagKiAdapter,
    },
    {
      // `llm/` counts the day's model calls on a port; the app's shared rate-limit storage is the counter (ADR-0109).
      // Without the auth module (a test module) there is none, and the calls are not capped.
      provide: MODEL_CALL_COUNTER,
      inject: [{ token: BETTER_AUTH_BUNDLE, optional: true }],
      useFactory: (bundle?: Pick<BetterAuthBundle, 'rateLimitStorage'>) => bundle?.rateLimitStorage,
    },
    EnvAiRuntimeConfigService,
    {
      provide: AI_RUNTIME_CONFIG_SERVICE,
      useExisting: EnvAiRuntimeConfigService,
    },
    ModelConnectionService,
    {
      // The owl's script answers for the `fake` provider, so the factory is composed here and not in `llm/`.
      provide: CHAT_MODEL_FACTORY,
      useValue: createAdvisorChatModel,
    },
    {
      provide: SINGLE_SHOT_MODEL_FACTORY,
      inject: [CHAT_MODEL_FACTORY],
      useFactory: (chatModels: ChatModelFactory) => singleShotFactoryFrom(chatModels),
    },
    AdvisorTopicGuard,
    {
      provide: ADVISOR_TOPIC_GUARD,
      useExisting: AdvisorTopicGuard,
    },
    LangGraphAdvisorEngine,
    {
      provide: ADVISOR_ENGINE,
      useExisting: LangGraphAdvisorEngine,
    },
  ],
  exports: [
    KI_PORT,
    RagKiAdapter,
    SINGLE_SHOT_MODEL_FACTORY,
    AI_RUNTIME_CONFIG_SERVICE,
    EnvAiRuntimeConfigService,
    ModelConnectionService,
    ADVISOR_ENGINE,
    LangGraphAdvisorEngine,
  ],
})
export class KiModule {}
