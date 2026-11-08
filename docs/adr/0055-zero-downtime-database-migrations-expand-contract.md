# ADR-0055 — Zero-Downtime Database Migrations (Expand and Contract Pattern)

- **Status:** Accepted (FAANG Engineering Standard)
- **Date:** 2026-11-08
- **Deciders:** Steuereule Engineering
- **Applies to:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`, Google Cloud Run Rollouts

## Kontext

Auf Google Cloud Run (ADR-0053) und Kubernetes (Produkt-ADR-049) werden Deployments als Rolling Updates ausgeführt:
Während eine neue Version ausgerollt wird, laufen alte Container-Instanzen (Revision $N$) und neue Instanzen (Revision $N+1$) für mehrere Minuten gleichzeitig nebeneinander gegen dieselbe PostgreSQL-Produktionsdatenbank.

Führt ein Release eine destruktive oder umbenennende Datenbank-Migration aus (z. B. Spalte umbenennen, Spalte löschen, NOT NULL ohne Default hinzufügen), bevor alle Alt-Container beendet sind, stürzen laufende Alt-Instanzen mit SQL-Fehlern (`column does not exist`) ab. Ebenso schlägt ein Rollback fehl, wenn die Datenbank bereits inkompatibel mutiert wurde.

## Entscheidung

Alle zukünftigen Datenbankschema-Änderungen in `apps/api/prisma/` unterliegen verpflichtend dem **Expand-and-Contract-Muster (Parallellauf)** in mindestens zwei separaten Release-Zyklen:

### Phase 1: Expand (Additiv & Abwärtskompatibel)
1. **Neue Spalten/Tabellen sind immer optional:** Neue Spalten werden als `nullable` oder mit sicherem Default-Wert angelegt.
2. **Keine Spaltenumbenennung in einem Schritt:** Ein Feld `oldField` wird niemals per SQL-Rename umbenannt. Stattdessen wird `newField` additiv hinzugefügt.
3. **Dual Writing (Schreib-Doppelung):** Die Anwendungsschicht (Revision $N+1$) schreibt synchron in beide Felder (`oldField` und `newField`), liest aber weiterhin aus `oldField`.
4. **Alte Container überleben:** Revision $N$ liest und schreibt ungestört weiterhin in `oldField`.

### Phase 2: Read Switch & Backfill
1. **Daten-Synchronisation:** Bestehende Alt-Datensätze werden idempotent migriert (`UPDATE table SET newField = oldField WHERE newField IS NULL`).
2. **Lese-Umschaltung:** Der Code liest nun aus `newField`, schreibt weiterhin in beide.

### Phase 3: Contract (Bereinigung)
1. **Erst im nachfolgenden Release:** Wenn Revision $N$ vollständig heruntergefahren ist und die Stabilität von $N+1$ bewiesen ist, wird im nächsten Deployment (Revision $N+2$) das alte Feld `oldField` per Migration gelöscht und der Dual-Write-Code entfernt.

### Unmittelbar verbotene Migrations-Praktiken (CI-Sperre)
- ❌ **`ALTER TABLE ... DROP COLUMN`** im selben Release wie Code-Änderungen, die das Feld noch referenzieren.
- ❌ **`ALTER TABLE ... RENAME COLUMN`** (ist immer destruktiv für alte Container).
- ❌ **`ALTER TABLE ... ADD COLUMN ... NOT NULL`** ohne Default-Wert auf befüllten Tabellen (blockiert Schreibvorgänge während des Migrationslaufs).

## Konsequenzen

- **Vorteile:**
  - **Zero Downtime:** Nahtloses Rolling Deployment auf Google Cloud Run ohne 500er-Spikes.
  - **Rollback-Sicherheit:** Revision $N+1$ kann jederzeit auf Revision $N$ zurückgerollt werden, da das Datenbankschema während Phase 1 vollständig abwärtskompatibel bleibt.
- **Nachteile:**
  - Brechende Schema-Änderungen erfordern zwei Releases statt eines einzigen Schnellschusses (Disziplin und Planung erforderlich).
