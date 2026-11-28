# ADR-0115 — The owl's voice comes from a speech model behind a port

- **Status:** Accepted
- **Date:** 2026-11-28
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/speech/`, `apps/api/src/capabilities/`, `apps/mobile-web/src/lib/readAloud/`
- **Builds on:** ADR-0038 (the model sits behind a port), ADR-0109 (cost limits on costly routes), ADR-0111 (production configuration is declared)

## Context

„Vorlesen“ under an answer read with the device's own voice (Web Speech API). That costs nothing
and sends nothing, but the voice is whatever the device ships, and a device without a voice for the
language has no button at all. Dictation and a spoken conversation with the owl are planned; both
need speech from a model, and the Product Owner chose a model voice over the device voice by ear
from samples.

The chat model does not have to be the speech model. The user picks the chat model per
conversation (ADR-0096); a speech model only turns finished text into audio. Anthropic offers no
speech endpoint, so a conversation answered by Claude needs another provider for its voice anyway.

## Decision

1. **A port.** `SpeechPort.speak({ text, language })` returns one WAV file. `GeminiSpeech` is the
   first adapter (Generative Language API, key in a header). `FakeSpeech` is the scripted voice of
   CI and tests, on with `AI_FAKE_KI`. `NoSpeech` stands where nothing is configured. Another
   provider is another adapter.
2. **Off until named.** The voice is on only with `AI_SPEECH_PROVIDER=google-genai` and a Gemini
   key. A key that is present for the chat does not switch it on: reading aloud sends answer text
   to the speech provider, which is a data flow of its own and may go to a provider the chat does
   not use. `AI_KILL_SWITCH` switches it off with every other model slot.
3. **One route, text in.** `POST /v1/eulen-modus/stimme` takes one passage of at most 600
   characters and a language (`de`, `en`). It needs an account, refuses assistant tokens, and
   answers `audio/wav` with `Cache-Control: no-store`. The app converts an answer to spoken text
   (`speechText`) and sends it in passages of at most 220 characters, so the first passage plays
   while the next is fetched. The route takes text rather than a message id because a spoken
   conversation will speak sentences of an answer that is still being written.
4. **Limits.** 150 passages per account in ten minutes (`SPEECH_THROTTLE`), and
   `AI_SPEECH_DAILY_CALL_LIMIT` (default 20,000) across all users. The daily counter is separate
   from the chat's model-call budget, so listening does not use up answers.
5. **The app asks the deployment.** `GET /v1/capabilities` carries `eulenStimme`. On, „Vorlesen“
   uses the server voice and needs no voice on the device. Off, it reads with the device's voice
   as before. When the server voice fails in the middle of an answer, the device's voice reads the
   rest where there is one.
6. **No provider text in logs or errors.** A failed call is logged with its reason and HTTP status
   only, because a provider's error message may quote the passage. The client gets a German
   sentence and a code (`SPEECH_UNAVAILABLE`, `SPEECH_FAILED`, `SPEECH_BUDGET_SPENT`).
7. **Voice and model.** Default voice `Sulafat`, default model `gemini-3.8-flash-tts`; both are
   settings (`AI_SPEECH_VOICE`, `AI_SPEECH_MODEL`). The request carries the passage and nothing
   else: a style line in front of it was spoken with it (checked by transcribing the audio).

## Consequences

- With the voice on, the text of every answer a user has read aloud goes to Google. Personal data
  reaches an answer only with the user's consent (ADR-0091), but then it is in the spoken text too.
  The provider has to be named in the privacy notice before `AI_SPEECH_PROVIDER` is set on a
  deployment. A Generative Language API key gives no assurance of processing in the EU; Vertex AI
  with an EU region or a European provider would, and either is a new adapter.
- Audio is sent as uncompressed WAV, about 48 kB per second at 24 kHz. A passage is a few hundred
  kilobytes. A compressed format would need an encoder on the server.
- The speech model is not streamed: a passage plays once it is complete. The wait before the first
  word is the time the provider needs for the first passage, measured at 1.9 to 3.8 seconds for
  passages of 3 to 139 characters (seven calls, 28.11.2026).
- Dictation and the spoken conversation are not part of this decision. They add
  `transcribe` to the port and their own routes.
