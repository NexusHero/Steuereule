# ADR-048 — KI-Architektur: Determinismus-Grenze + LangChain hinter Port

**Status:** Akzeptiert (Grilling Architektur-Session) · 2026-07-22 · **ersetzt frühere
AI-SDK-Fassung** · Provider-Endwahl **offen** (wartet auf Datenschutz-Klärung)

**Kontext:** Die KI-Regeln sind produktseitig entschieden (ADR-002, 014, 015, 037–042). Offen
war die *Architektur*: was rechnet die KI, wie kommt Output verlässlich in Form, welches
Framework/Anbieter — und wie bleiben wir bei einem noch offenen Datenschutz-Entscheid
handlungsfähig. **Zusätzliches Ziel: SteuerEule ist auch ein Portfolio-Projekt** — vorzeigbare,
gefragte Framework-Skills (LangChain, LangGraph) bewusst zu demonstrieren ist ein eigenständiges,
legitimes Ziel und gewichtet die Framework-Wahl mit, nicht nur die „minimale Abhängigkeiten"-DNA.

**Entscheidung:**

**1. Determinismus-Grenze (präzisiert ADR-014).** `packages/core` rechnet, deterministisch,
und ist die **alleinige Quelle jeder Zahl** (Günstigerprüfung, Fünftelregelung, zumutbare
Belastung, Erstattungs-Spanne). Das **LLM rechnet nie selbst**. Es (a) *versteht* aufbereitete
Beleg-Daten, (b) *schlägt* Kategorie/Regel *vor* (Objekt, das der Nutzer per Tap annimmt,
ADR-014), (c) *erklärt* Rechtsquellen (ADR-039). Jede angezeigte Zahl kommt aus dem Kern und
trägt Herkunft.

**2. Kontrollierter In- und Output.** Das LLM schließt **nur über von uns aufbereitete Daten**
(kein roher Fremdkontext) und **antwortet ausschließlich in einem vorgegebenen Schema**
(`chatModel.withStructuredOutput(zodSchema)`). Die App validiert die Form und rendert sie. Damit
ist die Vertrauensregel eine **Architektur-Garantie**, keine Prompt-Bitte: das LLM kann per
Konstruktion keine unbelegte Zahl und keinen Freitext-Fakt in die Erklärung bringen.

**3. KI-Schicht: LangChain.js hinter einem `KiService`-Port.** Ein dünner **`KiService`-Port**
(NestJS-Interface in Domänensprache: `schlageVorAusBeleg(...)`, `erklaereQuelle(...)`) trennt die
Domäne vom Framework. *Innen* orchestriert **LangChain.js** — gepinnt auf die aktuelle **v1.x-Linie** (Stand 07/2026:
`langchain@1.5.3`, `@langchain/core@1.2.3`, `@langchain/langgraph@1.4.8`, `@langchain/openai@1.5.5`,
`@langchain/anthropic@1.5.1`, `@langchain/google-genai@2.2.0`). Provider bleibt **agnostisch** über
LangChains Chat-Model-Integrationen — `@langchain/openai`, `@langchain/anthropic`,
`@langchain/google-genai`, OpenRouter (OpenAI-kompatibel) —, jeder mit eigenem API-Key, aktiver
Provider + Modell per Config. **OpenRouter** läuft über `@langchain/openai` mit
OpenRouter-`baseURL` (OpenAI-kompatibel), kein eigenes Paket nötig. **LangChain ersetzt den
Vercel AI SDK** (keine zwei überlappenden Abstraktionen).

**4. Agents & RAG: LangGraph.js.** Agentische Workflows (Persistence, Rewind, Human-in-the-Loop)
laufen über **LangGraph.js** — SDK-agnostisch, hinter demselben Port. Der **Eulen-Modus** ist im
Kern **RAG über Rechtsquellen** (menschlich übersetzte Gesetze/Urteile + „Rechtsstand"-Datum +
Archiv-Wache über *neue* Urteile, ADR-039/040/042); hier greifen LangChains Retrieval-/
Vector-Abstraktionen und LangGraph-RAG. Der Bau phased mit dem Eulen-Modus-Feature; der Kern
bietet dem Agent seine deterministischen Funktionen als **Tools** an (Regel rechnen, Quelle
nachschlagen), Zustand über Redis/Postgres.

**5. Datenschutz-Leitplanke.** OpenRouter/OpenAI/Gemini sind US-seitig — **alle Prompts laufen
durch**. Deshalb: diese Provider für **Dev, Experimente, nicht-sensible Aufgaben**; für
**Produktion mit sensiblen Belegdaten** ein **EU-getermter/EU-gehosteter** Weg (Mistral-EU,
Gemini via Vertex-EU-Region, oder Anthropic-EU mit `inference_geo:"eu"` + ZDR + AVV). Die
On-Device-OCR (ADR-045) minimiert, was das Gerät überhaupt verlässt. Provider-Endwahl bleibt
geparkt bis zur Rechtsklärung — dank Agnostik ein Config-Wechsel hinter dem Port.

**Konsequenzen:** LangChain + LangGraph sind erkennbare, gefragte Frameworks — als Portfolio-
Schaustück gewollt (v. a. der RAG-Eulen-Modus). **Ehrliche Absicherung:** LangChain.js hat mit
**v1.0 die stabilisierte GA-Linie** erreicht (deutlich weniger Bruch-Churn als die 0.x-Ära), ist
aber weiterhin jünger als die Python-Variante — deshalb **Versionen pinnen** (siehe oben) und strikt
**hinter dem `KiService`-Port** halten, damit Updates kontrolliert bleiben und ein Wechsel auf eine
schlankere Schicht möglich bliebe, falls es beißt. Der agnostische Ansatz kostet etwas native Ergonomie
(Design auf den gemeinsamen Nenner) — bewusst in Kauf genommen. Zu klären mit Datenschutz/Recht:
ZDR vs. Retention · `inference_geo`+AVV vs. GCP-Bindung · kein Training auf Nutzdaten · dürfen
Belege überhaupt (auch EU) an ein LLM oder nur abgeleitete Felder.
