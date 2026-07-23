// German-language, human-readable rendering of the same ExportDocument the JSON
// representation returns (ADR-0013 §4/§7 — "one data path, two renderings"). Fully
// self-contained: no external stylesheet/font/network fetch, since PdfRenderer must
// never need network access to lay a page out. Print-styled for A4.
//
// Honesty (ADR-0013 §8): this copy states plainly that no tax data is held yet — it
// never claims a "Belege ZIP" or anything else not actually true of this slice.
import type { ExportDocument } from './export-document.js'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatGermanTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}

function renderProfileSection(profile: ExportDocument['profile']): string {
  if (!profile) {
    return '<p class="honest-note">Es wurde noch kein Profil gespeichert.</p>'
  }
  return `
    <table>
      <tbody>
        <tr><th>Vorname</th><td>${escapeHtml(profile.firstName)}</td></tr>
        <tr><th>Nachname</th><td>${escapeHtml(profile.lastName)}</td></tr>
        <tr><th>Steuerliche Identifikationsnummer</th><td>${escapeHtml(profile.steuerId)}</td></tr>
        <tr><th>Steuernummer</th><td>${profile.steuernummer ? escapeHtml(profile.steuernummer) : '—'}</td></tr>
        <tr><th>Angelegt am</th><td>${formatGermanTimestamp(profile.createdAt)}</td></tr>
        <tr><th>Zuletzt geändert am</th><td>${formatGermanTimestamp(profile.updatedAt)}</td></tr>
      </tbody>
    </table>`
}

function renderAccessLogRows(entries: ExportDocument['accessLog']): string {
  if (entries.length === 0) {
    return '<tr><td colspan="3">Keine Zugriffe protokolliert.</td></tr>'
  }
  return entries
    .map(
      (entry) => `
      <tr>
        <td>${escapeHtml(entry.action)}</td>
        <td>${escapeHtml(entry.resource)}</td>
        <td>${formatGermanTimestamp(entry.createdAt)}</td>
      </tr>`,
    )
    .join('')
}

/** Builds the full HTML document PdfRenderer.renderPdf() prints to A4 — the same
 *  assembled ExportDocument the JSON representation returns, human-readable in German. */
export function buildExportReportHtml(document: ExportDocument): string {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>SteuerEule – Datenauskunft</title>
    <style>
      @page { size: A4; margin: 20mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 12px; }
      h1 { font-size: 18px; margin-bottom: 4px; }
      h2 { font-size: 14px; margin-top: 20px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
      p.meta { color: #555; margin-top: 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
      th { width: 40%; color: #333; font-weight: 600; }
      .honest-note { color: #555; font-style: italic; }
    </style>
  </head>
  <body>
    <h1>SteuerEule – Datenauskunft (DSGVO Art. 15/20)</h1>
    <p class="meta">Erstellt am ${escapeHtml(formatGermanTimestamp(document.exportedAt))} · Schema-Version ${escapeHtml(document.schemaVersion)}</p>

    <h2>Konto</h2>
    <table>
      <tbody>
        <tr><th>E-Mail</th><td>${escapeHtml(document.account.email)}</td></tr>
        <tr><th>Name</th><td>${escapeHtml(document.account.name)}</td></tr>
        <tr><th>E-Mail bestätigt</th><td>${document.account.emailVerified ? 'Ja' : 'Nein'}</td></tr>
        <tr><th>Konto angelegt am</th><td>${formatGermanTimestamp(document.account.createdAt)}</td></tr>
        <tr><th>Anmeldeverfahren</th><td>${document.account.authProviders.map(escapeHtml).join(', ') || '—'}</td></tr>
      </tbody>
    </table>

    <h2>Profil</h2>
    ${renderProfileSection(document.profile)}

    <h2>Steuerliche Daten</h2>
    <p class="honest-note">
      Es sind aktuell keine steuerlichen Daten hinterlegt — dieser Bereich ist ehrlich leer,
      solange kein Steuerjahr-Modell existiert.
    </p>

    <h2>Zugriffsprotokoll (eigene Zugriffe)</h2>
    <table>
      <thead><tr><th>Aktion</th><th>Ressource</th><th>Zeitpunkt</th></tr></thead>
      <tbody>${renderAccessLogRows(document.accessLog)}</tbody>
    </table>
  </body>
</html>`
}
