// Builds the before/after table (#450 Teil 2A) from two reports of measure.mjs.
//   node e2e/navigation-efficiency/compare.mjs /tmp/navigation-efficiency/baseline.json /tmp/navigation-efficiency/neu.json > table.md
import { readFileSync } from 'node:fs'

const TASK_LABELS = { 'erster-durchlauf': 'Erster Durchlauf', korrektur: 'Korrektur', unterbrechung: 'Unterbrechung', wiedereinstieg: 'Wiedereinstieg' }
const PERSONA_LABELS = { lena: 'Lena (#01)', brenner: 'Brenner CH (#02)', weber: 'Weber Ehepaar (#04)', meyer: 'Meyer Rentner (#05)', richter: 'Richter alleinerziehend (#07)' }

export function compareTable(before, after) {
  const delta = (a, b) => (a === undefined || b === undefined ? '–' : `${b - a > 0 ? '+' : ''}${b - a}`)
  const rows = []
  for (const persona of Object.keys(PERSONA_LABELS)) {
    for (const task of Object.keys(TASK_LABELS)) {
      const a = before.personas[persona]?.[task]
      const b = after.personas[persona]?.[task]
      if (!a && !b) continue
      rows.push(
        `| ${PERSONA_LABELS[persona]} | ${TASK_LABELS[task]} | ${a?.interactions ?? '–'} | ${b?.interactions ?? '–'} | ${delta(a?.interactions, b?.interactions)} | ${a?.screens ?? '–'} | ${b?.screens ?? '–'} | ${a ? (a.ms / 1000).toFixed(1) : '–'} | ${b ? (b.ms / 1000).toFixed(1) : '–'} | ${a?.slowestInteractionMs ?? '–'} | ${b?.slowestInteractionMs ?? '–'} |`,
      )
    }
  }
  return [
    '| Persona | Aufgabe | Interaktionen vorher | nachher | Δ | Bildschirme vorher | nachher | Zeit vorher (s) | nachher (s) | langsamste Interaktion vorher (ms) | nachher (ms) |',
    '| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows,
  ].join('\n')
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [before, after] = process.argv.slice(2).map((p) => JSON.parse(readFileSync(p, 'utf8')))
  console.log(compareTable(before, after))
}
