// Where the poppler tools are, looked up in fixed system folders only. Running a tool by its bare
// name would search the caller's PATH, and a writable folder there could put another program in its
// place (Sonar S4036). Dev-time and CI tool, never a runtime dependency.
import { existsSync } from 'node:fs'
import path from 'node:path'

/** Linux packages, a manual install, Homebrew on Apple silicon and on Intel. */
const FESTE_ORDNER = ['/usr/bin', '/usr/local/bin', '/opt/homebrew/bin']

/** The absolute path of a poppler tool such as `pdftotext`. */
export function werkzeug(name) {
  for (const ordner of FESTE_ORDNER) {
    const datei = path.join(ordner, name)
    if (existsSync(datei)) return datei
  }
  throw new Error(`${name} nicht gefunden in ${FESTE_ORDNER.join(', ')}; poppler-utils installieren.`)
}
