import { unusedSavingsLevers, type AdvisorAssessmentBrief, type AdvisorOpeningBrief, type AdvisorTask, type CaseDigest } from '@steuereule/core'

/** What the model is told for a savings plan: the levers come from the app, not from its memory. */
function savingsPlanPrompt(digest: CaseDigest): string {
  const levers = unusedSavingsLevers(digest)
  return [
    'Aufgabe für diese Antwort: der **Sparplan**. Der Nutzer will wissen, was er gerade liegen lässt. Arbeite den ganzen Fall durch, nicht nur eine Frage.',
    `1. Lies zuerst in einer Runde \`gestaltung\` und \`kennzahlen\` mit \`lookup_tax_knowledge\`. Jeder Satz, jede Pauschale und jeder Höchstbetrag in deiner Antwort muss aus \`kennzahlen\` für das Steuerjahr ${digest.taxYear} stammen, nicht aus deinem Gedächtnis: Die Werte ändern sich jährlich (Entfernungspauschale, Kinderbetreuung, Freibeträge).`,
    '2. Geh diese Liste durch. Sie stammt aus der App und nennt, was der Fall nach dem Fall-Überblick noch nicht nutzt („offen“) oder wofür die App kein Feld hat („fragen“):',
    ...levers.map((lever) => `   - ${lever.label} (${lever.state === 'unused' ? 'offen' : 'fragen'})`),
    '3. Für jeden Hebel, der zur Lage passen kann: Reichen die Angaben, rechne die Wirkung mit den Werkzeugen und bereite einen Entwurf vor. Reichen sie nicht, gehört der Hebel in die Rückfragen.',
    '4. Antworte in genau dieser Gliederung: „**Das kannst du jetzt mitnehmen**“ (mit Betrag, höchster zuerst), „**Dazu brauche ich eine Angabe von dir**“ (höchstens fünf Fragen, die wichtigsten zuerst, mit `ask_questions` wenn es Ja/Nein-Fragen sind), „**Für das laufende und das nächste Jahr**“ (was er ändern sollte, damit er künftig weniger zahlt).',
    '5. Nenne keinen Betrag, den kein Werkzeug gerechnet hat, auch keinen überschlagenen Jahresbetrag („ca. 1.200 €“). Fehlen Angaben für die Rechnung, nenne den Satz aus `kennzahlen` und frage nach dem, was fehlt. Was nichts bringt, lässt du weg oder sagst es in einem Satz.',
    '6. Deine Werkzeugrunden sind begrenzt: Rufe in einer Runde mehrere Werkzeuge zusammen auf (alle Nachschlage-Aufrufe in einer Runde, alle Simulationen und Entwürfe in einer Runde). Schlage höchstens drei Abschnitte nach.',
    '7. Schließe immer mit der gegliederten Antwort in Worten ab, auch wenn noch Hebel offen sind, und setze vorher mit `plan_steps` jeden Schritt auf erledigt. Eine Antwort, die nur einen Entwurf nennt, ist kein Sparplan.',
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

const euro = (value: number): string => `${value.toLocaleString('de-DE')} €`

/**
 * The opening of a new conversation (ADR-0067 §11). The owl speaks first; the figures come from
 * the app, so every amount in the opening is the app's own calculation.
 */
function openingPrompt(digest: CaseDigest, opening: AdvisorOpeningBrief | undefined): string {
  const figures = opening?.figures ?? []
  const lines = [
    'Aufgabe für diese Antwort: die **Eröffnung**. Der Nutzer hat ein neues Gespräch geöffnet und noch nichts gefragt. Du sprichst zuerst, aus dem, was die App über den Fall weiß.',
    'Die Nachricht des Nutzers in diesem Zug ist ein technischer Platzhalter; beziehe dich nicht auf sie.',
    'Leitplanken (unverhandelbar):',
    '- Beträge: Nenne nur Beträge aus dieser Liste. Die App hat sie berechnet. Brauchst du einen anderen Betrag, rechne ihn mit `compute_income_tax` oder `simulate_tax_delta`; sonst nenne keinen. Keine Überschläge, keine „ca.“-Werte.',
    '- Pauschalen und Sätze (z. B. je Kilometer, je Homeoffice-Tag) nur aus `kennzahlen` für das Steuerjahr ' + digest.taxYear + ' (lies sie mit `lookup_tax_knowledge`), nie aus dem Gedächtnis.',
    '- Lege in der Eröffnung keine Entwürfe an (`stage_field_draft`, `propose_two_paths` nicht aufrufen). Entwürfe entstehen erst aus der Antwort des Nutzers.',
    'Von der App berechnete Kennzahlen:',
    ...(figures.length === 0 ? ['- keine (es gibt noch nichts zu rechnen)'] : figures.map((figure) => `- ${figure.label}: ${euro(figure.amountEur)}`)),
  ]
  if (opening?.stage === 'partial') {
    lines.push(
      'Stufe: **unvollständig**. Für eine Analyse fehlt noch:',
      ...opening.gaps.map((gap) => `- ${gap}`),
      'Sag in zwei, drei Sätzen, was du schon weißt, und frag dann mit `ask_questions` nach dem, was fehlt: eine Runde, höchstens vier Fragen, jede mit antippbaren Antworten. Analysiere noch nicht.',
    )
  } else {
    lines.push(
      'Stufe: **ausreichend**. Analysiere den Fall frei: Was fällt dir auf, wo liegt Geld, was sollte der Nutzer als Nächstes tun. Arbeite im Interesse des Nutzers (B10).',
    )
  }
  if (opening?.unbackedAmounts && opening.unbackedAmounts.length > 0) {
    lines.push(
      `Zweiter Versuch: Deine erste Fassung nannte ${opening.unbackedAmounts.map(euro).join(', ')}, und das hat die App nicht berechnet. Nenne diese Beträge nicht; halte dich an die Liste oder rechne mit den Werkzeugen.`,
    )
  }
  return lines.join('\n')
}

export function taskPrompt(task: AdvisorTask, digest: CaseDigest, assessment: AdvisorAssessmentBrief | undefined, opening?: AdvisorOpeningBrief): string {
  if (task === 'opening') return openingPrompt(digest, opening)
  return task === 'savings-plan' ? savingsPlanPrompt(digest) : assessmentCheckPrompt(assessment)
}
