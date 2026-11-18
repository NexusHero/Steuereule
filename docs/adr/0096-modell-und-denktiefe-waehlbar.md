# ADR-0096 — Modell und Denktiefe wählbar (Gründlich / Max)

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:**
  - `packages/core/src/interview/advisor-models.ts`
  - `apps/api/src/ki/{ai-runtime-config.service,chat-model.factory,langgraph-advisor.engine,advisor-model-catalog}.ts`
  - `apps/api/src/advisor/{advisor-models.service,advisor.controller,advisor.service,advisor-conversations,advisor.repository*}.ts`
  - `apps/api/prisma/migrations/20261118120000_conversation_chat_model/`
  - `apps/mobile-web/src/screens/advisor/{AdvisorChatPanel,OwlModeScreen*,CopilotBridgeProvider}.tsx`, `chat/ModelControls.tsx`
- **Baut auf:** ADR-0069 (Themengrenze), #481 (Denkstufe mittel), #493 (Ausweichmodell)

## Kontext

Modell und Denktiefe der Eule waren bisher nur über Umgebungsvariablen einstellbar (`AI_ADVISOR_MODEL`, `AI_ADVISOR_THINKING_LEVEL=medium`). Nutzer wollen für schwierige Fragen gründlicher denken lassen und das Modell selbst wählen, dabei aber sehen, was das kostet. Die Modelle unterscheiden sich darin, wie man die Tiefe steuert: Neuere Claude-Modelle über `effort`, Claude bis 4.5 über ein Token-Budget, Gemini 3 über `thinkingLevel` bis `high`, andere gar nicht. Ein falscher Parameter führt zu einem Fehler 400.

## Entscheidung

1. **Zwei Stufen pro Nachricht:** „Gründlich“ ist der bisherige Standard (medium) und bleibt Voreinstellung. „Max“ denkt deutlich tiefer: Claude `effort: high`, Gemini `high`, Claude bis 4.5 ein Budget von 16.000 Tokens. Claude `effort: max` wurde gemessen und verworfen: Für eine einfache Frage brauchte es 330 s statt 17 s und etwa 15-mal die Kosten von Gründlich (Entscheidung des Nutzers nach dem Prüflauf). Kann ein Modell nicht tiefer als Gründlich, gibt es Max nicht. Max gilt nur für die eine Nachricht und schaltet sich danach aus. Eine Max-Antwort bekommt Platz für 20.000 Tokens und die Zeit einer Aufgabe (120 s statt 60 s); mit den üblichen 4.096 Tokens und 60 s kam sie im Prüflauf leer zurück oder lief in die Zeitgrenze. Es zählt nicht extra aufs Tageskontingent; ein eigenes Limit gibt es nicht.
2. **Modell pro Gespräch:** Der Nutzer wählt aus allen Chat-Modellen der Anbieter, für die ein Schlüssel hinterlegt ist. Die Liste kommt vom Anbieter selbst (Anthropic `GET /v1/models`, Gemini `models`, OpenAI `models`), wird 6 Stunden zwischengespeichert und enthält immer das Standardmodell. Die Wahl steht am Gespräch (`BeraterGespraech.modell`, „provider:model“). Fehlt der Schlüssel eines gewählten Anbieters später, antwortet das Standardmodell.
3. **Eine Fähigkeitsliste im Kern** (`advisor-models.ts`) legt je Modell fest, wie die Tiefe gesteuert wird und welche Stufen es gibt. API (Modellaufbau) und App (Angebot) lesen dieselbe Liste; der Server prüft selbst.
4. **Kosten relativ und gemessen:** Jede Antwort speichert in ihrem Verbrauch (`verbrauch`, ohne Inhalt) Anbieter, Modell, Stufe, Tokens und die Zeit bis zum ersten Wort. Die App zeigt den Median der letzten 2.000 Antworten im Verhältnis zum Standardmodell mit Gründlich, z. B. „ca. 3× Kosten · erste Worte nach ca. 15 s“. Unter 5 Antworten heißt es „noch nicht gemessen“. Ein Kostenfaktor braucht Tokenpreise; hinterlegt sind die Listenpreise von Anthropic. Ohne Preis steht „Kosten noch nicht bekannt“ mit der gemessenen Wartezeit.
5. **Beim Betreiber bleiben:** Belegscan, Themenprüfung (Guard) und Ausweichmodell folgen nicht der Wahl. Springt das Ausweichmodell bei einer Max-Frage ein, denkt es auf seiner eigenen höchsten Stufe; die Statuszeile sagt, wer antwortet.
6. **Keine Schlüssel in URLs:** Die Modelllisten werden mit Schlüssel im Header abgefragt (`x-api-key`, `x-goog-api-key`, `Authorization`).

## Folgen

- Max kostet laut Messung mehrfach so viel wie Gründlich; ohne Limit trägt der Nutzer die Entscheidung allein, die relative Angabe ist der einzige Bremsklotz.
- Neue Modelle eines Anbieters sind sofort wählbar, bevor sie den Echtdaten-Prüflauf bestanden haben. Ein Modell, das bei der Steuer schlechter rechnet, steht dann ohne Warnung im Angebot. Beides ist bewusst so entschieden und lässt sich später einschränken (Liste des Betreibers, Limit für Max).
- Ein Wechsel des Modells mitten im Gespräch verliert den Prompt-Cache dieses Gesprächs; deshalb gilt die Modellwahl pro Gespräch, nicht pro Nachricht.
- Preise anderer Anbieter fehlen; ihr Kostenfaktor bleibt unbekannt, bis Preise hinterlegt sind.
