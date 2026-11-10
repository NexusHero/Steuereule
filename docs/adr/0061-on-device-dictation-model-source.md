# ADR-0061 — Diktieren Stufe 2: Herkunft des Sprachmodells (Abweichung von ADR-0060?)

- **Status:** Proposed
- **Date:** 2026-11-10
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** Ticket #451 Slice 5 (Diktieren Stufe 2), `apps/mobile-web`
- **Berührt:** ADR-0060 (selbst gehostete On-Device-OCR), ADR-0008 (keine sensiblen Daten im Client)

## Kontext

Slice 5 von #451 bringt einen eigenen Mikro-Button. Die Spracherkennung läuft auf dem Gerät
(Whisper „base“, mehrsprachig, ca. 75 MB, im Browser über WebGPU). Der Ton verlässt das Gerät nie,
der Text landet im Eingabefeld und wird nie automatisch gesendet.

Offen ist, **woher das Modell kommt**. Das Grilling vom 10.11.2026 hat entschieden (#451,
Entscheidung 12): von **Hugging Face**, auf einen Commit-Hash gepinnt, mit SHA-256-Prüfung vor der
Nutzung, nach Zustimmung, die Hugging Face (USA) und die Sichtbarkeit von IP-Adresse und Zeitpunkt
nennt.

ADR-0060 hat für die OCR genau das verworfen: Laden von einem öffentlichen CDN schickt die
IP-Adresse an einen Dritten, führt ungepinnten Code aus, und „On-Device“ stimmt dann nur halb.
Pinning und Prüfsumme lösen den Punkt „ungepinnter Code“. Den Punkt „IP an Dritte“ lösen sie nicht.

## Optionen

### A — Hugging Face, gepinnt und geprüft (Entscheidung 12 des Tickets)

- Modell-Dateien werden von `huggingface.co/<repo>/resolve/<commit>/…` geladen, jede Datei gegen
  eine eingecheckte Lock-Datei (SHA-256) geprüft; bei Abweichung bricht der Download ab.
- Der Zustimmungsdialog nennt Größe, Herkunft (Hugging Face, USA) und dass Hugging Face IP-Adresse
  und Zeitpunkt sieht. Ohne Zustimmung kein Request.
- Datenschutzerklärung: Hugging Face als Empfänger der IP-Adresse beim einmaligen Download;
  Rechtsgrundlage Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), Drittlandübermittlung USA.
- Vorteil: kein eigener Traffic, kein eigenes Hosting von 75 MB je Nutzer.
- Nachteil: bewusste Ausnahme von ADR-0060; Abhängigkeit von der Verfügbarkeit eines Dritten.

### B — Selbst gehostet wie ADR-0060

- Ein Skript (analog `scripts/ocr-assets.mjs`) holt die gepinnten Dateien einmalig beim Build,
  prüft sie gegen die Lock-Datei und legt sie unter `public/dictation/` ab; ausgeliefert vom
  eigenen Origin, eigenes Budget im Bundle-Gate.
- Kein Request an Dritte, auch nicht nach Zustimmung. Der Zustimmungsdialog nennt nur Größe und
  dass das Modell vom SteuerEule-Server kommt.
- Vorteil: ADR-0060 gilt unverändert; keine Drittlandübermittlung, keine Ergänzung der
  Datenschutzerklärung um Hugging Face.
- Nachteil: ca. 75 MB mehr im Web-Export und eigener Traffic beim ersten Diktat jedes Nutzers.

## Gemeinsam für beide Optionen

1. Mikro-Button nur bei WebGPU und genug Speicher; sonst bleibt der Hinweis aus Stufe 1.
2. Audio nur im Arbeitsspeicher, nie gespeichert oder verschickt; Transkript ins Eingabefeld, nie
   automatisch gesendet; der PII-Filter greift wie bei getipptem Text.
3. Das Modell liegt danach im Browser-Cache. Es enthält keine Nutzerdaten und ist die einzige,
   dokumentierte Ausnahme zu ADR-0008; „Sprachmodell löschen“ im Profil entfernt es.
4. Der Gate `no-client-persistence` bleibt grün; der Modell-Cache wird dort ausdrücklich als
   einzige Ausnahme benannt (Cache Storage, nicht local/sessionStorage).

## Entscheidung

Noch offen: Der Product Owner wählt zwischen A und B, bevor Slice 5 gebaut wird.

## Konsequenzen

Werden nach der Wahl ergänzt.
