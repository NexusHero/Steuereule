import { unusedSavingsLevers, type AdvisorAssessmentBrief, type AdvisorTask, type CaseDigest } from '@steuereule/core'

/** What the model is told for a savings plan: the levers come from the app, not from its memory. */
function savingsPlanPrompt(digest: CaseDigest): string {
  const levers = unusedSavingsLevers(digest)
  return [
    'Aufgabe für diese Antwort: der **Sparplan**. Der Nutzer will wissen, was er gerade liegen lässt. Arbeite den ganzen Fall durch, nicht nur eine Frage.',
    '1. Lies zuerst `gestaltung` mit `lookup_tax_knowledge`.',
    '2. Geh diese Liste durch. Sie stammt aus der App und nennt, was der Fall nach dem Fall-Überblick noch nicht nutzt („offen“) oder wofür die App kein Feld hat („fragen“):',
    ...levers.map((lever) => `   - ${lever.label} (${lever.state === 'unused' ? 'offen' : 'fragen'})`),
    '3. Für jeden Hebel, der zur Lage passen kann: Reichen die Angaben, rechne die Wirkung mit den Werkzeugen und bereite einen Entwurf vor. Reichen sie nicht, gehört der Hebel in die Rückfragen.',
    '4. Antworte in genau dieser Gliederung: „**Das kannst du jetzt mitnehmen**“ (mit Betrag, höchster zuerst), „**Dazu brauche ich eine Angabe von dir**“ (höchstens fünf Fragen, die wichtigsten zuerst, mit `ask_questions` wenn es Ja/Nein-Fragen sind), „**Für das laufende und das nächste Jahr**“ (was er ändern sollte, damit er künftig weniger zahlt).',
    '5. Nenne keinen Betrag, den kein Werkzeug gerechnet hat. Was nichts bringt, lässt du weg oder sagst es in einem Satz.',
  ].join('\n')
}

function assessmentCheckPrompt(assessment: AdvisorAssessmentBrief | undefined): string {
  if (!assessment || !assessment.recorded) {
    return [
      'Aufgabe für diese Antwort: der **Bescheid-Check**. Der Nutzer hat seinen Steuerbescheid noch nicht in der App erfasst.',
      'Erkläre in zwei bis drei Sätzen, warum sich das Prüfen lohnt (das Finanzamt weicht oft ab, die Einspruchsfrist ist ein Monat), und bitte ihn, die Werte des Bescheids in der Maske „Bescheid“ einzutragen. Erfinde keine Abweichungen.',
    ].join('\n')
  }
  const days = assessment.appealDaysLeft
  return [
    'Aufgabe für diese Antwort: der **Bescheid-Check**. Vergleiche den Steuerbescheid mit der Erklärung. Die Zahlen stammen aus dem Abgleich der App:',
    `- Stand: ${assessment.status}`,
    `- Einspruchsfrist: ${days === null ? 'unbekannt, weil das Datum des Bescheids fehlt' : days > 0 ? `noch ${days} Tage` : 'abgelaufen'}`,
    ...(assessment.calculationIncomplete ? ['- Der Abgleich ist unvollständig, weil Angaben der Erklärung fehlen. Sage das dazu.'] : []),
    ...(assessment.deviations.length === 0
      ? ['- Keine Abweichung zwischen Bescheid und Erklärung.']
      : assessment.deviations.map((d) => `- Abweichung „${d.field}“: Bescheid ${d.assessedEur} €, Erklärung ${d.calculatedEur} €, Unterschied ${d.differenceEur} €`)),
    'Lies `verfahren` mit `lookup_tax_knowledge`. Erkläre jede Abweichung in einem Satz und was sie für den Nutzer in Euro bedeutet. Nenne nur diese Zahlen.',
    'Geht eine Abweichung zu Lasten des Nutzers und läuft die Frist noch: Empfiehl den Einspruch, nenne die Frist und formuliere den Einspruch aus (Steuernummer und Datum als Platzhalter, Begründung konkret). Ist die Frist abgelaufen: nenne die Wege nach Bestandskraft (§ 172, § 173, § 129 AO). Gibt es keine Abweichung zu seinen Lasten: sage das klar und rate vom Einspruch ab.',
    'Prüfe am Ende die Vorauszahlungen für das Folgejahr: Bitte den Nutzer nachzusehen, ob der Bescheid welche festsetzt, und sage, wann eine Herabsetzung lohnt.',
  ].join('\n')
}

export function taskPrompt(task: AdvisorTask, digest: CaseDigest, assessment: AdvisorAssessmentBrief | undefined): string {
  return task === 'savings-plan' ? savingsPlanPrompt(digest) : assessmentCheckPrompt(assessment)
}
