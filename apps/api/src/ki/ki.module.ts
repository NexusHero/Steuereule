import { Module } from '@nestjs/common'
import {
  AI_RUNTIME_CONFIG_SERVICE,
  EnvAiRuntimeConfigService,
} from './ai-runtime-config.service.js'
import { CHAT_MODEL_FACTORY, createChatModelFromConfig } from './chat-model.factory.js'
import { KI_PORT, RagKiAdapter } from './ki.adapter.js'
import { ADVISOR_ENGINE, LangGraphAdvisorEngine } from './langgraph-advisor.engine.js'

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
    LangGraphAdvisorEngine,
    {
      provide: ADVISOR_ENGINE,
      useExisting: LangGraphAdvisorEngine,
    },
  ],
  exports: [
    KI_PORT,
    RagKiAdapter,
    AI_RUNTIME_CONFIG_SERVICE,
    EnvAiRuntimeConfigService,
    ADVISOR_ENGINE,
    LangGraphAdvisorEngine,
  ],
})
export class KiModule {}
