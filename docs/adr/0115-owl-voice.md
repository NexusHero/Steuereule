# ADR-0115 — The owl's voice and ear come from speech models behind a port

- **Status:** Accepted
- **Date:** 2026-11-28
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/speech/`, `apps/api/src/capabilities/`, `apps/mobile-web/src/lib/readAloud/`, `apps/mobile-web/src/lib/conversation/`, `apps/mobile-web/src/screens/advisor/conversation/`
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

1. **A port, independent of the chat model.** `SpeechPort.speak({ text, language })` returns one
   WAV file. Two adapters: `MistralSpeech` (Voxtral, `POST /v1/audio/speech`, data hosted in the
   EEA by default) and `GeminiSpeech` (Generative Language API). `FakeSpeech` is the scripted voice
   of CI and tests, on with `AI_FAKE_KI`. `NoSpeech` stands where nothing is configured. Another
   provider is another adapter. Which model answers a conversation plays no part in which
   provider speaks it.
2. **Off until named.** The voice is on only with `AI_SPEECH_PROVIDER` (`mistral` or
   `google-genai`) and that provider's own key (`MISTRAL_API_KEY`; `GEMINI_API_KEY` or
   `GOOGLE_API_KEY`). A key that is present for the chat does not switch it on: reading aloud sends answer text
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
7. **Voice and model.** Defaults per provider: Mistral `voxtral-mini-tts-3-0` with `voice_481`
   (Heidi, its one German preset) and `voice_447` for English, because a Mistral voice speaks one
   language; Gemini `gemini-3.8-flash-tts` with `Sulafat` for both. All are settings
   (`AI_SPEECH_MODEL`, `AI_SPEECH_VOICE`, `AI_SPEECH_VOICE_EN`). The request carries the passage and nothing
   else: a style line in front of it was spoken with it (checked by transcribing the audio).

## Addendum (2026-11-28) — the spoken conversation

8. **Hearing.** `SpeechPort.transcribe({ wav, language })` answers the words of one utterance.
   `POST /v1/eulen-modus/gehoert` takes it as a multipart WAV file (16-bit mono, at most 2 MB, about
   60 seconds), with its own throttle (120 in ten minutes) and the daily counter of the voice. The
   recording is not kept. Gemini gets the recording next to an order to write it down and not to
   act on it; Mistral gets it at its transcription endpoint.
9. **Silence never reaches a model.** Asked to write down two seconds of silence, Gemini answered
   "Hallo, guten Morgen." `SpeechService` checks the samples first (`hasSound`: three 50 ms frames
   above -40 dBFS) and answers an empty text.
10. **A cascade, not a speech-to-speech model.** Utterance → words → an ordinary chat message →
    answer → voice. The owl's tools, the tax core, the topic guard and the model the user picked all
    stay in the path, and everything said is a stored chat message. The price is latency: each step
    waits for the one before.
11. **The course of a conversation is one framework-free state machine**
    (`lib/conversation/conversation.ts`): off → starting → listening ⇄ hearing → understanding →
    thinking → speaking → listening. An utterance ends after 0.9 s of quiet (`voiceActivity.ts`) or
    with „Fertig“. The answer is spoken while it is written: its first sentence alone, then passages
    of at most 220 characters. Only the owl's own written words are spoken; notes the app appends
    to the stored answer stay in the chat.
12. **Interrupting is a press.** While the owl speaks the microphone is not evaluated, because it
    would hear the owl's own voice. „Unterbrechen“ stops the voice and the answer.
13. **Spoken answers are short.** A spoken message carries `spoken: true`. The turn context then
    asks for at most three short sentences without lists or headings and one question at most, and
    the model thinks at its lowest level (`withSpokenPace`), unless the message asked for Max.
    Measured with Gemini 3.8 Flash: without it the owl spoke for almost three minutes and began
    after 22 seconds; with it, two sentences, the first after 11 to 18 seconds.
14. **The picture is a line.** Straight at rest; the two lighter greys follow the microphone, all
    three follow the voice (from the loudness of the WAV file that plays), one bump travels while
    the owl thinks. No accent colour. With reduced motion the line stands still and the state is
    written under it, as it always is.
15. **It starts with a press that says what leaves the device.** The microphone is opened only
    after „Gespräch starten“, under the sentence that what is said goes to the speech service.

16. **What did not go to the chat model is struck through in what was said** (ADR-0091, addendum).
    The note under it says that the speech service heard it: the masking runs after the
    transcription, before the chat model.

## Consequences

- With the voice on, the text of every answer a user has read aloud goes to the speech provider.
  Personal data reaches an answer only with the user's consent (ADR-0091), but then it is in the
  spoken text too. The provider has to be named in the privacy notice before `AI_SPEECH_PROVIDER`
  is set on a deployment. Mistral states that API data is hosted in the EEA by default; whether
  inputs are used for training is a setting of the Mistral account (Admin, Privacy) and has to be
  off, and zero data retention is granted on request for paid accounts. A Generative Language API
  key gives no assurance of processing in the EU.
- The Mistral adapter is tested against the documented request and response, not yet against the
  live API: no Mistral key existed when it was written. The real-call measurements below are
  Gemini's.
- Audio is sent as uncompressed WAV, about 48 kB per second at 24 kHz. A passage is a few hundred
  kilobytes. A compressed format would need an encoder on the server.
- A spoken conversation is slower than one with a speech-to-speech model: measured, 3 to 4 seconds
  until the words stand on screen (0.9 s pause, then the transcription) and 11 to 18 seconds until
  the first spoken word, most of it the chat model. Streaming transcription and a streamed voice
  would shorten the first and the last step; the wait for the chat model stays.
- Not checked on a real microphone, on Safari or on a phone: the gate and the measurements fed the
  browser a synthetic microphone. Echo, room noise and the pause threshold need a hearing test.
- The speech model is not streamed: a passage plays once it is complete. The wait before the first
  word is the time the provider needs for the first passage, measured at 1.9 to 3.8 seconds for
  passages of 3 to 139 characters (seven calls, 28.11.2026).
- Dictation through the server is not built. The composer's microphone still writes down on the
  device (ADR-0061).
