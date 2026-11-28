// The official PDFs the ELSTER fill-in help is read from (ADR-0101 §16), one per form and tax year.
//
// - The Anlage EÜR and the Umsatzsteuererklärung (USt 2 A) are published as BMF letters with the form
//   attached. `url` is the BMF's own address; the BMF takes letters off its site after about two
//   years, and the download then takes the Internet Archive capture of that same address.
// - The Hauptvordruck ESt 1 A and the Anlage Sonstiges (where § 10d lives since 2021) are the NET
//   Vordrucke of the Formular-Management-System, already checked in for the printout (ADR-0050)
//   under apps/api/assets/vordrucke/<year>/ and pinned in apps/api/src/printout/vordrucke-<year>.json.
//   They are read from there, because the FMS stamps each download, so its hash changes per request.
//
// Not listed, because no official public PDF exists: Anlage G and Anlage S (the FMS shows only a
// notice that forms for Gewinneinkünfte are filed electronically) and the Gewerbesteuererklärung
// GewSt 1 A (not provided from 2016 on). GewSt 1 A is read from the ELSTER help instead
// (elster-help.mjs); docs/research/self-employed-forms.html has the details.
// Tax year 2026 of ESt 1 A / Anlage Sonstiges is not yet in the FMS (November 2026).

const BMF = 'https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten'

const bmf = (pathInSite, sha256) => ({ kind: 'bmf', url: `${BMF}/${pathInSite}`, sha256 })

function repo(year, file, formId) {
  const yy = String(year).slice(-2)
  return {
    kind: 'repo',
    file: `apps/api/assets/vordrucke/${year}/${file}`,
    url: `https://www.formulare-bfinv.de/ffw/catalog/makePDF.do?path=${encodeURIComponent(`catalog://Steuerformulare/est/est${yy}/${formId}_${yy}`)}`,
  }
}

export const SOURCES = {
  euer: {
    2022: bmf('Einkommensteuer/2022-09-01-standardisierte-einnahmenueberschussrechnung-nach-paragraf-60-absatz-4-EStDV-anlage-EUER-2022.pdf', '2fc7138fc97c24392c775332f921bb7812d9aa9c0cb02b60f03d0fe185236b9d'),
    2023: bmf('Einkommensteuer/2023-08-31-standardisierte-einnahmenueberschussrechnung-nach-paragraf-60-absatz-4-EStDV-anlage-EUER-2023.pdf', 'c668f58839939abf3431a7dd7e7ff8ef7f56e757a411b95e8e142fde7115271b'),
    2024: bmf('Einkommensteuer/2024-09-02-anlage-EUER-2024.pdf', '8d1384f1a43f646b79a8be53a254d940828e0431cc7042145b9274ea871d45a8'),
    2025: bmf('Einkommensteuer/2025-08-29-anlage-EUER-2025.pdf', 'b69b5cf0a982d28cbce20644e67677a36be0bc494bed4fae2310dc08230a1599'),
    2026: bmf('Einkommensteuer/2026-09-01-anlage-EUER-2026.pdf', '03d3033acc5c5a126729e58743128596ae39193759c55b207872da9432b83a8f'),
  },
  ust: {
    2022: bmf('Umsatzsteuer/2021-12-23-muster-USterklaerung-2022.pdf', 'c6614303fae4cf4759d2af74b722280e964afd64f1bfa4325dce231a3f51aaa4'),
    2023: bmf('Umsatzsteuer/2022-12-21-muster-der-umsatzsteuererklaerung-2023.pdf', '5fdf5b2b6669d972f2ca601dfe714d8114d6623a6b9df4585f6c7f9bf4ee8b34'),
    2024: bmf('Umsatzsteuer/2023-11-06-muster-der-umsatzsteuererklaerung-2024.pdf', '752566bf45508a95f3827036503e1cf89f11689245bccb53c4a27e65080e6f06'),
    2025: bmf('Umsatzsteuer/2024-12-09-muster-umsatzsteuererklaerung-2025.pdf', 'e5cf386870a464913ab7f8b599ed171624cab581ed33b3520899d4495db85423'),
    2026: bmf('Umsatzsteuer/2025-12-29-muster-USt-erklaerung-2026.pdf', '6b1225efbfde4d23ce1dd86fe899a33caf443443d96057dcee379414a36eab25'),
  },
  'est-1-a': Object.fromEntries([2022, 2023, 2024, 2025].map((y) => [y, repo(y, 'est-1-a.pdf', '034037')])),
  'anlage-sonstiges': Object.fromEntries([2022, 2023, 2024, 2025].map((y) => [y, repo(y, 'anlage-sonstiges.pdf', '035008')])),
}
