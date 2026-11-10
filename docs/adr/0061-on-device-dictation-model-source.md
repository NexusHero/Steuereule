# ADR-0061 — Diktieren Stufe 2: Sprachmodell von Hugging Face, gepinnt und geprüft (Abweichung von ADR-0060)

- **Status:** Accepted
- **Date:** 2026-11-10
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** Ticket #451 Slice 5 (Diktieren Stufe 2); `apps/mobile-web/src/lib/dictation/`, `apps/mobile-web/dictation/worker.mjs`, `apps/mobile-web/scripts/dictation-*.mjs`, `scripts/checks/bundle-security-check.mjs`
- **Weicht ab von:** ADR-0060 (selbst gehostete On-Device-OCR) für die Modelldateien
- **Ergänzt:** ADR-0008 (dokumentierte Ausnahme: Modell-Cache im Browser)

## Kontext

Slice 5 von #451 bringt einen eigenen Mikro-Button. Die Spracherkennung läuft auf dem Gerät
(Whisper „base“, mehrsprachig, im Browser über WebGPU). Der Ton verlässt das Gerät nie, der Text
landet im Eingabefeld und wird nie automatisch gesendet.

ADR-0060 hat für die OCR das Laden von einem öffentlichen CDN verworfen: Die IP-Adresse geht an
einen Dritten, es läuft ungepinnter Code, und „On-Device“ stimmt nur halb. Pinning und Prüfsumme
lösen den Punkt „ungepinnter Code“. Den Punkt „IP an Dritte“ lösen sie nicht.

## Entscheidung

**Option A: Die Modelldateien kommen von Hugging Face, gepinnt und geprüft; der Code, der sie
ausführt, bleibt selbst gehostet.**

1. **Modell:** `onnx-community/whisper-base` (Apache-2.0) auf Commit
   `27a07b4b52b3a4c5886134bb4320e93e1a4bbc7c`, int8-quantisierte ONNX-Dateien (Encoder +
   zusammengeführter Decoder) plus Konfiguration und Tokenizer, zusammen 79,7 MB.
   `scripts/dictation-model-lock.mjs` schreibt Pfad, Größe und SHA-256 jeder Datei nach
   `src/lib/dictation/modelLock.ts`.
2. **Erst Zustimmung, dann Download.** Vor dem ersten Diktat zeigt ein Dialog Größe, Herkunft
   (Hugging Face, USA) und dass Hugging Face IP-Adresse und Zeitpunkt sieht. Ohne Zustimmung geht
   kein Request hinaus. Der Abruf läuft ohne Cookies und ohne Referrer.
3. **Jede Datei wird geprüft.** Der Main-Thread lädt jede Datei von
   `huggingface.co/<repo>/resolve/<commit>/<pfad>` (große Dateien leitet Hugging Face auf sein
   eigenes CDN um, z. B. `us.aws.cdn.hf.co`), prüft SHA-256 gegen den Lock und legt sie erst
   dann in Cache Storage ab. Eine Abweichung verwirft den ganzen Cache; es bleibt nichts halb
   Geprüftes liegen.
4. **Laufzeit selbst gehostet (wie ADR-0060).** `scripts/dictation-assets.mjs` (postinstall) kopiert
   den Worker, `transformers.min.js` (transformers.js 4.3.2) und die ONNX-Runtime-WASM in genau der
   Version, die transformers.js bündelt, nach `public/dictation/`, geprüft gegen
   `dictation-assets.lock.json`. Im Bundle-Gate gilt ein eigenes Budget (32 MB), ungepinnte Dateien
   lassen es scheitern. Der Worker schaltet entferntes Laden ab und liest Modelldateien nur aus den
   geprüften Cache-Einträgen.
5. **Gerät:** Mikro-Button nur bei WebGPU und mindestens 4 GB Speicher (wo der Browser ihn meldet);
   sonst bleibt der Hinweis aus Stufe 1.
6. **Ton und Text:** Audio nur im Arbeitsspeicher, 16 kHz mono, nie gespeichert oder gesendet;
   Transkript ins Eingabefeld, der PII-Filter greift beim Senden wie bei getipptem Text.
7. **Cache:** einzige dokumentierte Ausnahme zu ADR-0008, ohne Nutzerdaten; „Profil → Sprachmodell
   löschen“ entfernt ihn. local- und sessionStorage bleiben unberührt (`no-client-persistence`).
8. **Datenschutzerklärung:** Hugging Face als Empfänger der IP-Adresse beim einmaligen Abruf,
   Einwilligung nach Art. 6 Abs. 1 lit. a und Art. 49 Abs. 1 lit. a DSGVO.

## Verworfene Alternative

**B — Modell selbst hosten wie ADR-0060.** Kein Request an Dritte, aber rund 80 MB mehr im
Web-Export und eigener Traffic beim ersten Diktat jedes Nutzers. Der Product Owner hat sich am
10.11.2026 für A entschieden; mit Zustimmung, Pinning und Prüfsumme ist der verbleibende Punkt
(IP-Adresse an Hugging Face) offen benannt und vom Nutzer gewählt.

## Konsequenzen

- Lokal einmal echt geprüft (headless Chromium mit Software-WebGPU): Download der 7 Dateien,
  Prüfsummen stimmen, der Worker lädt das Modell aus dem Cache und erkennt den Satz „Ich habe
  dieses Jahr 300 Euro gespendet.“; kontaktiert wurden nur der eigene Origin, `huggingface.co`
  und `us.aws.cdn.hf.co`. In CI lädt der Gate das Modell bewusst nicht.
- Ein Wechsel des Modells ist eine bewusste Änderung: neuer Commit in
  `scripts/dictation-model-lock.mjs`, Lock-Diff im Review.
- Ein Upgrade von transformers.js braucht `node scripts/dictation-assets.mjs --update`; das Skript
  bricht ab, wenn die gebündelte ONNX-Runtime nicht zum installierten WASM passt.
- Ist Hugging Face nicht erreichbar, kann man nicht diktieren; Tippen und das Diktat der Tastatur
  (Stufe 1) bleiben.
- Die native App (iOS/Android) nutzt später die Spracherkennung des Systems; dieselbe Regel
  (Text nur ins Feld, nie automatisch senden) gilt dort genauso.
