import { Module } from '@nestjs/common'
import {
  AI_RUNTIME_CONFIG_SERVICE,
  EnvAiRuntimeConfigService,
} from './ai-runtime-config.service.js'
import { CHAT_MODEL_FACTORY, createChatModelFromConfig } from './chat-model.factory.js'
import { KI_PORT, RagKiAdapter } from './ki.adapter.js'
import { createSingleShotModelFromConfig } from './langchain-single-shot.adapter.js'
import { SINGLE_SHOT_MODEL_FACTORY } from './single-shot-model.js'
import { ADVISOR_ENGINE, LangGraphAdvisorEngine } from './langgraph-advisor.engine.js'
import { ModelConnectionService } from './model-connection.service.js'
import { ADVISOR_TOPIC_GUARD, AdvisorTopicGuard } from './advisor-topic-guard.js'

@Module({
  providers: [
    RagKiAdapter,
    {
      provide: KI_PORT,
      useExisting: RagKiAdapter,
    },
    EnvAiRuntimeConfigService,
    {
      provide: AI_RUNTIME_CONFIG_SERVICE,
      useExisting: EnvAiRuntimeConfigService,
    },
    {
      provide: CHAT_MODEL_FACTORY,
      useValue: createChatModelFromConfig,
    },
    {
      provide: SINGLE_SHOT_MODEL_FACTORY,
      useValue: createSingleShotModelFromConfig,
    },
    AdvisorTopicGuard,
    {
      provide: ADVISOR_TOPIC_GUARD,
      useExisting: AdvisorTopicGuard,
    },
    LangGraphAdvisorEngine,
    ModelConnectionService,
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
    ADVISOR_ENGINE,
    LangGraphAdvisorEngine,
    ModelConnectionService,
  ],
})
export class KiModule {}
